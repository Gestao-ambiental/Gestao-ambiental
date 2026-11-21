// Envio de e-mail pelo Resend (ADR-0047). A chave (RESEND_API_KEY) vem de quem chama, lida do
// ambiente da Edge Function; nunca no repositório nem no log. As funções antigas (resumo do mês,
// lista de espera, aviso de suporte) importam daqui só a URL e o tempo limite; os laços de envio
// delas ficam como estão.

export const URL_DO_RESEND = 'https://api.resend.com/emails'
export const LIMITE_TEMPO_ENVIO_MS = 15_000

export interface EmailParaEnviar {
  de: string
  para: string[]
  assunto: string
  texto: string
  html?: string
  /** Cabeçalhos do e-mail (ex.: List-Unsubscribe), não da requisição HTTP. */
  cabecalhos?: Record<string, string>
  /** Vai no header HTTP Idempotency-Key: o Resend não manda duas vezes a mesma chave (24 h). */
  chaveDeIdempotencia?: string
}

/** `status` 0 = sem resposta (tempo esgotado ou rede): o e-mail pode ter saído. */
export type ResultadoDoEnvio = { ok: true; id: string | null } | { ok: false; status: number }

export async function enviarPeloResend(
  doFetch: typeof fetch,
  chave: string,
  email: EmailParaEnviar,
): Promise<ResultadoDoEnvio> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${chave}`,
    'Content-Type': 'application/json',
  }
  if (email.chaveDeIdempotencia) headers['Idempotency-Key'] = email.chaveDeIdempotencia

  const corpo: Record<string, unknown> = {
    from: email.de,
    to: email.para,
    subject: email.assunto,
    text: email.texto,
  }
  if (email.html !== undefined) corpo.html = email.html
  if (email.cabecalhos && Object.keys(email.cabecalhos).length > 0) corpo.headers = email.cabecalhos

  let resposta: Response
  try {
    resposta = await doFetch(URL_DO_RESEND, {
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(LIMITE_TEMPO_ENVIO_MS),
    })
  } catch {
    return { ok: false, status: 0 }
  }
  if (!resposta.ok) return { ok: false, status: resposta.status }

  let id: string | null = null
  try {
    const dados = (await resposta.json()) as { id?: unknown }
    if (typeof dados.id === 'string' && dados.id.length > 0) id = dados.id
  } catch {
    // Sem corpo legível: o envio foi aceito do mesmo jeito.
  }
  return { ok: true, id }
}
