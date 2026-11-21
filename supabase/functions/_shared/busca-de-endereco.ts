// Busca de endereço da triagem, regras da Edge Function buscar-endereco, testadas com `deno test` e
// respostas gravadas do provedor.
//
// Provedor: Photon (photon.komoot.io), feito para busca enquanto se digita, sem chave, dados do
// OpenStreetMap (ODbL, com atribuição na tela). O Nominatim proíbe autocompletar, por isso não é
// usado. Uso justo: a tela espera a pessoa parar de digitar, aqui há cache por texto e limite por
// sessão, e o pedido se identifica pelo User-Agent. Só Santa Catarina (caixa do estado e filtro
// pelo estado na resposta). O CEP do OpenStreetMap é pouco confiável e não é devolvido.
// Nada do texto buscado vai para o log.
//
// Inscrição imobiliária (pedido do Eduardo, 20/11/2026): quando o texto tem forma de inscrição de
// Joinville ("13-20-23-7-239", com pontos, espaços ou zeros à esquerda), a busca vai à camada de
// lotes do SIMGeo (a mesma do consultar-local), só com os campos públicos (iq, quadra, lote; nada de
// proprietário), e devolve o centro e o contorno do lote. Por enquanto, só Joinville.

import { CORS, responder } from './aviso-de-suporte.ts'

export const PHOTON = 'https://photon.komoot.io/api/'
/** Caixa de Santa Catarina (oeste, sul, leste, norte). */
export const CAIXA_DE_SC = '-53.84,-29.36,-48.35,-25.95'
export const MINIMO_DE_LETRAS = 4
export const MAXIMO_DE_LETRAS = 120
export const MAXIMO_DE_SUGESTOES = 6
export const BUSCAS_POR_MINUTO = 30
export const VALIDADE_DO_CACHE_MS = 24 * 60 * 60 * 1000
export const LIMITE_DO_CACHE = 500
export const LIMITE_TEMPO_MS = 8_000
export const IDENTIFICACAO = 'Grama/1.0 (+https://gramaapp.com.br)'
export const LOTES_DO_SIMGEO =
  'https://geo.joinville.sc.gov.br/server/rest/services/SEPUR/divisao_territorial_simgeo_v4/MapServer/4'

export interface SugestaoDeEndereco {
  rotulo: string
  detalhe: string | null
  latitude: number
  longitude: number
  /** Só na inscrição: o contorno do lote, como [latitude, longitude]. */
  contorno?: [number, number][]
}

/**
 * A inscrição no formato do SIMGeo ("13-20-23-7-239") ou nulo. A mesma regra de
 * packages/domain/src/inscricao-imobiliaria.ts (a função não importa o pacote de domínio).
 */
export function lerInscricao(texto: string): string | null {
  const limpo = texto.trim()
  if (limpo === '' || /[^\d\s.\-/]/.test(limpo)) return null
  const grupos = limpo.split(/[\s.\-/]+/).filter((g) => g !== '')
  if (grupos.length === 6 && /^0+$/.test(grupos[5] ?? '')) grupos.pop()
  if (grupos.length !== 5) return null
  if (grupos.some((g) => g.length > 5)) return null
  return grupos.map((g) => String(Number(g))).join('-')
}

/** Consulta do lote pela inscrição: só os campos públicos, geometria em graus (WGS 84). */
export function urlDaInscricao(inscricao: string): string {
  const url = new URL(`${LOTES_DO_SIMGEO}/query`)
  // A inscrição já passou por lerInscricao: só dígitos e hífens, sem aspas.
  url.searchParams.set('where', `iq='${inscricao}'`)
  url.searchParams.set('outFields', 'iq,quadra,lote')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('geometryPrecision', '6')
  url.searchParams.set('f', 'json')
  return url.toString()
}

/** Centro do polígono (fórmula do centroide; num lote, o plano em graus basta). */
function centroDoAnel(anel: [number, number][]): [number, number] {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const [x0, y0] = anel[i] as [number, number]
    const [x1, y1] = anel[i + 1] as [number, number]
    const f = x0 * y1 - x1 * y0
    area += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(area) < 1e-12) {
    const n = anel.length
    return [anel.reduce((s, p) => s + p[0], 0) / n, anel.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * area), cy / (3 * area)]
}

/** O lote achado como sugestão, ou nenhuma (inscrição que não existe no SIMGeo). */
export function interpretarLote(json: unknown): SugestaoDeEndereco[] {
  const features = (json as { features?: unknown })?.features
  if (!Array.isArray(features) || features.length === 0) return []
  const f = features[0] as {
    attributes?: Record<string, unknown>
    geometry?: { rings?: unknown }
  }
  const aneis = f.geometry?.rings
  const anel = Array.isArray(aneis) ? (aneis[0] as unknown) : null
  if (!Array.isArray(anel) || anel.length < 3) return []
  const pontos = anel.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number',
  )
  if (pontos.length < 3) return []
  const [longitude, latitude] = centroDoAnel(pontos)
  const a = f.attributes ?? {}
  const iq = typeof a.iq === 'string' ? a.iq.trim() : ''
  const quadra = typeof a.quadra === 'string' ? a.quadra.trim() : ''
  const lote = a.lote === null || a.lote === undefined ? '' : String(a.lote).trim()
  const detalhe = [quadra ? `Quadra ${quadra}` : null, lote ? `Lote ${lote}` : null, 'Joinville']
    .filter(Boolean)
    .join(' · ')
  return [
    {
      rotulo: `Inscrição ${iq}`,
      detalhe,
      latitude,
      longitude,
      contorno: pontos.map(([x, y]) => [y, x]),
    },
  ]
}

