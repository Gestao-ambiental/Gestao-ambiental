// Descadastro do resumo diário sem login (ADR-0047). A Edge Function preferencias-por-link só liga
// as dependências reais; a regra fica aqui, testada com `deno test` e dependências falsas.
//
// Só POST desliga (GET nunca muda nada: robôs de antivírus abrem links). Dois chamadores:
// - o provedor de e-mail, pelo List-Unsubscribe one-click (RFC 8058): POST em
//   /preferencias-por-link/<token> com o corpo "List-Unsubscribe=One-Click" (ignorado);
// - a página pública /avisos/parar do app: POST com { "token": "..." }.
// O token é assinado com AVISO_ASSINATURA (link-de-descadastro.ts) e só traz os ids. Resposta
// sempre { desligado: true } quando a assinatura confere, mesmo que o membro não exista (não
// revela quem existe). O link só desliga; religar é no Perfil.
// Nunca vão para o log: o token nem a assinatura.

import { lerLinkDeDescadastro } from './link-de-descadastro.ts'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROTA = /\/preferencias-por-link\/([^/]+)$/

export interface DependenciasDoDescadastro {
  env: (nome: string) => string | undefined
  /** Service role: desliga o resumo do membro (desligar_resumo_por_link). */
  desligar: (consultoriaId: string, membroId: string) => Promise<boolean>
  /** Log da função; recebe só etapas e motivos. */
  registrar?: (linha: string) => void
}

export function responder(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function tokenDoPedido(pedido: Request): Promise<string | null> {
  const doCaminho = ROTA.exec(new URL(pedido.url).pathname)?.[1]
  if (doCaminho) {
    try {
      return decodeURIComponent(doCaminho)
    } catch {
      return null
    }
  }
  try {
    const corpo = (await pedido.json()) as { token?: unknown }
    return typeof corpo.token === 'string' ? corpo.token : null
  } catch {
    return null
  }
}

export function criarTratadorDoDescadastro(deps: DependenciasDoDescadastro) {
  const registrar = deps.registrar ?? ((linha: string) => console.error(linha))

  return async (pedido: Request): Promise<Response> => {
    if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (pedido.method !== 'POST') return responder({ erro: 'metodo_invalido' }, 405)

    const segredo = deps.env('AVISO_ASSINATURA')
    if (!segredo) {
      registrar(JSON.stringify({ etapa: 'configuracao', motivo: 'configuracao_ausente' }))
      return responder({ erro: 'configuracao_ausente' }, 503)
    }

    const token = await tokenDoPedido(pedido)
    const ids = token ? await lerLinkDeDescadastro(segredo, token) : null
    if (!ids) return responder({ erro: 'link_invalido' }, 400)

    try {
      await deps.desligar(ids.consultoriaId, ids.membroId)
    } catch {
      registrar(JSON.stringify({ etapa: 'desligar', motivo: 'erro_interno' }))
      return responder({ erro: 'erro_interno' }, 500)
    }
    return responder({ desligado: true })
  }
}
