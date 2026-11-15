/**
 * O gerador de tipos do Supabase marca todo argumento de RPC como não nulo, mas o banco aceita
 * nulo (campo ainda vazio no rascunho, "sem responsável", orçamento sem empreendimento). Só aqui a
 * tipagem é contornada.
 */
export function aceitaNulo<T>(valor: T | null): T {
  return valor as unknown as T
}
