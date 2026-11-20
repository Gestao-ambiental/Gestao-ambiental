// Busca de endereço da triagem, regras da Edge Function buscar-endereco, testadas com `deno test` e
// respostas gravadas do provedor.
//
// Provedor: Photon (photon.komoot.io), feito para busca enquanto se digita, sem chave, dados do
// OpenStreetMap (ODbL, com atribuição na tela). O Nominatim proíbe autocompletar, por isso não é
// usado. Uso justo: a tela espera a pessoa parar de digitar, aqui há cache por texto e limite por
// sessão, e o pedido se identifica pelo User-Agent. Só Santa Catarina (caixa do estado e filtro
// pelo estado na resposta). O CEP do OpenStreetMap é pouco confiável e não é devolvido.
// Nada do texto buscado vai para o log.

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

export interface SugestaoDeEndereco {
  rotulo: string
  detalhe: string | null
  latitude: number
  longitude: number
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

    const chave = busca.toLowerCase()
    const guardado = cache.get(chave)
    if (guardado && agora() - guardado.em < VALIDADE_DO_CACHE_MS) {
      return responder({ sugestoes: guardado.sugestoes })
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

    if (cache.size >= LIMITE_DO_CACHE) {
      const maisAntiga = cache.keys().next().value
      if (maisAntiga !== undefined) cache.delete(maisAntiga)
    }
    cache.set(chave, { em: agora(), sugestoes })
    return responder({ sugestoes })
  }
}
