// Peças comuns das telas da central administrativa.

import { usandoAgora } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { SituacaoConsultoria } from '@/lib/api/central'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'

export const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150) last:pr-(--space-150)'
export const classeCelula =
  'h-11 border-b px-(--space-100) align-middle first:pl-(--space-150) last:pr-(--space-150)'
export const classeCampo =
  'w-full rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none transicao-estado focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)] focus:bg-(--surface-input-focus) aria-invalid:border-(--border-danger)'

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
