// Consulta do local do empreendimento (docs/estudos/enquadramento-automatico.md), regras da Edge
// Function consultar-local, testadas com `deno test` e respostas gravadas dos serviços.
//
// Dado um ponto (latitude, longitude) em Santa Catarina, consulta camadas públicas de ArcGIS:
// - IMA (SC inteira): município (IBGE 2022), unidades de conservação, zona de amortecimento
//   estadual, terras indígenas e comunidades quilombolas;
// - SIMGeo de Joinville (só quando o ponto cai em Joinville): lote e inscrição imobiliária, bairro,
//   setor do zoneamento (LC 470/2017), faixa marginal (APP/FNE) num raio, mancha de inundação e
//   risco geológico.
//
// Sempre com outFields explícitos: algumas camadas trazem nome de proprietário e usuário de rede,
// que não pedimos nem devolvemos. Uma camada que falha não derruba as outras: vira item de `falhas`.
// Nada da consulta vai para o log.

import { CORS, responder } from './aviso-de-suporte.ts'

export const LIMITE_TEMPO_CAMADA_MS = 12_000
export const CODIGO_IBGE_JOINVILLE = '4209102'
/** Raio da busca de APP/FNE em volta do ponto: o ponto marcado raramente cai exatamente na faixa. */
export const RAIO_APP_METROS = 30

const IMA = 'https://geo.ima.sc.gov.br/server/rest/services'
const SIMGEO = 'https://geo.joinville.sc.gov.br/server/rest/services'

export interface Camada {
  chave: string
  /** Endereço da camada (MapServer/<id>), sem /query. */
  url: string
  outFields: string
  raioMetros?: number
  fonte: string
}

export const CAMADAS = {
  municipio: {
    chave: 'municipio',
    url: `${IMA}/Limites_Administrativos/MapServer/168`,
    outFields: 'CD_MUN,NM_MUN',
    fonte: 'IMA/SC, limite municipal IBGE 2022',
  },
  unidadeDeConservacao: {
    chave: 'unidade_de_conservacao',
    url: `${IMA}/%C3%81reas_Protegidas/MapServer/204`,
    outFields: 'nome_uc,esfera,categoria',
    fonte: 'IMA/SC, Unidades de Conservação (CNUC)',
  },
  zonaDeAmortecimento: {
    chave: 'zona_de_amortecimento',
    url: `${IMA}/%C3%81reas_Protegidas/MapServer/266`,
    outFields: 'zam_nm_micro',
    fonte: 'IMA/SC, Zona de Amortecimento Estadual',
  },
  terraIndigena: {
    chave: 'terra_indigena',
    url: `${IMA}/%C3%81reas_Protegidas/MapServer/187`,
    outFields: 'terrai_nome,fase_ti',
    fonte: 'IMA/SC, Terra Indígena (FUNAI)',
  },
  quilombola: {
    chave: 'quilombola',
    url: `${IMA}/%C3%81reas_Protegidas/MapServer/240`,
    outFields: 'qui_nm_comunidade',
    fonte: 'IMA/SC, Quilombola (INCRA)',
  },
  lote: {
    chave: 'lote',
    url: `${SIMGEO}/SEPUR/divisao_territorial_simgeo_v4/MapServer/4`,
    outFields: 'iq,quadra,lote,st_area(shape)',
    fonte: 'SIMGeo Joinville, Lotes Urbanos',
  },
  bairro: {
    chave: 'bairro',
    url: `${SIMGEO}/SEPUR/divisao_territorial_simgeo_v4/MapServer/3`,
    outFields: 'nome_bairr',
    fonte: 'SIMGeo Joinville, Limite de Bairros',
  },
  zoneamento: {
    chave: 'zoneamento',
    url: `${SIMGEO}/SEPUR/ordenamento_territorial_simgeo_v4/MapServer/49`,
    outFields: 'sigla_z,legenda_m',
    fonte: 'SIMGeo Joinville, Setores do zoneamento (LC 470/2017)',
  },
  faixaMarginal: {
    chave: 'faixa_marginal',
    url: `${SIMGEO}/SAMA/consulta_usos_aplicativo/MapServer/5`,
    outFields: 'restricao,faixa',
    raioMetros: RAIO_APP_METROS,
    fonte: 'SIMGeo Joinville, Faixa marginal (APP/FNE)',
  },
  inundacao: {
    chave: 'inundacao',
    url: `${SIMGEO}/SAMA/consulta_usos_aplicativo/MapServer/9`,
    outFields: 'objectid',
    fonte: 'SIMGeo Joinville, Mancha de inundação',
  },
  riscoGeologico: {
    chave: 'risco_geologico',
    url: `${SIMGEO}/SAMA/consulta_usos_aplicativo/MapServer/8`,
    outFields: 'grau_risco,tipologia',
    fonte: 'SIMGeo Joinville, Risco geológico',
  },
} as const satisfies Record<string, Camada>

export interface Ponto {
  latitude: number
  longitude: number
}

