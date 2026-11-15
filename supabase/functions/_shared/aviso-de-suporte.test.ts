import assert from 'node:assert/strict'

import {
  criarTratadorDoAviso,
  type DadosDoAviso,
  type DependenciasDoAviso,
  formatarNoFuso,
  montarEmail,
  URL_DO_RESEND,
} from './aviso-de-suporte.ts'

const ACESSO = 'a5000000-0000-4000-8000-0000000000e1'
const CHAVE = 're_chave_de_teste'
const MOTIVO = 'Sistema fora para a Verde Sul'
const EMAILS = ['gestao1@exemplo.test', 'gestao2@exemplo.test']

const dados: DadosDoAviso = {
  acessoId: ACESSO,
  consultoriaId: 'c0000000-0000-4000-8000-00000000000b',
  consultoriaNome: 'Verde Sul Ambiental',
  fuso: 'America/Sao_Paulo',
  categoria: 'falha_grave',
  motivo: MOTIVO,
  inicio: '2026-11-14T17:30:00Z',
  fimPrevisto: '2026-11-14T19:30:00Z',
  operadorNome: 'Operador Grama',
}

interface Chamada {
  url: string
  init: RequestInit
}

function montar(extra: Partial<DependenciasDoAviso> & { variaveis?: Record<string, string> } = {}) {
  const chamadas: Chamada[] = []
  const log: string[] = []
  const pedidosDeEmail: string[] = []
  const variaveis = extra.variaveis ?? {
    RESEND_API_KEY: CHAVE,
    AVISO_REMETENTE: 'Grama <avisos@exemplo.test>',
  }
  const deps: DependenciasDoAviso = {
    env: (nome) => variaveis[nome],
    conferirAviso: () => Promise.resolve({ dados, erro: null }),
    emailsDaGestao: (consultoriaId) => {
      pedidosDeEmail.push(consultoriaId)
      return Promise.resolve(EMAILS)
    },
    fetch: ((url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }))
    }) as typeof fetch,
    registrar: (linha) => log.push(linha),
    ...extra,
  }
  return { tratar: criarTratadorDoAviso(deps), chamadas, log, pedidosDeEmail }
}

function pedido(corpo: unknown = { acessoId: ACESSO }, autorizacao: string | null = 'Bearer jwt') {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (autorizacao) headers.set('Authorization', autorizacao)
  return new Request('http://localhost/avisar-acesso-de-suporte', {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
}

Deno.test('caminho feliz: envia um e-mail à Gestão pelo Resend', async () => {
  const { tratar, chamadas, pedidosDeEmail } = montar()
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { enviados: 2 })
  assert.deepEqual(pedidosDeEmail, [dados.consultoriaId])
  assert.equal(chamadas.length, 1)
  const [chamada] = chamadas
  assert.equal(chamada?.url, URL_DO_RESEND)
  assert.equal(chamada?.init.method, 'POST')
  assert.equal(new Headers(chamada?.init.headers).get('Authorization'), `Bearer ${CHAVE}`)
  const corpo = JSON.parse(String(chamada?.init.body)) as Record<string, unknown>
  assert.equal(corpo.from, 'Grama <avisos@exemplo.test>')
  assert.deepEqual(corpo.to, EMAILS)
  assert.equal(corpo.subject, 'Grama: acesso de emergência do suporte à Verde Sul Ambiental')
  assert.match(String(corpo.text), /Categoria: Falha grave que impede o uso/)
  assert.match(String(corpo.text), /Operador: Operador Grama/)
})

Deno.test('sem a chave do Resend: erro tratado, nenhum envio', async () => {
  const { tratar, chamadas, log } = montar({ variaveis: { AVISO_REMETENTE: 'Grama <a@b.test>' } })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 503)
  assert.deepEqual(await resposta.json(), { erro: 'configuracao_ausente' })
  assert.equal(chamadas.length, 0)
  assert.equal(log.length, 1)
})

Deno.test('sem remetente: erro tratado, nenhum envio', async () => {
  const { tratar, chamadas } = montar({ variaveis: { RESEND_API_KEY: CHAVE } })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 503)
  assert.equal(chamadas.length, 0)
})

Deno.test('sem acesso de emergência valendo: recusa sem ler e-mails nem enviar', async () => {
  const { tratar, chamadas, pedidosDeEmail } = montar({
    conferirAviso: () => Promise.resolve({ dados: null, erro: 'sem_acesso_de_emergencia' }),
  })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 403)
  assert.deepEqual(await resposta.json(), { erro: 'sem_acesso_de_emergencia' })
  assert.equal(pedidosDeEmail.length, 0)
  assert.equal(chamadas.length, 0)
})

Deno.test('código desconhecido do banco vira sem_permissao', async () => {
  const { tratar } = montar({
    conferirAviso: () => Promise.resolve({ dados: null, erro: 'qualquer_coisa' }),
  })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 403)
  assert.deepEqual(await resposta.json(), { erro: 'sem_permissao' })
})

Deno.test('sem login e com corpo inválido: recusa antes de consultar o banco', async () => {
  let consultas = 0
  const { tratar } = montar({
    conferirAviso: () => {
      consultas += 1
      return Promise.resolve({ dados, erro: null })
    },
  })
  assert.equal((await tratar(pedido(undefined, null))).status, 401)
  assert.equal((await tratar(pedido({ acessoId: 'nao-e-uuid' }))).status, 400)
  assert.equal(consultas, 0)
})

Deno.test('Resend recusa: 502 e o log não tem e-mail, chave nem motivo', async () => {
  const { tratar, log } = montar({
    fetch: (() => Promise.resolve(new Response('{}', { status: 422 }))) as typeof fetch,
  })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 502)
  assert.deepEqual(await resposta.json(), { erro: 'falha_no_envio' })
  const tudo = log.join('\n')
  assert.match(tudo, /falha_no_envio/)
  for (const segredo of [CHAVE, MOTIVO, ...EMAILS]) assert.ok(!tudo.includes(segredo))
})

Deno.test('Gestão sem e-mail: não envia', async () => {
  const { tratar, chamadas } = montar({ emailsDaGestao: () => Promise.resolve([]) })
  const resposta = await tratar(pedido())
  assert.equal(resposta.status, 422)
  assert.equal(chamadas.length, 0)
})

Deno.test(
  'e-mail: datas no fuso da consultoria, categoria por extenso e motivo em texto puro',
  () => {
    assert.equal(formatarNoFuso('2026-11-14T17:30:00Z', 'America/Sao_Paulo'), '14/11/2026 às 14:30')
    const email = montarEmail({ ...dados, motivo: '<b>falha</b>' })
    assert.match(email.texto, /Início: 14\/11\/2026 às 14:30/)
    assert.match(email.texto, /Término: 14\/11\/2026 às 16:30 \(somente leitura\)/)
    assert.match(email.texto, /Motivo: <b>falha<\/b>/)
  },
)
