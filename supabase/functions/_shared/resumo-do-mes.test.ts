import assert from 'node:assert/strict'

import {
  criarTratadorDoResumo,
  type DependenciasDoResumo,
  iguaisEmTempoConstante,
  type LinhaDoResumo,
  montarEmailDoResumo,
  agruparResumos,
  URL_DO_RESEND,
} from './resumo-do-mes.ts'

const TOKEN = 'token-de-teste-do-cron'
const CONSULTORIA = 'c0000000-0000-4000-8000-00000000000a'

function linha(mes: string, extra: Partial<LinhaDoResumo> = {}): LinhaDoResumo {
  return {
    consultoriaId: CONSULTORIA,
    consultoriaNome: 'Filtroville <Ambiental>',
    mesDoResumo: '2026-10-01',
    mes,
    horasTotal: 23,
    reaisCentavos: 230000,
    horasEstimadas: true,
    juntandoDados: false,
    prazoPrevistas: 4,
    prazoCumpridas: 3,
    renovacoesVencendo: 2,
    renovacoesProtegidas: 2,
    ...extra,
  }
}

const LINHAS = [linha('2026-10-01'), linha('2026-09-01', { horasTotal: 20.5, prazoCumpridas: 2 })]

const VARIAVEIS: Record<string, string> = {
  CRON_TOKEN: TOKEN,
  RESEND_API_KEY: 're_chave_de_teste',
  AVISO_REMETENTE: 'Grama <avisos@exemplo.test>',
}

/** Banco falso: envios gravados e reservas (compartilhável entre duas execuções). */
function novoBanco() {
  return { enviados: new Set<string>(), reservas: new Set<string>() }
}

interface Opcoes {
  banco?: ReturnType<typeof novoBanco>
  /** Resposta do Resend: status HTTP, ou 'sem_resposta' (fetch lança, ex.: tempo esgotado). */
  resend?: () => number | 'sem_resposta'
  falharAoRegistrar?: boolean
}

function montar(variaveis: Record<string, string> = VARIAVEIS, opcoes: Opcoes = {}) {
  const banco = opcoes.banco ?? novoBanco()
  const { enviados, reservas } = banco
  const chamadas: { url: string; init: RequestInit }[] = []
  const log: string[] = []
  const deps: DependenciasDoResumo = {
    env: (nome) => variaveis[nome],
    fetch: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      await new Promise((resolver) => setTimeout(resolver, 1))
      const status = opcoes.resend?.() ?? 200
      if (status === 'sem_resposta') throw new Error('tempo esgotado')
      return new Response('{"id":"x"}', { status })
    }) as typeof fetch,
    resumosPendentes: () =>
      Promise.resolve(LINHAS.filter((l) => !enviados.has(`${l.consultoriaId}:${l.mesDoResumo}`))),
    emailsDaGestao: () => Promise.resolve(['gestao@exemplo.test']),
    // Como no banco: só uma execução reserva; envio gravado não reserva.
    reservarEnvio: (consultoriaId, mes) => {
      const chave = `${consultoriaId}:${mes}`
      if (enviados.has(chave) || reservas.has(chave)) return Promise.resolve(false)
      reservas.add(chave)
      return Promise.resolve(true)
    },
    liberarReserva: (consultoriaId, mes) => {
      reservas.delete(`${consultoriaId}:${mes}`)
      return Promise.resolve()
    },
    registrarEnvio: (consultoriaId, mes) => {
      if (opcoes.falharAoRegistrar) return Promise.reject(new Error('registrar'))
      const chave = `${consultoriaId}:${mes}`
      const novo = !enviados.has(chave)
      enviados.add(chave)
      return Promise.resolve(novo)
    },
    resumoDeTeste: () =>
      Promise.resolve({ linhas: LINHAS, email: 'operador@exemplo.test', erro: null }),
    registrar: (l) => log.push(l),
  }
  return { tratar: criarTratadorDoResumo(deps), chamadas, log, banco }
}

function pedido(token: string | null, corpo: unknown = {}, autorizacao?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token !== null) headers.set('x-cron-token', token)
  if (autorizacao) headers.set('Authorization', autorizacao)
  return new Request('http://localhost/enviar-resumo-do-mes', {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
}

Deno.test('token errado ou ausente é recusado sem enviar nada', async () => {
  const { tratar, chamadas } = montar()
  for (const token of ['outro-token', null, `${TOKEN}x`]) {
    const resposta = await tratar(pedido(token))
    assert.equal(resposta.status, 401)
    assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
  }
  assert.equal(chamadas.length, 0)
  assert.equal(iguaisEmTempoConstante(TOKEN, TOKEN), true)
  assert.equal(iguaisEmTempoConstante(TOKEN, 'x'), false)
})

Deno.test('envia um e-mail por consultoria e é idempotente no mesmo mês', async () => {
  const { tratar, chamadas, log } = montar()
  const primeira = await tratar(pedido(TOKEN))
  assert.equal(primeira.status, 200)
  assert.deepEqual(await primeira.json(), {
    consultorias: 1,
    enviados: 1,
    sem_destinatarios: 0,
    em_andamento: 0,
    falhas: 0,
  })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0]?.url, URL_DO_RESEND)
  const corpo = JSON.parse(String(chamadas[0]?.init.body)) as Record<string, unknown>
  assert.deepEqual(corpo.to, ['gestao@exemplo.test'])
  assert.match(String(corpo.text), /23,0 h/)
  assert.match(String(corpo.html), /Filtroville &lt;Ambiental&gt;/)

  const segunda = await tratar(pedido(TOKEN))
  assert.deepEqual(await segunda.json(), {
    consultorias: 0,
    enviados: 0,
    sem_destinatarios: 0,
    em_andamento: 0,
    falhas: 0,
  })
  assert.equal(chamadas.length, 1)
  assert.ok(log.every((l) => !l.includes('@') && !l.includes('23')))
})

