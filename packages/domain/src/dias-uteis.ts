// Dia útil. Portado de dist/domain.js do protótipo (businessDay). Os feriados vêm de fora.

import { diaDaSemana, type DataCivil } from './data-civil'

/** Dia útil: nem sábado, nem domingo, nem feriado da lista. Protótipo: `businessDay`. */
export function ehDiaUtil(data: DataCivil, feriados: readonly DataCivil[] = []): boolean {
  const dia = diaDaSemana(data)
  return dia !== 0 && dia !== 6 && !feriados.includes(data)
}
