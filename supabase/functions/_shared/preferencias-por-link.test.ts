import assert from 'node:assert/strict'

import { assinarLinkDeDescadastro } from './link-de-descadastro.ts'
import { criarTratadorDoDescadastro } from './preferencias-por-link.ts'

const SEGREDO = 'segredo-de-teste-da-assinatura'
const CONSULTORIA = 'c0000000-0000-4000-8000-00000000000a'
const MEMBRO = 'd0000000-0000-4000-8000-0000000000a2'
const BASE = 'https://projeto.exemplo.test/functions/v1/preferencias-por-link'

function montar(opcoes: { variaveis?: Record<string, string>; resposta?: boolean | 'erro' } = {}) {
  const variaveis = opcoes.variaveis ?? { AVISO_ASSINATURA: SEGREDO }
  const desligados: string[] = []
  const log: string[] = []
  const tratar = criarTratadorDoDescadastro({
    env: (nome) => variaveis[nome],
    desligar: (consultoriaId, membroId) => {
      if (opcoes.resposta === 'erro') return Promise.reject(new Error('banco'))
      desligados.push(`${consultoriaId}/${membroId}`)
      return Promise.resolve(opcoes.resposta ?? true)
    },
    registrar: (l) => log.push(l),
  })
  return { tratar, desligados, log }
}

Deno.test('one-click do provedor: token no caminho, corpo ignorado', async () => {
  const { tratar, desligados } = montar()
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  const resposta = await tratar(
    new Request(`${BASE}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
  )
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { desligado: true })
  assert.deepEqual(desligados, [`${CONSULTORIA}/${MEMBRO}`])
})

Deno.test('página do app: token no corpo JSON', async () => {
  const { tratar, desligados } = montar()
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  const resposta = await tratar(
    new Request(BASE, { method: 'POST', body: JSON.stringify({ token }) }),
  )
  assert.equal(resposta.status, 200)
  assert.deepEqual(desligados, [`${CONSULTORIA}/${MEMBRO}`])
})

Deno.test('GET nunca desliga', async () => {
  const { tratar, desligados } = montar()
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  const resposta = await tratar(new Request(`${BASE}/${token}`))
  assert.equal(resposta.status, 405)
  assert.equal(desligados.length, 0)
})

Deno.test('OPTIONS responde o CORS', async () => {
  const { tratar } = montar()
  const resposta = await tratar(new Request(BASE, { method: 'OPTIONS' }))
  assert.equal(resposta.status, 200)
  assert.equal(resposta.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
})

Deno.test('token inválido, de outro segredo ou ausente: 400 link_invalido', async () => {
  const { tratar, desligados } = montar()
  const deOutro = await assinarLinkDeDescadastro('outro-segredo', CONSULTORIA, MEMBRO)
  for (const pedido of [
    new Request(`${BASE}/${deOutro}`, { method: 'POST' }),
    new Request(`${BASE}/qualquer`, { method: 'POST' }),
    new Request(BASE, { method: 'POST', body: '{}' }),
    new Request(BASE, { method: 'POST', body: 'não é json' }),
    new Request(BASE, { method: 'POST', body: JSON.stringify({ token: 42 }) }),
  ]) {
    const resposta = await tratar(pedido)
    assert.equal(resposta.status, 400)
    assert.deepEqual(await resposta.json(), { erro: 'link_invalido' })
  }
  assert.equal(desligados.length, 0)
})

Deno.test('sem AVISO_ASSINATURA: 503', async () => {
  const { tratar } = montar({ variaveis: {} })
  const resposta = await tratar(new Request(BASE, { method: 'POST', body: '{}' }))
  assert.equal(resposta.status, 503)
  assert.deepEqual(await resposta.json(), { erro: 'configuracao_ausente' })
})

Deno.test('membro inexistente: a resposta é a mesma (não revela quem existe)', async () => {
  const { tratar } = montar({ resposta: false })
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  const resposta = await tratar(new Request(`${BASE}/${token}`, { method: 'POST' }))
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { desligado: true })
})

Deno.test('erro do banco: 500 sem o token no log', async () => {
  const { tratar, log } = montar({ resposta: 'erro' })
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  const resposta = await tratar(new Request(`${BASE}/${token}`, { method: 'POST' }))
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), { erro: 'erro_interno' })
  assert.ok(!log.join('').includes(token))
  assert.ok(!log.join('').includes(MEMBRO))
})
