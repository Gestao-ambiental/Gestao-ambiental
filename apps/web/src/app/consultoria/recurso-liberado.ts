import { useQuery } from '@tanstack/react-query'

import { recursoLiberado, type RecursoDoPlanoNoFront } from '@/lib/api/recursos'

import { useConsultoria } from './contexto-consultoria'

/** Se a consultoria atual pode usar o recurso do plano hoje (apresentação; o banco barra). */
export function useRecursoLiberado(recurso: RecursoDoPlanoNoFront) {
  const { atual } = useConsultoria()
  return useQuery({
    queryKey: ['recurso-liberado', atual.consultoriaId, recurso],
    queryFn: () => recursoLiberado(atual.consultoriaId, recurso),
    staleTime: 5 * 60 * 1000,
  })
}
