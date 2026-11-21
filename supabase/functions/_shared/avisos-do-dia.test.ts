import assert from 'node:assert/strict'

import {
  criarTratadorDosAvisos,
  type DependenciasDosAvisos,
  type ItemDoResumo,
  linhaDoItem,
  MAXIMO_POR_CHAMADA,
  montarEmailDoResumoDiario,
  type PendenteDoDia,
  sufixoDosDias,
} from './avisos-do-dia.ts'
import { lerLinkDeDescadastro } from './link-de-descadastro.ts'
import { URL_DO_RESEND } from './resend.ts'

const TOKEN = 'token-de-teste-do-cron'
const ASSINATURA = 'segredo-de-teste-da-assinatura'
const CONSULTORIA = 'c0000000-0000-4000-8000-00000000000a'

const VARIAVEIS: Record<string, string> = {
  CRON_TOKEN: TOKEN,
  RESEND_API_KEY: 're_chave_de_teste',
  AVISO_REMETENTE: 'Grama <avisos@exemplo.test>',
  AVISO_ASSINATURA: ASSINATURA,
  SUPABASE_URL: 'https://projeto.exemplo.test',
  LINK_DO_BETA: 'https://beta.exemplo.test/',
}

function pendente(n: number, extra: Partial<PendenteDoDia> = {}): PendenteDoDia {
  return {
    consultoriaId: CONSULTORIA,
    consultoriaNome: 'Filtroville',
    membroId: `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    membroNome: '<Ana> Ribeiro',
    email: `pessoa${String(n)}@exemplo.test`,
    papel: 'equipe',
    dia: '2026-11-23',
    ...extra,
  }
}

function item(extra: Partial<ItemDoResumo> = {}): ItemDoResumo {
  return {
    grupo: 'meus',
    tipoLinha: 'ocorrencia',
    id: '11111111-1111-4111-8111-111111111111',
    prazo: '2026-11-21',
    dias: -2,
    codigo: 'C-01',
    titulo: 'Monitoramento de efluentes',
    empreendimentoNome: 'Metalúrgica Açores',
    unidadeNome: 'Matriz',
    licenca: 'LAO 1/2024',
    ...extra,
  }
}

interface Opcoes {
  pendentes?: PendenteDoDia[]
  itens?: (membroId: string) => ItemDoResumo[]
  /** Resposta do Resend: status HTTP, ou 'sem_resposta' (fetch lança). */
  resend?: () => number | 'sem_resposta'
  falharPendentes?: boolean
  falharAoRegistrar?: boolean
  variaveis?: Record<string, string>
}

function montar(opcoes: Opcoes = {}) {
  const variaveis = opcoes.variaveis ?? VARIAVEIS
  const reservas = new Map<string, string>()
  const resultados: { id: string; situacao: string; provedorId?: string | null }[] = []
  const chamadas: { url: string; init: RequestInit }[] = []
  const esperas: number[] = []
  const log: string[] = []
  const deps: DependenciasDosAvisos = {
    env: (nome) => variaveis[nome],
    fetch: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      const status = opcoes.resend?.() ?? 200
      if (status === 'sem_resposta') throw new Error('tempo esgotado')
      return new Response(JSON.stringify({ id: `re_${String(chamadas.length)}` }), { status })
    }) as typeof fetch,
    pendentes: () =>
      opcoes.falharPendentes
        ? Promise.reject(new Error('pendentes'))
        : Promise.resolve(opcoes.pendentes ?? [pendente(1)]),
    itens: (_c, membroId) => Promise.resolve(opcoes.itens?.(membroId) ?? [item()]),
    reservar: (_c, membroId, dia) => {
      const chave = `${membroId}/${dia}`
      if (reservas.has(chave)) return Promise.resolve(null)
      const id = `reserva-${String(reservas.size + 1)}`
      reservas.set(chave, id)
      return Promise.resolve(id)
    },
    registrarResultado: (id, situacao, provedorId) => {
      if (opcoes.falharAoRegistrar) return Promise.reject(new Error('registrar'))
      resultados.push({ id, situacao, provedorId })
      return Promise.resolve(true)
    },
    esperar: (ms) => {
      esperas.push(ms)
      return Promise.resolve()
    },
    registrar: (linha) => log.push(linha),
  }
  return { tratar: criarTratadorDosAvisos(deps), chamadas, resultados, esperas, log }
}

function pedido(token: string | null, metodo = 'POST') {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token !== null) headers.set('x-cron-token', token)
  return new Request('http://localhost/enviar-avisos-do-dia', {
    method: metodo,
    headers,
    body: metodo === 'POST' ? '{}' : undefined,
  })
}

Deno.test('token errado ou ausente é recusado sem enviar nada', async () => {
  const { tratar, chamadas } = montar()
  for (const token of ['outro', null, `${TOKEN}x`]) {
    const resposta = await tratar(pedido(token))
    assert.equal(resposta.status, 401)
    assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
  }
  assert.equal(chamadas.length, 0)
})

Deno.test('só POST; OPTIONS responde o CORS', async () => {
  const { tratar } = montar()
  assert.equal((await tratar(pedido(TOKEN, 'GET'))).status, 405)
  assert.equal((await tratar(pedido(TOKEN, 'OPTIONS'))).status, 200)
})

Deno.test('sem a chave, o remetente ou a assinatura: 503 sem consultar o banco', async () => {
  for (const falta of ['RESEND_API_KEY', 'AVISO_REMETENTE', 'AVISO_ASSINATURA']) {
    const variaveis = { ...VARIAVEIS }
    delete variaveis[falta]
    const { tratar, chamadas } = montar({ variaveis })
    const resposta = await tratar(pedido(TOKEN))
    assert.equal(resposta.status, 503)
    assert.deepEqual(await resposta.json(), { erro: 'configuracao_ausente' })
    assert.equal(chamadas.length, 0)
  }
})

Deno.test('erro ao ler os pendentes: 500', async () => {
  const { tratar } = montar({ falharPendentes: true })
  const resposta = await tratar(pedido(TOKEN))
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), { erro: 'erro_interno' })
})

Deno.test('envia, grava o id do Resend e leva os cabeçalhos de descadastro', async () => {
  const { tratar, chamadas, resultados, log } = montar()
  const resposta = await tratar(pedido(TOKEN))
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), {
    pendentes: 1,
    enviados: 1,
    vazios: 0,
    em_andamento: 0,
    falhas: 0,
    adiados: 0,
  })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0]?.url, URL_DO_RESEND)
  const cabecalhosHttp = new Headers(chamadas[0]?.init.headers)
  assert.equal(
    cabecalhosHttp.get('Idempotency-Key'),
    'resumo-diario/d0000000-0000-4000-8000-000000000001/2026-11-23',
  )
  const corpo = JSON.parse(String(chamadas[0]?.init.body)) as {
    to: string[]
    subject: string
    text: string
    html: string
    headers: Record<string, string>
  }
  assert.deepEqual(corpo.to, ['pessoa1@exemplo.test'])
  assert.equal(corpo.subject, 'Grama: prazos de 23/11/2026')
  assert.equal(corpo.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  const unsubscribe =
    /^<https:\/\/projeto\.exemplo\.test\/functions\/v1\/preferencias-por-link\/(.+)>$/.exec(
      corpo.headers['List-Unsubscribe'] ?? '',
    )
  assert.ok(unsubscribe)
  assert.deepEqual(await lerLinkDeDescadastro(ASSINATURA, unsubscribe[1] ?? ''), {
    consultoriaId: CONSULTORIA,
    membroId: 'd0000000-0000-4000-8000-000000000001',
  })
  assert.ok(corpo.text.includes(`https://beta.exemplo.test/avisos/parar#${unsubscribe[1] ?? ''}`))
  assert.ok(corpo.text.includes('Abrir no Grama: https://beta.exemplo.test/\n'))
  assert.ok(corpo.html.includes('<p>Olá, &lt;Ana&gt;.</p>'))
  assert.deepEqual(resultados, [{ id: 'reserva-1', situacao: 'enviado', provedorId: 're_1' }])
  assert.equal(log.length, 0)
})

