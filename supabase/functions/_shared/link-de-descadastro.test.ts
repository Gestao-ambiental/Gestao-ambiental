import assert from 'node:assert/strict'

import { assinarLinkDeDescadastro, lerLinkDeDescadastro } from './link-de-descadastro.ts'

const SEGREDO = 'segredo-de-teste-da-assinatura'
const CONSULTORIA = 'c0000000-0000-4000-8000-00000000000a'
const MEMBRO = 'd0000000-0000-4000-8000-0000000000a2'

Deno.test('assina e lê de volta os ids', async () => {
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  assert.match(
    token,
    /^v1\.c0000000-0000-4000-8000-00000000000a\.d0000000-0000-4000-8000-0000000000a2\.[A-Za-z0-9_-]{43}$/,
  )
  assert.deepEqual(await lerLinkDeDescadastro(SEGREDO, token), {
    consultoriaId: CONSULTORIA,
    membroId: MEMBRO,
  })
})

Deno.test('a assinatura é a mesma para os mesmos ids (sem validade)', async () => {
  assert.equal(
    await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO),
    await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA.toUpperCase(), MEMBRO),
  )
})

Deno.test('outro segredo, id trocado ou assinatura mexida não valem', async () => {
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  assert.equal(await lerLinkDeDescadastro('outro-segredo', token), null)
  const outroMembro = token.replace(MEMBRO, 'd0000000-0000-4000-8000-0000000000a3')
  assert.equal(await lerLinkDeDescadastro(SEGREDO, outroMembro), null)
  const ultimo = token.at(-1) === 'A' ? 'B' : 'A'
  assert.equal(await lerLinkDeDescadastro(SEGREDO, token.slice(0, -1) + ultimo), null)
})

Deno.test('formato inválido não vale', async () => {
  const token = await assinarLinkDeDescadastro(SEGREDO, CONSULTORIA, MEMBRO)
  for (const errado of [
    '',
    'v1',
    token.replace(/^v1/, 'v2'),
    token.toUpperCase(),
    `${token}=`,
    `${token}.x`,
    'v1.nao-e-uuid.d0000000-0000-4000-8000-0000000000a2.' + 'A'.repeat(43),
  ]) {
    assert.equal(await lerLinkDeDescadastro(SEGREDO, errado), null, errado)
  }
  assert.equal(await lerLinkDeDescadastro('', token), null)
})
