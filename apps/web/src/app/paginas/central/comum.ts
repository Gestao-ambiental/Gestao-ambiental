// Peças comuns das telas da central administrativa.

import { usandoAgora } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { SituacaoConsultoria } from '@/lib/api/central'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'

export const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo whitespace-nowrap first:pl-(--e-3) last:pr-(--e-3)'
export const classeCelula = 'h-11 border-b px-(--e-2) align-middle first:pl-(--e-3) last:pr-(--e-3)'
export const classeCampo =
  'w-full rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) outline-none transicao-estado focus:border-b-(--campo-borda-ativa) focus:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)] focus:bg-(--campo-foco) aria-invalid:border-(--atraso)'

/** Cor do selo de cada situação (a palavra vai sempre junto). */
export const TOM_DA_SITUACAO: Record<SituacaoConsultoria, TomSelo> = {
  teste: 'andamento',
  ativa: 'sucesso',
  suspensa: 'atencao',
  arquivada: 'padrao',
}

export function plural(quantidade: number, singular: string, varios: string): string {
  return `${String(quantidade)} ${quantidade === 1 ? singular : varios}`
}

/** Último uso na lista: "Agora" (últimos 15 min), a data dd/mm/aaaa no fuso ou "Nunca". */
export function ultimoUsoComoData(ultimoUsoEm: string | null, fuso: string, agora: Date): string {
  if (ultimoUsoEm === null) return 'Nunca'
  if (usandoAgora(ultimoUsoEm, agora)) return 'Agora'
  return formatarInstanteComoData(ultimoUsoEm, fuso)
}

/** Último uso por pessoa: "Agora", "dd/mm/aaaa às HH:MM" no fuso da consultoria ou "Nunca". */
export function ultimoUsoComHora(ultimoUsoEm: string | null, fuso: string, agora: Date): string {
  if (ultimoUsoEm === null) return 'Nunca'
  if (usandoAgora(ultimoUsoEm, agora)) return 'Agora'
  return formatarInstanteComHora(ultimoUsoEm, fuso)
}
