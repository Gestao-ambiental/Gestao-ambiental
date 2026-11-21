// Link de descadastro do resumo diário (ADR-0047). Assinado com HMAC-SHA-256 (segredo
// AVISO_ASSINATURA), só com os ids da consultoria e do membro, sem validade. O link só desliga;
// religar é no Perfil. Formato: v1.<consultoriaId>.<membroId>.<assinatura base64url sem padding>.

import { iguaisEmTempoConstante } from './resumo-do-mes.ts'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const FORMATO = new RegExp(`^v1\\.(${UUID})\\.(${UUID})\\.([A-Za-z0-9_-]{43})$`)

function base64url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function assinatura(segredo: string, mensagem: string): Promise<string> {
  const codificador = new TextEncoder()
  const chave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinado = await crypto.subtle.sign('HMAC', chave, codificador.encode(mensagem))
  return base64url(new Uint8Array(assinado))
}

export async function assinarLinkDeDescadastro(
  segredo: string,
  consultoriaId: string,
  membroId: string,
): Promise<string> {
  const mensagem = `v1.${consultoriaId.toLowerCase()}.${membroId.toLowerCase()}`
  return `${mensagem}.${await assinatura(segredo, mensagem)}`
}

/** Os ids do link, ou nulo quando o formato ou a assinatura não conferem. */
export async function lerLinkDeDescadastro(
  segredo: string,
  token: string,
): Promise<{ consultoriaId: string; membroId: string } | null> {
  if (!segredo || typeof token !== 'string' || token.length > 200) return null
  const partes = FORMATO.exec(token)
  if (!partes) return null
  const [, consultoriaId, membroId, recebida] = partes
  if (!consultoriaId || !membroId || !recebida) return null
  const esperada = await assinatura(segredo, `v1.${consultoriaId}.${membroId}`)
  if (!iguaisEmTempoConstante(recebida, esperada)) return null
  return { consultoriaId, membroId }
}
