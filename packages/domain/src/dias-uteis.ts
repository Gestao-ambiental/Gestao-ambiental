// Dias úteis e prazo de ofício. Portado de dist/domain.js do protótipo
// (businessDay, previousBusinessDay, letterDeadline). Os feriados vêm de fora, por consultoria.

import { adicionarDias, diaDaSemana, ehDataCivil, type DataCivil } from './data-civil'

/** Dia útil: nem sábado, nem domingo, nem feriado da lista. Protótipo: `businessDay`. */
export function ehDiaUtil(data: DataCivil, feriados: readonly DataCivil[] = []): boolean {
  const dia = diaDaSemana(data)
  return dia !== 0 && dia !== 6 && !feriados.includes(data)
}

/** A própria data, se útil; senão o dia útil anterior mais próximo. Protótipo: `previousBusinessDay`. */
export function diaUtilAnterior(data: DataCivil, feriados: readonly DataCivil[] = []): DataCivil {
  let dia = data
  while (!ehDiaUtil(dia, feriados)) dia = adicionarDias(dia, -1)
  return dia
}

/** Protótipo: unit = "calendar" | "business". */
export type UnidadePrazo = 'corridos' | 'uteis'

/** Protótipo: `{ official, internal }`. */
export interface PrazoDeOficio {
  /** Protótipo: `official`. Prazo contado a partir do dia seguinte à assinatura. */
  oficial: DataCivil
  /** Protótipo: `internal`. O próprio prazo, se útil; senão o dia útil anterior. */
  interno: DataCivil
}

/**
 * Prazo de um ofício: `quantidade` dias (corridos ou úteis) a partir do dia seguinte à assinatura.
 * O prazo interno antecipa para o dia útil anterior quando o oficial cai em fim de semana ou feriado.
 * Protótipo: `letterDeadline(signature, count, unit, holidays)`.
 */
export function prazoDeOficio(
  assinatura: DataCivil,
  quantidade: number,
  unidade: UnidadePrazo = 'corridos',
  feriados: readonly DataCivil[] = [],
): PrazoDeOficio {
  if (
    !ehDataCivil(assinatura) ||
    !Number.isInteger(quantidade) ||
    quantidade < 1 ||
    quantidade > 3650
  )
    throw new Error('Informe assinatura e prazo válido.')
  let dia = assinatura
  for (let contados = 0; contados < quantidade;) {
    dia = adicionarDias(dia, 1)
    if (unidade === 'corridos' || ehDiaUtil(dia, feriados)) contados++
  }
  return { oficial: dia, interno: diaUtilAnterior(dia, feriados) }
}
