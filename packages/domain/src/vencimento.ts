// Outros vencimentos (ADR-0046): alvará, ART, CTF IBAMA, outorga, AVCB, certidão. A situação é
// calculada, nunca gravada. O renovado fica guardado como histórico; o vigente da série vence no
// dia seguinte à validade e fica "a vencer" a partir da antecedência do vencimento.

import { diferencaEmDias, type DataCivil } from './data-civil'

/** Antecedência padrão do tipo novo, em dias. */
export const ANTECEDENCIA_PADRAO_DIAS = 60

/** Limite da antecedência (dois anos), o mesmo do banco. */
const ANTECEDENCIA_MAXIMA_DIAS = 730

export type SituacaoDoVencimento = 'vigente' | 'a_vencer' | 'vencido' | 'renovado'

/** Dias da data de hoje até a validade: 0 no próprio dia, negativo depois dela. */
export function diasParaVencer(validoAte: DataCivil, hoje: DataCivil): number {
  return diferencaEmDias(validoAte, hoje)
}

/**
 * Renovado vale mais (já existe um novo ligado a ele); depois vencido (validade antes de hoje);
 * depois "a vencer", quando faltam até `antecedenciaDias` dias (inclusive: o próprio dia da
 * validade também é "a vencer"); senão, vigente.
 */
export function situacaoDoVencimento(
  vencimento: { validoAte: DataCivil; antecedenciaDias: number; renovado: boolean },
  hoje: DataCivil,
): SituacaoDoVencimento {
  if (vencimento.renovado) return 'renovado'
  const dias = diasParaVencer(vencimento.validoAte, hoje)
  if (dias < 0) return 'vencido'
  return dias <= vencimento.antecedenciaDias ? 'a_vencer' : 'vigente'
}

const ROTULOS: Record<SituacaoDoVencimento, string> = {
  vigente: 'Vigente',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  renovado: 'Renovado',
}

export function rotuloDaSituacaoDoVencimento(situacao: SituacaoDoVencimento): string {
  return ROTULOS[situacao]
}

/** Antecedência aceita pelo banco: inteiro de 0 a 730 dias. */
export function antecedenciaValida(dias: number): boolean {
  return Number.isInteger(dias) && dias >= 0 && dias <= ANTECEDENCIA_MAXIMA_DIAS
}

/** Os que têm sucessor (algum outro aponta para eles como anterior). */
export function idsRenovados(
  itens: readonly { id: string; anteriorId: string | null }[],
): Set<string> {
  return new Set(itens.flatMap((v) => (v.anteriorId ? [v.anteriorId] : [])))
}