Deno.test('sem itens não envia nem reserva (nunca sai vazio)', async () => {
  const { tratar, chamadas, resultados } = montar({ itens: () => [] })
  const resposta = await tratar(pedido(TOKEN))
  assert.deepEqual(await resposta.json(), {
    pendentes: 1,
    enviados: 0,
    vazios: 1,
    em_andamento: 0,
    falhas: 0,
    adiados: 0,
  })
  assert.equal(chamadas.length, 0)
  assert.equal(resultados.length, 0)
})

Deno.test('reserva já feita por outra execução: não envia', async () => {
  const { tratar, chamadas } = montar({ pendentes: [pendente(1), pendente(1)] })
  const resposta = await tratar(pedido(TOKEN))
  const corpo = (await resposta.json()) as Record<string, number>
  assert.equal(corpo.enviados, 1)
  assert.equal(corpo.em_andamento, 1)
  assert.equal(chamadas.length, 1)
})

Deno.test('recusa do Resend grava falhou; sem resposta não grava (reserva fica)', async () => {
  const recusa = montar({ resend: () => 422 })
  const r1 = await recusa.tratar(pedido(TOKEN))
  assert.equal(r1.status, 502)
  assert.deepEqual(recusa.resultados, [
    { id: 'reserva-1', situacao: 'falhou', provedorId: undefined },
  ])
  assert.deepEqual(JSON.parse(recusa.log[0] ?? '{}'), {
    membroId: 'd0000000-0000-4000-8000-000000000001',
    etapa: 'envio',
    motivo: 'falha_no_envio',
    status: 422,
  })

  const semResposta = montar({ resend: () => 'sem_resposta' })
  const r2 = await semResposta.tratar(pedido(TOKEN))
  assert.equal(r2.status, 502)
  assert.equal(((await r2.json()) as Record<string, number>).falhas, 1)
  assert.equal(semResposta.resultados.length, 0)
})

