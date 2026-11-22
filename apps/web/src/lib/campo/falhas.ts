// Falha de conexão ou recusa do servidor (ADR-0060). Falha de conexão deixa o registro no aparelho
// e a fila tenta de novo sozinha; recusa (o banco disse não) para de tentar e mostra o motivo.

import { codigoDoErro } from '@/lib/erros'

const MENSAGEM_DE_CONEXAO = /fetch|network|rede|timeout|timed out|load failed|offline|conex/i

/**
 * Na dúvida, é conexão: o registro fica no aparelho e a fila tenta de novo mais tarde, em vez de
 * descartar o que a técnica fez em campo.
 */
export function ehFalhaDeConexao(erro: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (erro instanceof TypeError) return true
  if (typeof erro !== 'object' || erro === null) return true
  const { code, message, status, statusCode, name } = erro as Record<string, unknown>
  const numero = Number(status ?? statusCode)
  if (Number.isFinite(numero) && numero > 0) {
    // 401: sessão a renovar quando o sinal voltar. 408 e 429: espere. 5xx: servidor fora.
    if (numero === 401 || numero === 408 || numero === 429 || numero >= 500) return true
    if (numero >= 400) return false
  }
  if (typeof message === 'string' && MENSAGEM_DE_CONEXAO.test(message)) return true
  if (codigoDoErro(erro)) return false
  if (typeof code === 'string' && code !== '') {
    // JWT vencido (PGRST301/303) e classes de conexão do Postgres (08, 53, 57) passam.
    return /^PGRST30|^(08|53|57)/.test(code)
  }
  if (typeof name === 'string' && /StorageUnknownError|AbortError|FetchError/.test(name))
    return true
  return true
}
