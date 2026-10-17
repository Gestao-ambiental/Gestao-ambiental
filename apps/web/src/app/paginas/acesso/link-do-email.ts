/**
 * O que veio no hash do link de e-mail do Supabase Auth (fluxo implícito). Lido no primeiro
 * render, antes de o supabase-js limpar a URL ao abrir a sessão.
 */
export interface LinkDoEmail {
  /** type=recovery: link de recuperação de senha. */
  recuperacao: boolean
  /** O link já veio com sessão (access_token). */
  comSessao: boolean
  /** error_code do Auth (ex.: otp_expired), quando o link não vale mais. */
  erro: string | null
}

export function lerLinkDoEmail(hash: string = window.location.hash): LinkDoEmail {
  const parametros = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return {
    recuperacao: parametros.get('type') === 'recovery',
    comSessao: parametros.has('access_token'),
    erro: parametros.get('error_code') ?? parametros.get('error'),
  }
}
