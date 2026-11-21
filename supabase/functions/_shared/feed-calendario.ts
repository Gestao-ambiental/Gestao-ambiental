// Feed do calendário (ADR-0047). A Edge Function feed-calendario só liga as dependências reais; a
// regra fica aqui, testada com `deno test` e dependências falsas.
//
// GET (ou HEAD) público em /functions/v1/feed-calendario/<token>.ics, sem login: o token (64 hex)
// é a credencial. O banco guarda só o SHA-256 dele; a função calcula o hash e chama
// feed_do_calendario com a service role. Token inválido, revogado, de membro desligado ou de
// consultoria fora de teste/ativa: o mesmo 404. Eventos de dia inteiro, só os prazos do membro,
// com título "código · empreendimento" (sem cliente e sem o texto da condicionante).
// Nunca vão para o log: o token, o hash e o conteúdo.

import { gerarIcs, type EventoIcs } from './ics.ts'
import { LINK_PADRAO_DO_BETA } from './lista-de-espera.ts'

const ROTA = /\/feed-calendario\/([0-9a-f]{64})\.ics$/

export const ROTULO_DO_TIPO: Record<string, string> = {
  ocorrencia: 'Prazo',
  validade: 'Validade',
  limite_protocolo: 'Limite de protocolo',
  exigencia: 'Exigência',
  vencimento: 'Vencimento',
}

/** Uma linha da RPC feed_do_calendario. */
export interface LinhaDoFeed {
  tipoLinha: string
  id: string
  prazo: string
  codigo: string | null
  empreendimentoNome: string | null
}

export interface DependenciasDoFeed {
  env: (nome: string) => string | undefined
  /** Service role: linhas do feed pelo hash, ou nulo quando o banco responde token_invalido. */
  feed: (hash: string) => Promise<LinhaDoFeed[] | null>
  agora?: () => Date
  /** Log da função; recebe só etapas e motivos. */
  registrar?: (linha: string) => void
}

/** SHA-256 em hexadecimal, igual a private.hash_do_token. */
export async function hashDoToken(token: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function eventosDoFeed(linhas: readonly LinhaDoFeed[], app: string): EventoIcs[] {
  return linhas.map((l) => {
    const rotulo = l.codigo?.trim() || ROTULO_DO_TIPO[l.tipoLinha] || 'Prazo'
    const empreendimento = l.empreendimentoNome?.trim()
    const caminho =
      l.tipoLinha === 'ocorrencia'
        ? 'ocorrencias'
        : l.tipoLinha === 'exigencia'
          ? 'exigencias'
          : null
    return {
      uid: `${l.tipoLinha}-${l.id}@gramaapp.com.br`,
      data: l.prazo,
      resumo: empreendimento ? `${rotulo} · ${empreendimento}` : rotulo,
      url: caminho ? `${app}/${caminho}/${l.id}` : null,
    }
  })
}

function texto(corpo: string, status: number, comCorpo: boolean): Response {
  return new Response(comCorpo ? corpo : null, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  })
}

export function criarTratadorDoFeed(deps: DependenciasDoFeed) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))
  const agora = deps.agora ?? (() => new Date())

  return async (pedido: Request): Promise<Response> => {
    const comCorpo = pedido.method !== 'HEAD'
    if (pedido.method !== 'GET' && pedido.method !== 'HEAD') {
      return new Response(comCorpo ? 'Método não permitido' : null, {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    const token = ROTA.exec(new URL(pedido.url).pathname)?.[1]
    if (!token) return texto('Não encontrado', 404, comCorpo)

    let linhas: LinhaDoFeed[] | null
    try {
      linhas = await deps.feed(await hashDoToken(token))
    } catch {
      registrar(JSON.stringify({ etapa: 'feed', motivo: 'erro_interno' }))
      return texto('Erro interno', 500, comCorpo)
    }
    if (linhas === null) return texto('Não encontrado', 404, comCorpo)

    const app = (deps.env('LINK_DO_BETA') ?? LINK_PADRAO_DO_BETA).replace(/\/+$/, '')
    let corpo: string
    try {
      corpo = gerarIcs(eventosDoFeed(linhas, app), { nome: 'Grama', agora: agora() })
    } catch {
      registrar(JSON.stringify({ etapa: 'ics', motivo: 'erro_interno' }))
      return texto('Erro interno', 500, comCorpo)
    }
    return new Response(comCorpo ? corpo : null, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, max-age=900',
        'Content-Disposition': 'inline; filename="grama.ics"',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}
