import assert from 'node:assert/strict'

import {
  CAMADAS,
  type Camada,
  consultarLocal,
  criarTratadorDaConsultaDeLocal,
  dentroDeSantaCatarina,
  interpretarRespostas,
  lerPonto,
  urlDaConsulta,
} from './consulta-de-local.ts'
// Respostas gravadas dos serviços em 19/11/2026, só com os campos pedidos. Import de JSON para o
// teste rodar sem --allow-read, como no CI.
import apaMunicipio from './fixtures-local/apa-municipio.json' with { type: 'json' }
import apaUc from './fixtures-local/apa-uc.json' with { type: 'json' }
import centroApp from './fixtures-local/centro-app.json' with { type: 'json' }
import centroBairro from './fixtures-local/centro-bairro.json' with { type: 'json' }
import centroInundacao from './fixtures-local/centro-inundacao.json' with { type: 'json' }
import centroLote from './fixtures-local/centro-lote.json' with { type: 'json' }
import centroMunicipio from './fixtures-local/centro-municipio.json' with { type: 'json' }
import centroZoneamento from './fixtures-local/centro-zoneamento.json' with { type: 'json' }
import floripaMunicipio from './fixtures-local/floripa-municipio.json' with { type: 'json' }
import rioApp from './fixtures-local/rio-app.json' with { type: 'json' }
import rioPonto from './fixtures-local/rio-ponto.json' with { type: 'json' }

const FIXTURES: Record<string, unknown> = {
  'apa-municipio': apaMunicipio,
  'apa-uc': apaUc,
  'centro-app': centroApp,
  'centro-bairro': centroBairro,
  'centro-inundacao': centroInundacao,
  'centro-lote': centroLote,
  'centro-municipio': centroMunicipio,
  'centro-zoneamento': centroZoneamento,
  'floripa-municipio': floripaMunicipio,
  'rio-app': rioApp,
}

function fixture(nome: string): Promise<unknown> {
  if (!(nome in FIXTURES)) throw new Error(`fixture ${nome} não existe`)
  return Promise.resolve(FIXTURES[nome])
}

const VAZIO = { features: [] }
const CENTRO = { latitude: -26.3044, longitude: -48.8487 }

interface Rota {
  camada: Camada
  corpo: unknown
  status?: number
}

/** fetch falso: responde pela camada cuja URL começa o endereço; o resto volta vazio. */
function fetchFalso(rotas: Rota[], chamadas: string[] = []): typeof fetch {
  return ((url: string) => {
    chamadas.push(url)
    const rota = rotas.find((r) => url.startsWith(`${r.camada.url}/query?`))
    if (rota?.status && rota.status !== 200) {
      return Promise.resolve(new Response('erro', { status: rota.status }))
    }
    return Promise.resolve(new Response(JSON.stringify(rota?.corpo ?? VAZIO), { status: 200 }))
  }) as typeof fetch
}

Deno.test('urlDaConsulta: ponto em WGS84, campos explícitos e raio só na APP', () => {
  const url = new URL(urlDaConsulta(CAMADAS.lote, CENTRO))
  assert.equal(url.searchParams.get('geometry'), '-48.8487,-26.3044')
  assert.equal(url.searchParams.get('inSR'), '4326')
  assert.equal(url.searchParams.get('outFields'), 'iq,quadra,lote,st_area(shape)')
  assert.equal(url.searchParams.get('returnGeometry'), 'false')
  assert.equal(url.searchParams.get('distance'), null)
  const app = new URL(urlDaConsulta(CAMADAS.faixaMarginal, CENTRO))
  assert.equal(app.searchParams.get('distance'), '30')
  assert.equal(app.searchParams.get('units'), 'esriSRUnit_Meter')
})

Deno.test('nenhuma camada pede dado pessoal (proprietário ou usuário de rede)', () => {
  for (const c of Object.values(CAMADAS)) {
    assert.doesNotMatch(c.outFields, /\*|nom_propri|usuario|created_user|responsavel/i, c.chave)
  }
})

Deno.test('Centro de Joinville: município, lote, bairro, setor e mancha de inundação', async () => {
  const chamadas: string[] = []
  const r = await consultarLocal(
    fetchFalso(
      [
        { camada: CAMADAS.municipio, corpo: await fixture('centro-municipio') },
        { camada: CAMADAS.lote, corpo: await fixture('centro-lote') },
        { camada: CAMADAS.bairro, corpo: await fixture('centro-bairro') },
        { camada: CAMADAS.zoneamento, corpo: await fixture('centro-zoneamento') },
        { camada: CAMADAS.faixaMarginal, corpo: await fixture('centro-app') },
        { camada: CAMADAS.inundacao, corpo: await fixture('centro-inundacao') },
      ],
      chamadas,
    ),
    CENTRO,
  )
  assert.deepEqual(r.municipio, { codigoIbge: '4209102', nome: 'Joinville' })
  assert.equal(r.bairro, 'CENTRO')
  assert.deepEqual(r.zoneamento, { setor: 'SA-01', macrozona: 'AUAP' })
  assert.ok(r.lote?.inscricaoImobiliaria)
  assert.ok((r.lote?.areaM2 ?? 0) > 0)
  assert.deepEqual(
    r.restricoes.map((x) => x.tipo),
    ['inundacao'],
  )
  assert.deepEqual(r.falhas, [])
  // 5 camadas estaduais + 6 de Joinville.
  assert.equal(chamadas.length, 11)
})

