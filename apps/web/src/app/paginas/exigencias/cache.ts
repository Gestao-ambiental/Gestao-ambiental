// Depois de registrar, responder, prorrogar, atribuir, editar ou excluir uma exigência, tudo o que a
// mostra fica velho: as listas de exigências, a Visão (lista, placar e totais), o Calendário e a
// busca. Sem isso, o placar da Visão e o Calendário só se acertam quando o cache vence (30 s).
import type { QueryClient } from '@tanstack/react-query'

const CHAVES_QUE_MOSTRAM_EXIGENCIA = [
  ['exigencias'],
  ['prazos'],
  ['prazos-contadores'],
  ['prazos-totais'],
  ['calendario'],
  ['busca-global'],
] as const

export async function atualizarDepoisDeMudarExigencia(
  queryClient: QueryClient,
  exigenciaId?: string,
): Promise<void> {
  const chaves: (readonly string[])[] = [...CHAVES_QUE_MOSTRAM_EXIGENCIA]
  if (exigenciaId) chaves.push(['exigencia', exigenciaId])
  await Promise.all(chaves.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
