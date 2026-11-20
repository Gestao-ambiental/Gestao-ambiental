// Retorno do "Continuar com Google" (ADR-0040). Quando dá errado, o Supabase volta para a tela com
// error, error_code e error_description na query (e, no fluxo implícito, às vezes no hash). Aqui
// isso vira uma frase clara; a tela continua com e-mail e senha.

export const MENSAGEM_GOOGLE_DESLIGADO =
  'Entrar com Google ainda não está disponível. Use e-mail e senha.'
export const MENSAGEM_GOOGLE_CANCELADO =
  'Você cancelou a entrada com o Google. Tente de novo ou use e-mail e senha.'
export const MENSAGEM_GOOGLE_SEM_EMAIL =
  'O Google não confirmou o e-mail desta conta. Use uma conta Google com e-mail verificado ou entre com e-mail e senha.'
export const MENSAGEM_GOOGLE_FALHOU =
  'Não deu para entrar com o Google. Tente de novo ou use e-mail e senha.'

function parametros(texto: string): URLSearchParams {
  return new URLSearchParams(texto.replace(/^[?#]/, ''))
}

/** Mensagem do retorno do Google, ou nulo quando não houve erro. */
export function erroDoRetornoDoGoogle(
  busca: string = window.location.search,
  hash: string = window.location.hash,
): string | null {
  const daBusca = parametros(busca)
  const doHash = parametros(hash)
  const erro = daBusca.get('error') ?? doHash.get('error')
  const codigo = (daBusca.get('error_code') ?? doHash.get('error_code') ?? '').toLowerCase()
  const descricao = (
    daBusca.get('error_description') ??
    doHash.get('error_description') ??
    ''
  ).toLowerCase()
  if (!erro && !codigo) return null

  if (erro === 'access_denied' && !descricao.includes('email')) return MENSAGEM_GOOGLE_CANCELADO
  if (descricao.includes('provider is not enabled') || descricao.includes('unsupported provider')) {
    return MENSAGEM_GOOGLE_DESLIGADO
  }
  if (
    codigo === 'email_not_confirmed' ||
    codigo === 'provider_email_needs_verification' ||
    descricao.includes('email not confirmed') ||
    descricao.includes('error getting user email') ||
    (descricao.includes('email') && descricao.includes('verif'))
  ) {
    return MENSAGEM_GOOGLE_SEM_EMAIL
  }
  return MENSAGEM_GOOGLE_FALHOU
}
