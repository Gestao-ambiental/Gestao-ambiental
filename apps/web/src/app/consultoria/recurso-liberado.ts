import { useQueries, useQuery } from '@tanstack/react-query'

import { recursoLiberado, type RecursoDoPlanoNoFront } from '@/lib/api/recursos'

import { useConsultoria } from './contexto-consultoria'

const CINCO_MINUTOS = 5 * 60 * 1000

function opcoesDoRecurso(consultoriaId: string, recurso: RecursoDoPlanoNoFront) {
  return {
    queryKey: ['recurso-liberado', consultoriaId, recurso],
    queryFn: () => recursoLiberado(consultoriaId, recurso),
    staleTime: CINCO_MINUTOS,
  }
}

/** Se a consultoria atual pode usar o recurso do plano hoje (apresentação; o banco barra). */
export function useRecursoLiberado(recurso: RecursoDoPlanoNoFront) {
  const { atual } = useConsultoria()
  return useQuery(opcoesDoRecurso(atual.consultoriaId, recurso))
}

/**
 * Quais destes recursos a consultoria atual pode usar hoje. Enquanto a resposta não chega (ou se
 * falha), o recurso fica de fora: some o que depende dele, nunca aparece o que não devia.
 */
export function useRecursosLiberados(
  recursos: readonly RecursoDoPlanoNoFront[],
): ReadonlySet<RecursoDoPlanoNoFront> {
  const { atual } = useConsultoria()
  const consultas = useQueries({
    queries: recursos.map((recurso) => opcoesDoRecurso(atual.consultoriaId, recurso)),
  })
  return new Set(recursos.filter((_, indice) => consultas[indice]?.data === true))
}