Deno.test('falha ao gravar o envio conta como falha e não reenvia', async () => {
  const { tratar, chamadas, log } = montar({ falharAoRegistrar: true })
  const resposta = await tratar(pedido(TOKEN))
  assert.equal(resposta.status, 502)
  assert.equal(chamadas.length, 1)
  assert.deepEqual(JSON.parse(log[0] ?? '{}'), {
    membroId: 'd0000000-0000-4000-8000-000000000001',
    etapa: 'registro',
    motivo: 'erro_interno',
  })
})

Deno.test('no máximo 60 por chamada, com 600 ms entre os envios', async () => {
  const pendentes = Array.from({ length: MAXIMO_POR_CHAMADA + 5 }, (_, i) => pendente(i + 1))
  const { tratar, chamadas, esperas } = montar({ pendentes })
  const resposta = await tratar(pedido(TOKEN))
  const corpo = (await resposta.json()) as Record<string, number>
  assert.equal(corpo.pendentes, 65)
  assert.equal(corpo.enviados, 60)
  assert.equal(corpo.adiados, 5)
  assert.equal(chamadas.length, 60)
  assert.equal(esperas.length, 59)
  assert.ok(esperas.every((ms) => ms === 600))
})

Deno.test('quem não tem item não ocupa vaga dos 60: os seguintes da fila recebem', async () => {
  const pendentes = Array.from({ length: MAXIMO_POR_CHAMADA + 5 }, (_, i) => pendente(i + 1))
  const comItens = new Set(pendentes.slice(MAXIMO_POR_CHAMADA).map((p) => p.membroId))
  const { tratar, chamadas } = montar({
    pendentes,
    itens: (membroId) => (comItens.has(membroId) ? [item()] : []),
  })
  const resposta = await tratar(pedido(TOKEN))
  const corpo = (await resposta.json()) as Record<string, number>
  assert.equal(resposta.status, 200)
  assert.equal(corpo.vazios, 60)
  assert.equal(corpo.enviados, 5)
  assert.equal(corpo.adiados, 0)
  assert.equal(chamadas.length, 5)
})

Deno.test('o log nunca leva e-mail, nome, token nem a chave', async () => {
  const { tratar, log } = montar({ resend: () => 500, pendentes: [pendente(1), pendente(2)] })
  await tratar(pedido(TOKEN))
  const tudo = log.join('\n')
  assert.ok(log.length > 0)
  for (const proibido of ['@exemplo.test', 'Ana', 're_chave', TOKEN, ASSINATURA, 'v1.']) {
    assert.ok(!tudo.includes(proibido), proibido)
  }
})

Deno.test('e-mail: grupos na ordem, contagem, até 15 por grupo e sem grupo vazio', () => {
  const itens: ItemDoResumo[] = [
    ...Array.from({ length: 17 }, (_, i) => item({ id: `meu-${String(i)}`, dias: i })),
    item({
      grupo: 'da_consultoria',
      tipoLinha: 'validade',
      codigo: null,
      titulo: 'Validade',
      prazo: '2026-11-28',
      dias: 5,
    }),
  ]
  const email = montarEmailDoResumoDiario(pendente(1, { membroNome: '  Bruno Tavares ' }), itens, {
    app: 'https://beta.exemplo.test',
    tokenDeDescadastro: 'tok',
  })
  assert.equal(email.assunto, 'Grama: prazos de 23/11/2026')
  const linhas = email.texto.split('\n')
  assert.equal(linhas[0], 'Olá, Bruno.')
  assert.equal(linhas[2], 'Seus prazos (17)')
  assert.equal(linhas.filter((l) => l.startsWith('- 21/11/2026 · C-01')).length, 15)
  assert.ok(linhas.includes('e mais 2 no Grama'))
  assert.ok(linhas.includes('Licenças e vencimentos (1)'))
  assert.ok(!email.texto.includes('Sem responsável'))
  assert.ok(linhas.includes('- 28/11/2026 · Validade · Metalúrgica Açores (em 5 dias)'))
  assert.ok(email.texto.indexOf('Seus prazos') < email.texto.indexOf('Licenças e vencimentos'))
  assert.ok(
    email.texto.endsWith(
      'Parar de receber este resumo: https://beta.exemplo.test/avisos/parar#tok',
    ),
  )
})

Deno.test('linha do item: rótulo do tipo sem código e sufixo de atraso, hoje e futuro', () => {
  assert.equal(
    linhaDoItem(item()),
    '21/11/2026 · C-01 · Monitoramento de efluentes · Metalúrgica Açores (2 dias de atraso)',
  )
  assert.equal(
    linhaDoItem(
      item({ tipoLinha: 'limite_protocolo', codigo: null, titulo: 'Limite de protocolo', dias: 0 }),
    ),
    '21/11/2026 · Limite de protocolo · Metalúrgica Açores (hoje)',
  )
  assert.equal(
    linhaDoItem(item({ tipoLinha: 'exigencia', codigo: null, titulo: 'Ofício 12', dias: 1 })),
    '21/11/2026 · Exigência · Ofício 12 · Metalúrgica Açores (em 1 dia)',
  )
  assert.equal(sufixoDosDias(-1), '1 dia de atraso')
  assert.equal(sufixoDosDias(3), 'em 3 dias')
})
