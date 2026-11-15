import { useQuery } from '@tanstack/react-query'

import { useSessao } from '@/app/sessao/contexto-sessao'
import { lerDoisFatores } from '@/lib/api/dois-fatores'

/** Chave da consulta de dois fatores (central e Segurança usam a mesma). */
export const CHAVE_DOIS_FATORES = 'dois-fatores'

/** Se a conta tem dois fatores e se a sessão atual já confirmou o código (aal2). */
export function useDoisFatores() {
  const { sessao } = useSessao()
  return useQuery({
    queryKey: [CHAVE_DOIS_FATORES, sessao?.user.id ?? ''],
    queryFn: lerDoisFatores,
    enabled: Boolean(sessao),
  })
}
