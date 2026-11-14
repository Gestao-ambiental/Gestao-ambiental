// Situação comercial nas telas (ADR-0026): consulta, rótulos e tons. A regra é do domínio
// (situacaoComercial) e o banco aplica a mesma na escrita; aqui é só apresentação.

import {
  formatarDataCivil,
  type SituacaoComercial,
  type SituacaoComercialCodigo,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import type { TomSelo } from '@/components/ui/selo'
import { obterDadosComerciais } from '@/lib/api/plano'

import { opcoesDoCatalogo } from './catalogo'

export const CHAVE_SITUACAO_COMERCIAL = 'situacao-comercial'
export const CHAVE_COBRANCAS = 'cobrancas'

/** Situação comercial da consultoria atual, relida a cada 5 minutos e ao voltar para a aba. */
export function useDadosComerciais() {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: [CHAVE_SITUACAO_COMERCIAL, atual.consultoriaId],
    // Limites e tolerância do catálogo vigente (cache compartilhado com as telas de preço).
    queryFn: () =>
      obterDadosComerciais(atual.consultoriaId, () => queryClient.query(opcoesDoCatalogo)),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

export const TOM_DA_SITUACAO_COMERCIAL: Record<SituacaoComercialCodigo, TomSelo> = {
  interna: 'revisao',
  beta: 'andamento',
  teste: 'andamento',
  ativa: 'sucesso',
  em_atraso: 'atencao',
  bloqueada: 'perigo',
  teste_encerrado: 'perigo',
  cancelada: 'padrao',
}

/** "Em teste até 12/02/2027", "Beta até 31/01/2027", "Conta interna", "Somente leitura"… */
export function rotuloDaSituacao(s: SituacaoComercial): string {
  switch (s.situacao) {
    case 'interna':
      return 'Conta interna'
    case 'beta':
      return `Beta até ${formatarDataCivil(s.betaAte)}`
    case 'teste':
      return `Em teste até ${formatarDataCivil(s.testeAte)}`
    case 'ativa':
      return 'Ativa'
    case 'em_atraso':
      return 'Em atraso'
    case 'bloqueada':
      return 'Somente leitura'
    case 'teste_encerrado':
      return 'Teste encerrado'
    case 'cancelada':
      return 'Cancelada'
  }
}
