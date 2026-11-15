// Métricas de valor da central (etapa 1): só números que já saem do banco. O banco calcula as
// contagens com a mesma regra (supabase/migrations/20261114170000_metricas_de_valor.sql:
// private.dias_uteis_entre, private.eh_urgencia, private.eh_nao_planejada,
// private.renovacao_protegida); aqui ficam as regras, os limiares e as razões que a tela mostra.

import { adicionarDias, diferencaEmDias, type DataCivil } from './data-civil'
import { ehDiaUtilNacional } from './planos'
import { DIAS_LIMITE_PROTOCOLO_LAO } from './renovacao'

/** Meses fechados mostrados além do mês atual. */
export const MESES_DE_METRICAS = 6

/** Entrega no prazo com esta folga (dias úteis) ou menos é urgência. */
export const DIAS_UTEIS_DE_URGENCIA = 3

/** Ocorrência criada com o prazo a estes dias úteis ou menos é demanda não planejada. */
export const DIAS_UTEIS_DE_NAO_PLANEJADA = 5

/** Renovação protocolada a estes dias (corridos) ou mais do vencimento (LC 140/2011, art. 14, § 4º). */
export const DIAS_DE_RENOVACAO_PROTEGIDA = DIAS_LIMITE_PROTOCOLO_LAO

/**
 * Dias úteis (nacionais) de `de` até `ate`: conta os dias úteis depois de `de` até `ate`, inclusive.
 * Mesma data: 0. `ate` antes de `de`: o mesmo número, negativo.
 */
export function diasUteisEntre(de: DataCivil, ate: DataCivil): number {
  if (ate < de) return -diasUteisEntre(ate, de)
  let contados = 0
  for (let dia = adicionarDias(de, 1); dia <= ate; dia = adicionarDias(dia, 1)) {
    if (ehDiaUtilNacional(dia)) contados++
  }
  return contados
}

/** Concluída até o prazo (o próprio dia do prazo conta como no prazo). */
export function ehNoPrazo(conclusao: DataCivil, prazo: DataCivil): boolean {
  return conclusao <= prazo
}

/** Antecedência da entrega: dias úteis entre a conclusão e o prazo oficial. */
export function antecedenciaEmDiasUteis(conclusao: DataCivil, prazo: DataCivil): number {
  return diasUteisEntre(conclusao, prazo)
}

/** Urgência: concluída no prazo, com 3 dias úteis de folga ou menos. Atrasada não é urgência. */
export function ehUrgencia(conclusao: DataCivil, prazo: DataCivil): boolean {
  return (
    ehNoPrazo(conclusao, prazo) &&
    antecedenciaEmDiasUteis(conclusao, prazo) <= DIAS_UTEIS_DE_URGENCIA
  )
}

/** Demanda não planejada: criada com o prazo oficial a 5 dias úteis ou menos (ou já vencido). */
export function ehNaoPlanejada(criacao: DataCivil, prazo: DataCivil): boolean {
  return diasUteisEntre(criacao, prazo) <= DIAS_UTEIS_DE_NAO_PLANEJADA
}

/** Renovação protegida: protocolada 120 dias corridos ou mais antes do vencimento. */
export function renovacaoProtegida(validade: DataCivil, protocoladoEm: DataCivil | null): boolean {
  return (
    protocoladoEm !== null &&
    diferencaEmDias(validade, protocoladoEm) >= DIAS_DE_RENOVACAO_PROTEGIDA
  )
}

/** Razão de 0 a 1; sem denominador não há número (a tela mostra "sem dados"). */
export function proporcao(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null
}

/**
 * Carga equilibrada: pico de entregas de uma pessoa numa semana ÷ média por pessoa e semana.
 * `celulas` = responsáveis com entrega no mês × semanas do mês. 1 = carga plana.
 */
export function picoSobreMedia(pico: number, entregas: number, celulas: number): number | null {
  if (entregas <= 0 || celulas <= 0) return null
  return pico / (entregas / celulas)
}

/** Variação contra o mês anterior; sem um dos dois, não há variação. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  return atual === null || anterior === null ? null : atual - anterior
}
