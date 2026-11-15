import { useQuery } from '@tanstack/react-query'

import { useSessao } from '@/app/sessao/contexto-sessao'
import { souOperador } from '@/lib/api/central'

/** Chave da consulta "sou operador?" (menu da conta e central usam a mesma). */
export const CHAVE_SOU_OPERADOR = 'sou-operador'

/** Se a pessoa logada opera a plataforma. Só decide o que aparece; quem autoriza é o banco. */
export function useSouOperador() {
  const { sessao } = useSessao()
  return useQuery({
    queryKey: [CHAVE_SOU_OPERADOR, sessao?.user.id ?? ''],
    queryFn: souOperador,
    enabled: Boolean(sessao),
    staleTime: 5 * 60_000,
  })
}
