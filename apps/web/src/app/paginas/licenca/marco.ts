import type { DataCivil } from '@gestao-ambiental/domain'

import type { Instrumento } from '@/lib/api/licencas'

/** Data do marco escolhido na identificação: base da primeira data sugerida. */
export function dataDoMarco(instrumento: Instrumento): DataCivil | null {
  switch (instrumento.marco) {
    case 'emissao':
      return instrumento.emitidoEm
    case 'assinatura':
      return instrumento.assinadoEm
    case 'publicacao':
      return instrumento.publicadoEm
    case 'recebimento':
      return instrumento.recebidoEm
    default:
      return null
  }
}
