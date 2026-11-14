// Modo suporte no app (ADR-0025): o operador entra pela central e navega a consultoria só lendo.
// A escolha fica no aparelho (gravarSuporteEscolhido); quem decide se vale é o banco
// (meus_acessos_de_suporte e, em cada leitura, is_membro).

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { CHAVE_DOIS_FATORES } from '@/app/dois-fatores/estado'
import { CHAVE_SOU_OPERADOR, useSouOperador } from '@/app/paginas/central/operador'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { listarMeusAcessosDeSuporte } from '@/lib/api/suporte'

import {
  CHAVE_MEUS_ACESSOS_DE_SUPORTE,
  CHAVE_MEUS_VINCULOS,
  gravarSuporteEscolhido,
} from './contexto-consultoria'

/** Consultas que sobrevivem à troca de consultoria (conta, operador e dois fatores). */
const CONSULTAS_DA_CONTA = new Set<unknown>([
  CHAVE_MEUS_VINCULOS,
  CHAVE_SOU_OPERADOR,
  CHAVE_DOIS_FATORES,
  CHAVE_MEUS_ACESSOS_DE_SUPORTE,
])

/** Limpa o cache das telas da consultoria (como na troca de consultoria, ACC-04). */
export function limparDadosDaConsultoria(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (q) => !CONSULTAS_DA_CONTA.has(q.queryKey[0]) && q.queryKey[0] !== 'central',
  })
}

/**
 * Acessos de suporte valendo em que o operador entrou. Só consulta para operador; relê a cada
 * minuto e ao voltar para a aba (a Gestão pode ter encerrado).
 */
export function useMeusAcessosDeSuporte() {
  const { sessao } = useSessao()
  const operador = useSouOperador()
  return useQuery({
    queryKey: [CHAVE_MEUS_ACESSOS_DE_SUPORTE, sessao?.user.id ?? ''],
    queryFn: listarMeusAcessosDeSuporte,
    enabled: operador.data === true,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/** Abre a consultoria em modo suporte (depois que o banco registrou a entrada). */
export function useAbrirModoSuporte() {
  const { sessao } = useSessao()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  return useCallback(
    (consultoriaId: string) => {
      gravarSuporteEscolhido(sessao?.user.id ?? '', consultoriaId)
      limparDadosDaConsultoria(queryClient)
      void queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_ACESSOS_DE_SUPORTE] })
      void navegar('/')
    },
    [sessao, queryClient, navegar],
  )
}
