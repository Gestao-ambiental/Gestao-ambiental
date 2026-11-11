// Peças comuns das telas de orçamento.

import { numeroDoOrcamento } from '@gestao-ambiental/domain'

/** "ORC-2026-041" ou "ORC-2026-041 · rev. 2". */
export function numeroComRevisao(ano: number, sequencia: number, revisao: number): string {
  const numero = numeroDoOrcamento(ano, sequencia)
  return revisao > 1 ? `${numero} · rev. ${String(revisao)}` : numero
}

export const classeCampo =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none transicao-estado focus:border-(--border-focus) focus:bg-(--surface-input-focus) disabled:bg-(--surface-disabled) disabled:text-(--text-disabled) aria-invalid:border-(--border-danger)'

export const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150) last:pr-(--space-150)'
export const classeCelula =
  'h-11 border-b px-(--space-100) align-middle first:pl-(--space-150) last:pr-(--space-150)'