/** Retângulo que contém Santa Catarina (com folga); fora dele, nem consulta. */
export function dentroDeSantaCatarina(p: Ponto): boolean {
  return p.latitude >= -29.5 && p.latitude <= -25.8 && p.longitude >= -54 && p.longitude <= -48.2
}

export function urlDaConsulta(camada: Camada, p: Ponto): string {
  const parametros = new URLSearchParams({
    geometry: `${String(p.longitude)},${String(p.latitude)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: camada.outFields,
    returnGeometry: 'false',
    f: 'json',
  })
  if (camada.raioMetros) {
    parametros.set('distance', String(camada.raioMetros))
    parametros.set('units', 'esriSRUnit_Meter')
  }
  return `${camada.url}/query?${parametros.toString()}`
}

type Atributos = Record<string, unknown>

/** Atributos das feições de uma resposta do ArcGIS; null se a resposta é erro ou não é ArcGIS. */
export function atributosDaResposta(corpo: unknown): Atributos[] | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  if ('error' in corpo) return null
  const features = (corpo as { features?: unknown }).features
  if (!Array.isArray(features)) return null
  return features.flatMap((f: unknown) => {
    const a = (f as { attributes?: unknown } | null)?.attributes
    return typeof a === 'object' && a !== null ? [a as Atributos] : []
  })
}

async function consultarCamada(
  doFetch: typeof fetch,
  camada: Camada,
  p: Ponto,
): Promise<Atributos[] | null> {
  try {
    const resposta = await doFetch(urlDaConsulta(camada, p), {
      signal: AbortSignal.timeout(LIMITE_TEMPO_CAMADA_MS),
    })
    if (!resposta.ok) return null
    return atributosDaResposta(await resposta.json())
  } catch {
    return null
  }
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null

const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export type TipoDeRestricao =
  | 'app'
  | 'faixa_nao_edificavel'
  | 'inundacao'
  | 'risco_geologico'
  | 'unidade_de_conservacao'
  | 'zona_de_amortecimento'
  | 'terra_indigena'
  | 'quilombola'

export interface Restricao {
  tipo: TipoDeRestricao
  descricao: string
  fonte: string
}

export interface ResultadoDoLocal {
  municipio: { codigoIbge: string; nome: string } | null
  /** Só em Joinville (SIMGeo). */
  lote: {
    inscricaoImobiliaria: string | null
    quadra: string | null
    lote: string | null
    /** Área do polígono do lote, em m² (SIRGAS 2000 / UTM 22S). */
    areaM2: number | null
  } | null
  bairro: string | null
  zoneamento: { setor: string; macrozona: string | null } | null
  restricoes: Restricao[]
  /** Camadas que não responderam: o resultado está incompleto nelas. */
  falhas: string[]
  /** Camadas consultadas, para citar a fonte. */
  fontes: string[]
}

/** Monta o resultado a partir das respostas de cada camada (null = falhou ou não consultada). */
export function interpretarRespostas(
  respostas: Partial<Record<keyof typeof CAMADAS, Atributos[] | null>>,
): ResultadoDoLocal {
  const falhas: string[] = []
  const fontes: string[] = []
  const de = (k: keyof typeof CAMADAS): Atributos[] => {
    if (!(k in respostas)) return []
    const r = respostas[k]
    fontes.push(CAMADAS[k].fonte)
    if (r === null || r === undefined) {
      falhas.push(CAMADAS[k].fonte)
      return []
    }
    return r
  }

  const m = de('municipio')[0]
  const codigo = texto(m?.CD_MUN)
  const nomeMunicipio = texto(m?.NM_MUN)
  const municipio = codigo && nomeMunicipio ? { codigoIbge: codigo, nome: nomeMunicipio } : null

  const l = de('lote')[0]
  const lote = l
    ? {
        inscricaoImobiliaria: texto(l.iq),
        quadra: texto(l.quadra),
        lote: texto(l.lote),
        areaM2: numero(l['st_area(shape)']),
      }
    : null

  const bairro = texto(de('bairro')[0]?.nome_bairr)
  const z = de('zoneamento')[0]
  const setor = texto(z?.sigla_z)
  const zoneamento = setor ? { setor, macrozona: texto(z?.legenda_m) } : null

  const restricoes: Restricao[] = []
  const faixas = de('faixaMarginal')
  for (const tipo of ['APP', 'APPU', 'FNE'] as const) {
    const larguras = faixas
      .filter((a) => texto(a.restricao) === tipo)
      .map((a) => numero(a.faixa))
      .filter((v): v is number => v !== null)
    if (larguras.length === 0 && !faixas.some((a) => texto(a.restricao) === tipo)) continue
    const maior = larguras.length > 0 ? Math.max(...larguras) : null
    const nome =
      tipo === 'FNE'
        ? 'Faixa não edificável'
        : tipo === 'APPU'
          ? 'APP urbana de curso d’água'
          : 'APP de curso d’água'
    restricoes.push({
      tipo: tipo === 'FNE' ? 'faixa_nao_edificavel' : 'app',
      descricao: `${nome}${maior !== null ? ` (faixa de ${String(maior)} m)` : ''} a menos de ${String(RAIO_APP_METROS)} m do ponto`,
      fonte: CAMADAS.faixaMarginal.fonte,
    })
  }
  if (de('inundacao').length > 0) {
    restricoes.push({
      tipo: 'inundacao',
      descricao: 'Dentro da mancha de inundação',
      fonte: CAMADAS.inundacao.fonte,
    })
  }
  for (const r of de('riscoGeologico')) {
    const grau = texto(r.grau_risco)
    const tipologia = texto(r.tipologia)
    restricoes.push({
      tipo: 'risco_geologico',
      descricao: ['Setor de risco geológico', tipologia, grau ? `grau ${grau}` : null]
        .filter(Boolean)
        .join(', '),
      fonte: CAMADAS.riscoGeologico.fonte,
    })
  }
  for (const u of de('unidadeDeConservacao')) {
    const nome = texto(u.nome_uc)
    if (!nome) continue
    const esfera = texto(u.esfera)
    restricoes.push({
      tipo: 'unidade_de_conservacao',
      descricao: `${nome}${esfera ? ` (${esfera.toLowerCase()})` : ''}`,
      fonte: CAMADAS.unidadeDeConservacao.fonte,
    })
  }
  for (const z2 of de('zonaDeAmortecimento')) {
    restricoes.push({
      tipo: 'zona_de_amortecimento',
      descricao: `Zona de amortecimento${texto(z2.zam_nm_micro) ? `: ${String(texto(z2.zam_nm_micro))}` : ''}`,
      fonte: CAMADAS.zonaDeAmortecimento.fonte,
    })
  }
  for (const t of de('terraIndigena')) {
    restricoes.push({
      tipo: 'terra_indigena',
      descricao: `Terra indígena${texto(t.terrai_nome) ? ` ${String(texto(t.terrai_nome))}` : ''}`,
      fonte: CAMADAS.terraIndigena.fonte,
    })
  }
  for (const q of de('quilombola')) {
    restricoes.push({
      tipo: 'quilombola',
      descricao: `Comunidade quilombola${texto(q.qui_nm_comunidade) ? ` ${String(texto(q.qui_nm_comunidade))}` : ''}`,
      fonte: CAMADAS.quilombola.fonte,
    })
  }

  return { municipio, lote, bairro, zoneamento, restricoes, falhas, fontes }
}

/** Consulta todas as camadas do ponto: primeiro o município, e o SIMGeo só em Joinville. */
export async function consultarLocal(doFetch: typeof fetch, p: Ponto): Promise<ResultadoDoLocal> {
  const estaduais = [
    'municipio',
    'unidadeDeConservacao',
    'zonaDeAmortecimento',
    'terraIndigena',
    'quilombola',
  ] as const
  const respostas: Partial<Record<keyof typeof CAMADAS, Atributos[] | null>> = {}
  await Promise.all(
    estaduais.map(async (k) => {
      respostas[k] = await consultarCamada(doFetch, CAMADAS[k], p)
    }),
  )
  const codigo = texto(respostas.municipio?.[0]?.CD_MUN)
  if (codigo === CODIGO_IBGE_JOINVILLE) {
    const deJoinville = [
      'lote',
      'bairro',
      'zoneamento',
      'faixaMarginal',
      'inundacao',
      'riscoGeologico',
    ] as const
    await Promise.all(
      deJoinville.map(async (k) => {
        respostas[k] = await consultarCamada(doFetch, CAMADAS[k], p)
      }),
    )
  }
  return interpretarRespostas(respostas)
}

/** Lê { latitude, longitude } do corpo; null se faltar, não for número ou estiver fora de SC. */
export function lerPonto(corpo: unknown): Ponto | 'fora_de_sc' | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  const { latitude, longitude } = corpo as Record<string, unknown>
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const p = { latitude, longitude }
  return dentroDeSantaCatarina(p) ? p : 'fora_de_sc'
}

export interface DependenciasDaConsultaDeLocal {
  fetch: typeof fetch
}

/**
 * POST { latitude, longitude } com o JWT de quem está logado (verify_jwt do Supabase confere a
 * assinatura; aqui só exigimos o header). Devolve ResultadoDoLocal.
 */
export function criarTratadorDaConsultaDeLocal(
  deps: DependenciasDaConsultaDeLocal,
): (pedido: Request) => Promise<Response> {
  return async (pedido) => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_nao_permitido' }, 405)
    if (!pedido.headers.get('Authorization')) return responder({ erro: 'sem_permissao' }, 401)

    let corpo: unknown
    try {
      corpo = await pedido.json()
    } catch {
      return responder({ erro: 'ponto_invalido' }, 400)
    }
    const ponto = lerPonto(corpo)
    if (ponto === null) return responder({ erro: 'ponto_invalido' }, 400)
    if (ponto === 'fora_de_sc') return responder({ erro: 'fora_de_santa_catarina' }, 422)

    const resultado = await consultarLocal(deps.fetch, ponto)
    return responder({ ...resultado })
  }
}