Deno.test('recusa do Resend: libera a reserva e a próxima execução envia', async () => {
  let status = 500
  const { tratar, chamadas, banco, log } = montar(VARIAVEIS, { resend: () => status })
  const primeira = await tratar(pedido(TOKEN))
  assert.equal(primeira.status, 502)
  assert.deepEqual(await primeira.json(), {
    consultorias: 1,
    enviados: 0,
    sem_destinatarios: 0,
    em_andamento: 0,
    falhas: 1,
  })
  assert.equal(banco.reservas.size, 0)
  assert.equal(banco.enviados.size, 0)
  assert.ok(log.some((l) => l.includes('falha_no_envio')))

  status = 200
  const segunda = await tratar(pedido(TOKEN))
  assert.equal(segunda.status, 200)
  assert.equal(((await segunda.json()) as { enviados: number }).enviados, 1)
  assert.equal(chamadas.length, 2)
})

Deno.test('sem resposta do Resend: a reserva fica e repetir logo não reenvia', async () => {
  let resposta: number | 'sem_resposta' = 'sem_resposta'
  const { tratar, chamadas, banco } = montar(VARIAVEIS, { resend: () => resposta })
  const primeira = await tratar(pedido(TOKEN))
  assert.equal(primeira.status, 502)
  assert.equal(banco.reservas.size, 1)

  resposta = 200
  const segunda = await tratar(pedido(TOKEN))
  assert.deepEqual(await segunda.json(), {
    consultorias: 1,
    enviados: 0,
    sem_destinatarios: 0,
    em_andamento: 1,
    falhas: 0,
  })
  assert.equal(chamadas.length, 1)
})

Deno.test('falha ao gravar depois de enviar: a reserva fica e repetir não reenvia', async () => {
  const { tratar, chamadas, banco, log } = montar(VARIAVEIS, { falharAoRegistrar: true })
  const primeira = await tratar(pedido(TOKEN))
  assert.equal(primeira.status, 502)
  assert.deepEqual(await primeira.json(), {
    consultorias: 1,
    enviados: 0,
    sem_destinatarios: 0,
    em_andamento: 0,
    falhas: 1,
  })
  assert.equal(chamadas.length, 1)
  assert.equal(banco.reservas.size, 1)
  assert.ok(log.some((l) => l.includes('"etapa":"registro"')))

  // O envio não foi gravado (continua pendente), mas a reserva impede o segundo e-mail.
  const segunda = await tratar(pedido(TOKEN))
  assert.equal(segunda.status, 200)
  assert.deepEqual(await segunda.json(), {
    consultorias: 1,
    enviados: 0,
    sem_destinatarios: 0,
    em_andamento: 1,
    falhas: 0,
  })
  assert.equal(chamadas.length, 1)
})

Deno.test('duas execuções ao mesmo tempo: só uma envia', async () => {
  const banco = novoBanco()
  const a = montar(VARIAVEIS, { banco })
  const b = montar(VARIAVEIS, { banco })
  const respostas = await Promise.all([a.tratar(pedido(TOKEN)), b.tratar(pedido(TOKEN))])
  const corpos = (await Promise.all(respostas.map((r) => r.json()))) as {
    enviados: number
    em_andamento: number
    falhas: number
  }[]
  assert.equal(a.chamadas.length + b.chamadas.length, 1)
  assert.deepEqual(corpos.map((c) => c.enviados).sort(), [0, 1])
  assert.deepEqual(corpos.map((c) => c.em_andamento).sort(), [0, 1])
  assert.ok(corpos.every((c) => c.falhas === 0))
  assert.equal(banco.enviados.size, 1)
})

Deno.test('sem RESEND_API_KEY: erro tratado (503), sem enviar', async () => {
  const { tratar, chamadas } = montar({ CRON_TOKEN: TOKEN, AVISO_REMETENTE: 'Grama <a@b.test>' })
  const resposta = await tratar(pedido(TOKEN))
  assert.equal(resposta.status, 503)
  assert.deepEqual(await resposta.json(), { erro: 'configuracao_ausente' })
  assert.equal(chamadas.length, 0)
})

Deno.test('teste pela central vai só para o e-mail de quem chama', async () => {
  const { tratar, chamadas } = montar()
  const resposta = await tratar(
    pedido(null, { teste: true, consultoriaId: CONSULTORIA }, 'Bearer jwt-do-operador'),
  )
  assert.equal(resposta.status, 200)
  const corpo = JSON.parse(String(chamadas[0]?.init.body)) as Record<string, unknown>
  assert.deepEqual(corpo.to, ['operador@exemplo.test'])
  const resumo = agruparResumos(LINHAS)[0]
  assert.ok(resumo)
  assert.match(montarEmailDoResumo(resumo).texto, /\+2,5 h contra o mês anterior/)
})
