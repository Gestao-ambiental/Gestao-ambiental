// Peças comuns das telas da central administrativa.

import { usandoAgora } from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { SituacaoConsultoria } from '@/lib/api/central'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'

// Quadro denso da central (uso interno): cabeçalho em maiúsculas, linhas de 40px com regra leve.
export const classeCabecalho =
  'h-9 border-b px-(--e-2) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2) first:pl-(--e-4) last:pr-(--e-4)'
export const classeCelula =
  'h-(--linha-densa) border-b border-(--regra-leve) px-(--e-2) align-middle first:pl-(--e-4) last:pr-(--e-4)'
/** Linha do quadro com hover; a última não repete a regra da moldura. */
export const classeLinha = 'transicao-estado hover:bg-(--toque) last:[&>td]:border-b-0'
/** Moldura de painel do quadro (sem sombra). */
export const classePainel = 'rounded-(--raio-painel) border bg-(--folha)'

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
