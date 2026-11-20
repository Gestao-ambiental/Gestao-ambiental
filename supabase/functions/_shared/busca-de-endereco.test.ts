import assert from 'node:assert/strict'

import {
  BUSCAS_POR_MINUTO,
  CAIXA_DE_SC,
  criarTratadorDaBuscaDeEndereco,
  IDENTIFICACAO,
  interpretarResposta,
  lerTexto,
  urlDaBusca,
} from './busca-de-endereco.ts'
// Respostas gravadas do Photon em 20/11/2026, só com os campos usados. Import de JSON para o teste
// rodar sem --allow-read, como no CI.
import avenidaPaulista from './fixtures-endereco/avenida-paulista.json' with { type: 'json' }
import donaFrancisca from './fixtures-endereco/dona-francisca.json' with { type: 'json' }

function pedido(corpo: unknown, autorizacao: string | null = 'Bearer sessao-1'): Request {
  return new Request('http://local/buscar-endereco', {
    method: 'POST',
    headers: autorizacao ? { Authorization: autorizacao } : {},
    body: JSON.stringify(corpo),
  })
}

function fetchFalso(respostas: unknown[]) {
  const chamadas: { url: string; init?: RequestInit }[] = []
  const f = ((url: string, init?: RequestInit) => {
    chamadas.push({ url, init })
    const resposta = respostas.shift()
    if (resposta instanceof Error) return Promise.reject(resposta)
    return Promise.resolve(new Response(JSON.stringify(resposta ?? { features: [] })))
  }) as unknown as typeof fetch
  return { f, chamadas }
}

Deno.test('lê o texto e limpa os espaços', () => {
  assert.equal(lerTexto({ texto: '  Rua   Dona Francisca ' }), 'Rua Dona Francisca')
  assert.equal(lerTexto({ texto: 12 }), null)
  assert.equal(lerTexto(null), null)
})

Deno.test('a busca vai ao Photon só na caixa de SC, com nomes locais', () => {
  const url = new URL(urlDaBusca('Rua Dona Francisca'))
  assert.equal(url.origin + url.pathname, 'https://photon.komoot.io/api/')
  assert.equal(url.searchParams.get('q'), 'Rua Dona Francisca')
  assert.equal(url.searchParams.get('bbox'), CAIXA_DE_SC)
  assert.equal(url.searchParams.get('lang'), 'default')
})

Deno.test('sugestões de SC, sem repetidas e sem CEP', () => {
  const sugestoes = interpretarResposta(donaFrancisca)
  assert.deepEqual(sugestoes[0], {
    rotulo: 'Rua Dona Francisca',
    detalhe: 'Centro, Joinville',
    latitude: sugestoes[0]?.latitude,
    longitude: sugestoes[0]?.longitude,
  })
  assert.equal(sugestoes.length, 2)
  assert.ok(sugestoes.every((s) => !/\d{5}-\d{3}/.test(`${s.rotulo} ${s.detalhe ?? ''}`)))
})

Deno.test('o que vazar de outro estado fica de fora', () => {
  const sugestoes = interpretarResposta(avenidaPaulista)
  assert.ok(sugestoes.length > 0)
  assert.ok(sugestoes.every((s) => !s.detalhe?.includes('Caxias do Sul')))
})

Deno.test('casa com número: rua e número na linha principal', () => {
  const sugestoes = interpretarResposta({
    features: [
      {
        geometry: { coordinates: [-48.84, -26.3] },
        properties: {
          type: 'house',
          street: 'Rua Dona Francisca',
          housenumber: '600',
          city: 'Joinville',
          state: 'Santa Catarina',
          countrycode: 'BR',
        },
      },
    ],
  })
  assert.equal(sugestoes[0]?.rotulo, 'Rua Dona Francisca, 600')
})

Deno.test('sem sessão: 401; texto curto: 400, sem ir ao provedor', async () => {
  const { f, chamadas } = fetchFalso([])
  const tratar = criarTratadorDaBuscaDeEndereco({ fetch: f })
  assert.equal((await tratar(pedido({ texto: 'Rua Dona' }, null))).status, 401)
  const curta = await tratar(pedido({ texto: 'Rua' }))
  assert.equal(curta.status, 400)
  assert.deepEqual(await curta.json(), { erro: 'texto_curto' })
  assert.equal(chamadas.length, 0)
})

Deno.test('responde com as sugestões, se identifica e guarda em cache', async () => {
  const { f, chamadas } = fetchFalso([donaFrancisca])
  const tratar = criarTratadorDaBuscaDeEndereco({ fetch: f })
  const primeira = (await (await tratar(pedido({ texto: 'Rua Dona Francisca' }))).json()) as {
    sugestoes: unknown[]
  }
  assert.equal(primeira.sugestoes.length, 2)
  const cabecalhos = new Headers(chamadas[0]?.init?.headers)
  assert.equal(cabecalhos.get('User-Agent'), IDENTIFICACAO)

  // Mesmo texto (com outra caixa): vem do cache, sem nova ida ao provedor.
  const segunda = await tratar(pedido({ texto: 'rua dona francisca' }, 'Bearer sessao-2'))
  assert.equal(segunda.status, 200)
  assert.equal(chamadas.length, 1)
})

Deno.test('limite por sessão: passou de 30 por minuto, 429; um minuto depois, volta', async () => {
  let relogio = 0
  const { f } = fetchFalso([])
  const tratar = criarTratadorDaBuscaDeEndereco({ fetch: f, agora: () => relogio })
  for (let i = 0; i < BUSCAS_POR_MINUTO; i++) {
    assert.equal((await tratar(pedido({ texto: `Rua ${String(i)} centro` }))).status, 200)
  }
  const barrada = await tratar(pedido({ texto: 'Rua mais uma' }))
  assert.equal(barrada.status, 429)
  assert.deepEqual(await barrada.json(), { erro: 'muitas_buscas' })
  // Outra sessão não é afetada.
  assert.equal((await tratar(pedido({ texto: 'Rua de outra' }, 'Bearer outra'))).status, 200)
  relogio = 61_000
  assert.equal((await tratar(pedido({ texto: 'Rua mais uma' }))).status, 200)
})

Deno.test('provedor fora do ar: 502 com motivo, para a tela sugerir o mapa', async () => {
  const { f } = fetchFalso([new Error('rede')])
  const tratar = criarTratadorDaBuscaDeEndereco({ fetch: f })
  const resposta = await tratar(pedido({ texto: 'Rua Dona Francisca' }))
  assert.equal(resposta.status, 502)
  assert.deepEqual(await resposta.json(), { erro: 'provedor_indisponivel' })
})
