// Peças comuns da fila de normas na central (LEG-04; ADR-0050).

import type { TomSelo } from '@/components/ui/selo'
import type { SituacaoDaMudanca } from '@/lib/api/central-normas'

export const FUSO_DA_CENTRAL = 'America/Sao_Paulo'

/** Cor do selo de cada situação da mudança (a palavra vai sempre junto). */
export const TOM_DA_SITUACAO_DA_MUDANCA: Record<SituacaoDaMudanca, TomSelo> = {
  detectada: 'atencao',
  resumida: 'revisao',
  publicada: 'sucesso',
  descartada: 'padrao',
}

const DOLAR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })

/** Micros de dólar (custo da IA) como "US$ 1,23". */
export function formatarDolar(micros: number): string {
  return DOLAR.format(micros / 1_000_000)
}
