import assert from 'node:assert/strict'

import {
  BUSCAS_POR_MINUTO,
  CAIXA_DE_SC,
  criarTratadorDaBuscaDeEndereco,
  IDENTIFICACAO,
  interpretarLote,
  interpretarResposta,
  lerInscricao,
  lerTexto,
  urlDaBusca,
  urlDaInscricao,
} from './busca-de-endereco.ts'
// Respostas gravadas do Photon em 20/11/2026, só com os campos usados. Import de JSON para o teste
// rodar sem --allow-read, como no CI.
import avenidaPaulista from './fixtures-endereco/avenida-paulista.json' with { type: 'json' }
import donaFrancisca from './fixtures-endereco/dona-francisca.json' with { type: 'json' }
// Respostas gravadas do SIMGeo de Joinville em 20/11/2026 (camada de lotes, só iq, quadra e lote).
import inscricaoCentro from './fixtures-endereco/inscricao-centro.json' with { type: 'json' }
import inscricaoInexistente from './fixtures-endereco/inscricao-inexistente.json' with { type: 'json' }

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

Deno.test('inscrição: reconhece com pontos, espaços e zeros à esquerda; endereço não é', () => {
  assert.equal(lerInscricao('13.20.23.07.0239'), '13-20-23-7-239')
  assert.equal(lerInscricao('13 20 23 7 239 000'), '13-20-23-7-239')
  assert.equal(lerInscricao('Rua Dona Francisca'), null)
  assert.equal(lerInscricao('89201-000'), null)
})

Deno.test('inscrição: a consulta pede só os campos públicos do lote, em graus', () => {
  const url = new URL(urlDaInscricao('13-20-23-7-239'))
  assert.match(url.pathname, /divisao_territorial_simgeo_v4\/MapServer\/4\/query$/)
  assert.equal(url.searchParams.get('where'), "iq='13-20-23-7-239'")
  assert.equal(url.searchParams.get('outFields'), 'iq,quadra,lote')
  assert.equal(url.searchParams.get('outSR'), '4326')
})

Deno.test('inscrição achada: centro do lote, contorno e o lote no detalhe', () => {
  const [lote] = interpretarLote(inscricaoCentro)
  assert.ok(lote)
  assert.equal(lote.rotulo, 'Inscrição 13-20-23-7-239')
  assert.equal(lote.detalhe, 'Lote 239 · Joinville')
  assert.ok(Math.abs(lote.latitude - -26.3045) < 0.001)
  assert.ok(Math.abs(lote.longitude - -48.8486) < 0.001)
  assert.ok((lote.contorno?.length ?? 0) >= 4)
  // Contorno em [latitude, longitude], para o Leaflet.
  assert.ok((lote.contorno?.[0]?.[0] ?? 0) < -26)
})

Deno.test('inscrição que não existe: nenhuma sugestão', () => {
  assert.deepEqual(interpretarLote(inscricaoInexistente), [])
})

Deno.test('inscrição: vai ao SIMGeo (não ao Photon) e devolve a inscrição lida', async () => {
  const { f, chamadas } = fetchFalso([inscricaoCentro])
  const tratar = criarTratadorDaBuscaDeEndereco({ fetch: f })
  const resposta = (await (await tratar(pedido({ texto: '13.20.23.07.0239' }))).json()) as {
    sugestoes: { rotulo: string }[]
    inscricao: string
  }
  assert.equal(resposta.inscricao, '13-20-23-7-239')
  assert.equal(resposta.sugestoes[0]?.rotulo, 'Inscrição 13-20-23-7-239')
  assert.match(chamadas[0]?.url ?? '', /geo\.joinville\.sc\.gov\.br/)
  // Mesma inscrição escrita de outro jeito: cache.
  await tratar(pedido({ texto: '13-20-23-7-239' }))
  assert.equal(chamadas.length, 1)
})

Deno.test('SIMGeo fora do ar ou com erro: 502 próprio, para a tela explicar', async () => {
  const fora = criarTratadorDaBuscaDeEndereco({ fetch: fetchFalso([new Error('rede')]).f })
  const r1 = await fora(pedido({ texto: '13-20-23-7-239' }))
  assert.equal(r1.status, 502)
  assert.deepEqual(await r1.json(), { erro: 'simgeo_indisponivel' })
  const comErro = criarTratadorDaBuscaDeEndereco({
    fetch: fetchFalso([{ error: { code: 400, message: 'Invalid query' } }]).f,
  })
  assert.equal((await comErro(pedido({ texto: '13-20-23-7-239' }))).status, 502)
})