/** O texto do pedido, limpo; nulo se não for texto. */
export function lerTexto(corpo: unknown): string | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  const texto = (corpo as { texto?: unknown }).texto
  if (typeof texto !== 'string') return null
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DE_LETRAS)
}

export function urlDaBusca(texto: string): string {
  const url = new URL(PHOTON)
  url.searchParams.set('q', texto)
  url.searchParams.set('bbox', CAIXA_DE_SC)
  url.searchParams.set('limit', '10')
  // "default" devolve os nomes locais (português); o Photon não aceita "pt".
  url.searchParams.set('lang', 'default')
  return url.toString()
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Sugestões só de Santa Catarina, sem repetidas, na ordem do provedor. */
export function interpretarResposta(json: unknown): SugestaoDeEndereco[] {
  const features = (json as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  const vistas = new Set<string>()
  const sugestoes: SugestaoDeEndereco[] = []
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties ?? {}
    const coordenadas = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates
    if (!Array.isArray(coordenadas) || coordenadas.length < 2) continue
    const [longitude, latitude] = coordenadas as [unknown, unknown]
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue
    if (texto(p.countrycode) !== 'BR' || texto(p.state) !== 'Santa Catarina') continue

    const nome = texto(p.name)
    const rua = texto(p.street)
    const numero = texto(p.housenumber)
    const rotulo =
      p.type === 'house' || (!nome && rua)
        ? [rua ?? nome, numero].filter(Boolean).join(', ')
        : nome && rua && nome !== rua
          ? `${nome}, ${[rua, numero].filter(Boolean).join(', ')}`
          : nome
    if (!rotulo) continue
    const detalhe = [texto(p.district), texto(p.city) ?? texto(p.county)].filter(Boolean).join(', ')
    const chave = `${rotulo}|${detalhe}`.toLowerCase()
    if (vistas.has(chave)) continue
    vistas.add(chave)
    sugestoes.push({ rotulo, detalhe: detalhe || null, latitude, longitude })
    if (sugestoes.length === MAXIMO_DE_SUGESTOES) break
  }
  return sugestoes
}

export interface DependenciasDaBuscaDeEndereco {
  fetch: typeof fetch
  /** Relógio (ms), para os testes. */
  agora?: () => number
}

export function criarTratadorDaBuscaDeEndereco(
  deps: DependenciasDaBuscaDeEndereco,
): (pedido: Request) => Promise<Response> {
  const agora = deps.agora ?? (() => Date.now())
  const cache = new Map<string, { em: number; sugestoes: SugestaoDeEndereco[] }>()
  const pedidosPorSessao = new Map<string, number[]>()

  function guardar(chave: string, sugestoes: SugestaoDeEndereco[]) {
    if (cache.size >= LIMITE_DO_CACHE) {
      const maisAntiga = cache.keys().next().value
      if (maisAntiga !== undefined) cache.delete(maisAntiga)
    }
    cache.set(chave, { em: agora(), sugestoes })
  }

  return async (pedido) => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_nao_permitido' }, 405)
    const sessao = pedido.headers.get('Authorization')
    if (!sessao) return responder({ erro: 'sem_permissao' }, 401)

    let corpo: unknown
    try {
      corpo = await pedido.json()
    } catch {
      return responder({ erro: 'texto_curto' }, 400)
    }
    const busca = lerTexto(corpo)
    if (busca === null || busca.length < MINIMO_DE_LETRAS) {
      return responder({ erro: 'texto_curto' }, 400)
    }

    const inscricao = lerInscricao(busca)
    const chave = inscricao ? `iq:${inscricao}` : busca.toLowerCase()
    const guardado = cache.get(chave)
    if (guardado && agora() - guardado.em < VALIDADE_DO_CACHE_MS) {
      return responder({ sugestoes: guardado.sugestoes, inscricao })
    }

    // Limite por sessão: 30 buscas por minuto (o cache não conta).
    const umMinutoAtras = agora() - 60_000
    const recentes = (pedidosPorSessao.get(sessao) ?? []).filter((t) => t > umMinutoAtras)
    if (recentes.length >= BUSCAS_POR_MINUTO) {
      pedidosPorSessao.set(sessao, recentes)
      return responder({ erro: 'muitas_buscas' }, 429)
    }
    recentes.push(agora())
    pedidosPorSessao.set(sessao, recentes)

    let sugestoes: SugestaoDeEndereco[]
    if (inscricao) {
      try {
        const resposta = await deps.fetch(urlDaInscricao(inscricao), {
          headers: { 'User-Agent': IDENTIFICACAO, Accept: 'application/json' },
          signal: AbortSignal.timeout(LIMITE_TEMPO_MS),
        })
        if (!resposta.ok) return responder({ erro: 'simgeo_indisponivel' }, 502)
        const json = (await resposta.json()) as { error?: unknown }
        if (json?.error) return responder({ erro: 'simgeo_indisponivel' }, 502)
        sugestoes = interpretarLote(json)
      } catch {
        return responder({ erro: 'simgeo_indisponivel' }, 502)
      }
      guardar(chave, sugestoes)
      return responder({ sugestoes, inscricao })
    }
    try {
      const resposta = await deps.fetch(urlDaBusca(busca), {
        headers: { 'User-Agent': IDENTIFICACAO, Accept: 'application/json' },
        signal: AbortSignal.timeout(LIMITE_TEMPO_MS),
      })
      if (!resposta.ok) return responder({ erro: 'provedor_indisponivel' }, 502)
      sugestoes = interpretarResposta(await resposta.json())
    } catch {
      return responder({ erro: 'provedor_indisponivel' }, 502)
    }

    guardar(chave, sugestoes)
    return responder({ sugestoes, inscricao: null })
  }
}
