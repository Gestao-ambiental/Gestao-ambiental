import assert from 'node:assert/strict'

import { URL_DO_RESEND } from './aviso-de-suporte.ts'
import {
  type CadastroNaLista,
  criarTratadorDoAvisoDaLista,
  criarTratadorDoConvite,
  type DependenciasDoAvisoDaLista,
  type DependenciasDoConvite,
  formatarWhatsapp,
  montarEmailDoAviso,
} from './lista-de-espera.ts'

const TOKEN = 'token-de-teste-da-lista'
const CHAVE = 're_chave_de_teste'
const ID = 'a5300000-0000-4000-8000-000000000001'
const OPERADORES = ['operador@exemplo.test']
const VARIAVEIS = {
  LISTA_AVISO_TOKEN: TOKEN,
  RESEND_API_KEY: CHAVE,
  AVISO_REMETENTE: 'Grama <avisos@exemplo.test>',
}

const ANA: CadastroNaLista = {
  id: ID,
  nome: 'Ana Prado',
  contato: 'ana@exemplo.test',
  tipoContato: 'email',
  criadaEm: '2026-11-15T12:00:00Z',
}
const BRUNO: CadastroNaLista = {
  id: 'a5300000-0000-4000-8000-000000000002',
  nome: 'Bruno Reis',
  contato: '5547988887777',
  tipoContato: 'whatsapp',
  criadaEm: '2026-11-15T12:05:00Z',
}

interface Chamada {
  url: string
  init: RequestInit
}

function fetchFalso(chamadas: Chamada[], status = 200): typeof fetch {
  return ((url: string, init: RequestInit) => {
    chamadas.push({ url, init })
    return Promise.resolve(new Response('{"id":"x"}', { status }))
  }) as typeof fetch
}

function corpoDe(chamada: Chamada | undefined): Record<string, unknown> {
  return JSON.parse(String(chamada?.init.body)) as Record<string, unknown>
}

// ------------------------------------------------------------------------------------- aviso

function montarAviso(
  extra: Partial<DependenciasDoAvisoDaLista> & {
    variaveis?: Record<string, string>
    status?: number
  } = {},
) {
  const chamadas: Chamada[] = []
  const marcados: string[][] = []
  const log: string[] = []
  const variaveis = extra.variaveis ?? VARIAVEIS
  const deps: DependenciasDoAvisoDaLista = {
    env: (nome) => variaveis[nome as keyof typeof variaveis],
    pendentes: () => Promise.resolve({ cadastros: [ANA, BRUNO], destinatarios: OPERADORES }),
    marcarAvisados: (ids) => {
      marcados.push(ids)
      return Promise.resolve(ids.length)
    },
    fetch: fetchFalso(chamadas, extra.status),
    registrar: (linha) => log.push(linha),
    ...extra,
  }
  return { tratar: criarTratadorDoAvisoDaLista(deps), chamadas, marcados, log }
}

function pedidoDoAviso(token: string | null = TOKEN) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token !== null) headers.set('x-aviso-token', token)
  return new Request('http://localhost/avisar-lista-de-espera', {
    method: 'POST',
    headers,
    body: '{}',
  })
}

Deno.test('aviso: um e-mail aos operadores com os cadastros, depois marca avisados', async () => {
  const { tratar, chamadas, marcados, log } = montarAviso()
  const resposta = await tratar(pedidoDoAviso())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { avisados: 2 })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0]?.url, URL_DO_RESEND)
  const corpo = corpoDe(chamadas[0])
  assert.deepEqual(corpo.to, OPERADORES)
  assert.equal(corpo.subject, 'Grama: 2 pessoas entraram na lista de espera')
  assert.match(String(corpo.text), /- Ana Prado: ana@exemplo\.test/)
  assert.match(String(corpo.text), /- Bruno Reis: WhatsApp \(47\) 98888-7777/)
  assert.deepEqual(marcados, [[ANA.id, BRUNO.id]])
  assert.equal(log.length, 0)
})

Deno.test('aviso: token errado ou ausente recusa sem ler nem enviar', async () => {
  for (const token of ['outro', null]) {
    const { tratar, chamadas, marcados } = montarAviso()
    const resposta = await tratar(pedidoDoAviso(token))
    assert.equal(resposta.status, 401)
    assert.equal(chamadas.length, 0)
    assert.equal(marcados.length, 0)
  }
})

Deno.test('aviso: sem LISTA_AVISO_TOKEN configurado, recusa tudo', async () => {
  const { tratar, chamadas } = montarAviso({
    variaveis: { RESEND_API_KEY: CHAVE, AVISO_REMETENTE: 'Grama <a@b.test>' },
  })
  const resposta = await tratar(pedidoDoAviso(''))
  assert.equal(resposta.status, 401)
  assert.equal(chamadas.length, 0)
})

Deno.test('aviso: falha no Resend não marca avisados e não registra contatos no log', async () => {
  const { tratar, marcados, log } = montarAviso({ status: 500 })
  const resposta = await tratar(pedidoDoAviso())
  assert.equal(resposta.status, 502)
  assert.equal(marcados.length, 0)
  assert.equal(log.length, 1)
  assert.doesNotMatch(log.join('\n'), /ana@|5547|Ana|operador@/)
})

