// Alvará simples (ALV-01 e ALV-02). A situação é calculada, nunca gravada: o alvará renovado fica
// guardado como histórico; o vigente da série vence no dia seguinte à validade.

import type { DataCivil } from './data-civil'

export type SituacaoDoAlvara = 'vigente' | 'vencido' | 'renovado'

/** Renovado vale mais (já existe um novo ligado a ele); depois, vencido ou vigente. */
export function situacaoDoAlvara(
  alvara: { validade: DataCivil; renovado: boolean },
  hoje: DataCivil,
): SituacaoDoAlvara {
  if (alvara.renovado) return 'renovado'
  return alvara.validade < hoje ? 'vencido' : 'vigente'
}

const ROTULOS: Record<SituacaoDoAlvara, string> = {
  vigente: 'Vigente',
  vencido: 'Vencido',
  renovado: 'Renovado',
}

export function rotuloDaSituacaoDoAlvara(situacao: SituacaoDoAlvara): string {
  return ROTULOS[situacao]
}

/** Os que têm sucessor (algum outro aponta para eles como anterior). */
export function idsRenovados(
  alvaras: readonly { id: string; anteriorId: string | null }[],
): Set<string> {
  return new Set(alvaras.flatMap((a) => (a.anteriorId ? [a.anteriorId] : [])))
}