Deno.test('fora de Joinville não consulta o SIMGeo (Florianópolis)', async () => {
  const chamadas: string[] = []
  const r = await consultarLocal(
    fetchFalso(
      [{ camada: CAMADAS.municipio, corpo: await fixture('floripa-municipio') }],
      chamadas,
    ),
    { latitude: -27.5969, longitude: -48.5482 },
  )
  assert.equal(r.municipio?.nome, 'Florianópolis')
  assert.equal(r.lote, null)
  assert.equal(r.zoneamento, null)
  assert.equal(chamadas.length, 5)
  assert.ok(chamadas.every((u) => u.startsWith('https://geo.ima.sc.gov.br/')))
})

Deno.test('APA Serra Dona Francisca vira restrição de unidade de conservação', async () => {
  const r = await consultarLocal(
    fetchFalso([
      { camada: CAMADAS.municipio, corpo: await fixture('apa-municipio') },
      { camada: CAMADAS.unidadeDeConservacao, corpo: await fixture('apa-uc') },
    ]),
    { latitude: -26.2, longitude: -48.95 },
  )
  const uc = r.restricoes.find((x) => x.tipo === 'unidade_de_conservacao')
  assert.ok(uc)
  assert.match(uc.descricao, /SERRA DONA FRANCISCA/)
  assert.match(uc.descricao, /\(municipal\)/)
})

Deno.test('interpretarRespostas: camada não consultada não conta como falha', () => {
  const r = interpretarRespostas({ municipio: [{ CD_MUN: '4205407', NM_MUN: 'Florianópolis' }] })
  assert.deepEqual(r.falhas, [])
  assert.deepEqual(r.fontes, [CAMADAS.municipio.fonte])
})

Deno.test('APP: junta as faixas da mesma restrição e mostra a maior largura', async () => {
  const r2 = await consultarLocal(
    fetchFalso([
      { camada: CAMADAS.municipio, corpo: await fixture('centro-municipio') },
      { camada: CAMADAS.faixaMarginal, corpo: await fixture('rio-app') },
    ]),
    rioPonto,
  )
  assert.deepEqual(r2.restricoes, [
    {
      tipo: 'app',
      descricao: 'APP de curso d’água (faixa de 50 m) a menos de 30 m do ponto',
      fonte: CAMADAS.faixaMarginal.fonte,
    },
  ])
})

Deno.test(
  'camada que falha ou devolve erro do ArcGIS entra em falhas, sem derrubar as outras',
  async () => {
    const r = await consultarLocal(
      fetchFalso([
        { camada: CAMADAS.municipio, corpo: await fixture('centro-municipio') },
        { camada: CAMADAS.zoneamento, corpo: null, status: 500 },
        { camada: CAMADAS.lote, corpo: { error: { code: 400, message: 'Invalid query' } } },
      ]),
      CENTRO,
    )
    assert.equal(r.municipio?.nome, 'Joinville')
    assert.deepEqual(r.falhas.sort(), [CAMADAS.lote.fonte, CAMADAS.zoneamento.fonte].sort())
    assert.equal(r.lote, null)
  },
)

Deno.test('fetch que lança (tempo esgotado) também vira falha', async () => {
  const r = await consultarLocal(
    (() => Promise.reject(new DOMException('timeout', 'TimeoutError'))) as typeof fetch,
    CENTRO,
  )
  assert.equal(r.municipio, null)
  assert.equal(r.falhas.length, 5)
})

Deno.test('lerPonto e dentroDeSantaCatarina', () => {
  assert.deepEqual(lerPonto({ latitude: -26.3, longitude: -48.8 }), {
    latitude: -26.3,
    longitude: -48.8,
  })
  assert.equal(lerPonto({ latitude: '-26.3', longitude: -48.8 }), null)
  assert.equal(lerPonto(null), null)
  assert.equal(lerPonto({ latitude: -23.55, longitude: -46.63 }), 'fora_de_sc') // São Paulo
  assert.equal(dentroDeSantaCatarina({ latitude: -27.6, longitude: -48.55 }), true)
})

Deno.test('tratador: OPTIONS, sem JWT, ponto inválido, fora de SC e sucesso', async () => {
  const tratar = criarTratadorDaConsultaDeLocal({
    fetch: fetchFalso([{ camada: CAMADAS.municipio, corpo: await fixture('floripa-municipio') }]),
  })
  const url = 'https://exemplo.test/functions/v1/consultar-local'
  const post = (corpo: string, autorizacao = 'Bearer jwt') =>
    new Request(url, {
      method: 'POST',
      headers: autorizacao ? { Authorization: autorizacao } : {},
      body: corpo,
    })

  assert.equal((await tratar(new Request(url, { method: 'OPTIONS' }))).status, 200)
  assert.equal((await tratar(post('{}', ''))).status, 401)
  assert.equal((await tratar(post('nao é json'))).status, 400)
  assert.equal((await tratar(post('{"latitude":1}'))).status, 400)
  const fora = await tratar(post('{"latitude":-23.55,"longitude":-46.63}'))
  assert.equal(fora.status, 422)
  assert.deepEqual(await fora.json(), { erro: 'fora_de_santa_catarina' })
  const ok = await tratar(post('{"latitude":-27.5969,"longitude":-48.5482}'))
  assert.equal(ok.status, 200)
  assert.equal(
    ((await ok.json()) as { municipio: { nome: string } }).municipio.nome,
    'Florianópolis',
  )
})
