// Abas de Acompanhamentos (ADR-0041). Aba nova entra com uma linha aqui; a que não é Renovações nem
// Aguardando conferência traz o próprio painel em `Painel`.
import type { ComponentType } from 'react'

export interface AbaDeAcompanhamentos {
  /** Valor em ?aba=… (a primeira aba não aparece na URL). */
  valor: string
  rotulo: string
  /** Palavra curta no celular. */
  curto: string
  /** Só a Gestão vê (apresentação; o banco decide de fato). */
  somenteGestao?: boolean
  /** Painel da aba; Renovações e Aguardando conferência são desenhadas pela própria página. */
  Painel?: ComponentType
}

export const ABAS_DE_ACOMPANHAMENTOS: readonly AbaDeAcompanhamentos[] = [
  { valor: 'renovacoes', rotulo: 'Renovações no radar', curto: 'Renovações' },
  { valor: 'conferencia', rotulo: 'Aguardando conferência', curto: 'Conferência' },
]

/** Abas que este papel vê, na ordem da lista. */
export function abasDeAcompanhamentosVisiveis(
  ehGestao: boolean,
  abas: readonly AbaDeAcompanhamentos[] = ABAS_DE_ACOMPANHAMENTOS,
): AbaDeAcompanhamentos[] {
  return abas.filter((a) => ehGestao || !a.somenteGestao)
}