Deno.test('aviso: sem pendentes, não envia', async () => {
  const { tratar, chamadas } = montarAviso({
    pendentes: () => Promise.resolve({ cadastros: [], destinatarios: OPERADORES }),
  })
  const resposta = await tratar(pedidoDoAviso())
  assert.deepEqual(await resposta.json(), { avisados: 0 })
  assert.equal(chamadas.length, 0)
})

Deno.test('aviso: o nome de quem se cadastrou nunca vai no assunto, só no corpo', () => {
  const golpe: CadastroNaLista = { ...ANA, nome: 'Pague o boleto em golpe.test <b>já</b>' }
  const email = montarEmailDoAviso([golpe])
  assert.equal(email.assunto, 'Grama: 1 pessoa entrou na lista de espera')
  assert.doesNotMatch(email.assunto, /boleto|golpe/)
  assert.match(email.texto, /- Pague o boleto em golpe\.test <b>já<\/b>: ana@exemplo\.test/)
  assert.doesNotMatch(montarEmailDoAviso([golpe, BRUNO]).assunto, /boleto|golpe/)
  assert.equal(formatarWhatsapp('5547999991234'), '(47) 99999-1234')
  assert.equal(formatarWhatsapp('351912345678'), '+351912345678')
})

// ------------------------------------------------------------------------------------ convite

function montarConvite(
  extra: Partial<DependenciasDoConvite> & {
    variaveis?: Record<string, string>
    status?: number
  } = {},
) {
  const chamadas: Chamada[] = []
  const registros: string[] = []
  const log: string[] = []
  const variaveis: Record<string, string> = extra.variaveis ?? VARIAVEIS
  const deps: DependenciasDoConvite = {
    env: (nome) => variaveis[nome],
    registrarConvite: (_autorizacao, id) => {
      registros.push(id)
      return Promise.resolve({
        dados: { nome: ANA.nome, contato: ANA.contato, tipoContato: 'email' },
        erro: null,
      })
    },
    fetch: fetchFalso(chamadas, extra.status),
    registrar: (linha) => log.push(linha),
    ...extra,
  }
  return { tratar: criarTratadorDoConvite(deps), chamadas, registros, log }
}

function pedidoDoConvite(corpo: unknown = { id: ID }, autorizacao: string | null = 'Bearer jwt') {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (autorizacao) headers.set('Authorization', autorizacao)
  return new Request('http://localhost/convidar-da-lista-de-espera', {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
}

Deno.test('convite: registra e manda o e-mail com o link do beta', async () => {
  const { tratar, chamadas, registros } = montarConvite({
    variaveis: { ...VARIAVEIS, LINK_DO_BETA: 'https://beta.exemplo.test/' },
  })
  const resposta = await tratar(pedidoDoConvite())
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { enviado: true })
  assert.deepEqual(registros, [ID])
  const corpo = corpoDe(chamadas[0])
  assert.deepEqual(corpo.to, ['ana@exemplo.test'])
  assert.equal(corpo.subject, 'Seu convite para o beta do Grama')
  assert.match(String(corpo.text), /Olá, Ana,/)
  assert.match(String(corpo.text), /https:\/\/beta\.exemplo\.test\/criar-conta/)
})

Deno.test('convite: sem login ou com id inválido, recusa sem registrar', async () => {
  const semLogin = montarConvite()
  assert.equal((await semLogin.tratar(pedidoDoConvite({ id: ID }, null))).status, 401)
  const idRuim = montarConvite()
  assert.equal((await idRuim.tratar(pedidoDoConvite({ id: 'x' }))).status, 400)
  assert.equal(semLogin.registros.length + idRuim.registros.length, 0)
})

Deno.test('convite: sem a chave do Resend, não registra o convite', async () => {
  const { tratar, registros, chamadas } = montarConvite({
    variaveis: { AVISO_REMETENTE: 'Grama <a@b.test>' },
  })
  const resposta = await tratar(pedidoDoConvite())
  assert.equal(resposta.status, 503)
  assert.equal(registros.length, 0)
  assert.equal(chamadas.length, 0)
})

Deno.test('convite: recusas do banco viram códigos estáveis, sem envio', async () => {
  for (const [erro, status] of [
    ['sem_permissao', 403],
    ['dois_fatores_necessarios', 403],
    ['cadastro_inexistente', 404],
    ['qualquer_coisa', 403],
  ] as const) {
    const { tratar, chamadas } = montarConvite({
      registrarConvite: () => Promise.resolve({ dados: null, erro }),
    })
    const resposta = await tratar(pedidoDoConvite())
    assert.equal(resposta.status, status)
    assert.equal(chamadas.length, 0)
  }
})

Deno.test('convite: contato de WhatsApp não passa por e-mail', async () => {
  const { tratar, chamadas } = montarConvite({
    registrarConvite: () =>
      Promise.resolve({
        dados: { nome: BRUNO.nome, contato: BRUNO.contato, tipoContato: 'whatsapp' },
        erro: null,
      }),
  })
  const resposta = await tratar(pedidoDoConvite())
  assert.equal(resposta.status, 422)
  assert.equal(chamadas.length, 0)
})

Deno.test('convite: falha no Resend vira 502 sem o contato no log', async () => {
  const { tratar, log } = montarConvite({ status: 500 })
  const resposta = await tratar(pedidoDoConvite())
  assert.equal(resposta.status, 502)
  assert.doesNotMatch(log.join('\n'), /ana@|Ana/)
})
