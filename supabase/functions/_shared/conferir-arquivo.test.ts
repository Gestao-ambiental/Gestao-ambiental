import assert from 'node:assert/strict'

import {
  criarTratadorDaConferenciaDeArquivo,
  type DependenciasDaConferenciaDeArquivo,
  sha256Hex,
} from './conferir-arquivo.ts'

const VERSAO = '50000001-0000-4000-8000-000000000000'
const CONTEUDO = new TextEncoder().encode('%PDF-1.7 relatório de efluentes')
const OUTRO = new TextEncoder().encode('%PDF-1.7 outro arquivo')

function pedido(
  corpo: unknown,
  cabecalhos: Record<string, string> = { Authorization: 'Bearer jwt' },
) {
  return new Request('http://local/conferir-arquivo', {
    method: 'POST',
    headers: cabecalhos,
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  })
}

function dependencias(extra: Partial<DependenciasDaConferenciaDeArquivo> = {}) {
  const chamadas = { baixar: 0, registrar: [] as string[] }
  const deps: DependenciasDaConferenciaDeArquivo = {
    lerVersao: () =>
      Promise.resolve({
        dados: { caminho: 'c/evidencia/v.pdf', confere: null, sha256Calculado: null },
        erro: null,
      }),
    baixar: () => {
      chamadas.baixar += 1
      return Promise.resolve({ dados: CONTEUDO, erro: null })
    },
    registrar: (_versao, sha) => {
      chamadas.registrar.push(sha)
      return Promise.resolve({ dados: true, erro: null })
    },
    log: () => {},
    ...extra,
  }
  return { deps, chamadas }
}

Deno.test('sha256Hex calcula o SHA-256 em hexadecimal minúsculo', async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

Deno.test('baixa o objeto, calcula o hash e grava a conferência', async () => {
  const { deps, chamadas } = dependencias()
  const resposta = await criarTratadorDaConferenciaDeArquivo(deps)(pedido({ versaoId: VERSAO }))
  assert.equal(resposta.status, 200)
  const corpo = await resposta.json()
  assert.equal(corpo.confere, true)
  assert.equal(corpo.sha256, await sha256Hex(CONTEUDO))
  assert.deepEqual(chamadas.registrar, [await sha256Hex(CONTEUDO)])
})

Deno.test('hash divergente volta como confere: false', async () => {
  const { deps } = dependencias({
    baixar: () => Promise.resolve({ dados: OUTRO, erro: null }),
    registrar: () => Promise.resolve({ dados: false, erro: null }),
  })
  const resposta = await criarTratadorDaConferenciaDeArquivo(deps)(pedido({ versaoId: VERSAO }))
  assert.equal(resposta.status, 200)
  assert.equal((await resposta.json()).confere, false)
})

Deno.test('versão já conferida devolve o resultado gravado sem baixar de novo', async () => {
  const { deps, chamadas } = dependencias({
    lerVersao: () =>
      Promise.resolve({
        dados: { caminho: 'c/evidencia/v.pdf', confere: false, sha256Calculado: 'f'.repeat(64) },
        erro: null,
      }),
  })
  const resposta = await criarTratadorDaConferenciaDeArquivo(deps)(pedido({ versaoId: VERSAO }))
  assert.deepEqual(await resposta.json(), { confere: false, sha256: 'f'.repeat(64) })
  assert.equal(chamadas.baixar, 0)
  assert.equal(chamadas.registrar.length, 0)
})

Deno.test('sem login é 401; versão que a RLS não mostra é 403 e nada é baixado', async () => {
  const { deps, chamadas } = dependencias({
    lerVersao: () => Promise.resolve({ dados: null, erro: null }),
  })
  const tratar = criarTratadorDaConferenciaDeArquivo(deps)
  assert.equal((await tratar(pedido({ versaoId: VERSAO }, {}))).status, 401)
  const resposta = await tratar(pedido({ versaoId: VERSAO }))
  assert.equal(resposta.status, 403)
  assert.equal((await resposta.json()).erro, 'sem_permissao')
  assert.equal(chamadas.baixar, 0)
})

Deno.test('pedido inválido: corpo que não é JSON, id que não é UUID e método errado', async () => {
  const { deps } = dependencias()
  const tratar = criarTratadorDaConferenciaDeArquivo(deps)
  assert.equal((await tratar(pedido('{'))).status, 400)
  assert.equal((await tratar(pedido({ versaoId: '../x' }))).status, 400)
  assert.equal((await tratar(new Request('http://local/conferir-arquivo'))).status, 405)
  assert.equal(
    (await tratar(new Request('http://local/conferir-arquivo', { method: 'OPTIONS' }))).status,
    200,
  )
})

Deno.test('objeto ausente no Storage é 409 e não grava nada', async () => {
  const { deps, chamadas } = dependencias({
    baixar: () => Promise.resolve({ dados: null, erro: 'Object not found' }),
  })
  const resposta = await criarTratadorDaConferenciaDeArquivo(deps)(pedido({ versaoId: VERSAO }))
  assert.equal(resposta.status, 409)
  assert.equal((await resposta.json()).erro, 'arquivo_nao_encontrado')
  assert.equal(chamadas.registrar.length, 0)
})

Deno.test('falha ao gravar é 500 e o log não leva o JWT', async () => {
  const linhas: string[] = []
  const { deps } = dependencias({
    registrar: () => Promise.resolve({ dados: null, erro: 'permission denied' }),
    log: (linha) => linhas.push(linha),
  })
  const resposta = await criarTratadorDaConferenciaDeArquivo(deps)(
    pedido({ versaoId: VERSAO }, { Authorization: 'Bearer segredo-do-jwt' }),
  )
  assert.equal(resposta.status, 500)
  assert.ok(linhas.length > 0)
  assert.ok(linhas.every((l) => !l.includes('segredo-do-jwt')))
})
