import {
  descreverRegistro,
  formatarDataCivil,
  type SituacaoDoRegistro,
} from '@gestao-ambiental/domain'

import type { TomSelo } from '@/components/ui/selo'
import type { RegistroProfissional } from '@/lib/api/registros-profissionais'

/** Tom do selo de cada situação do registro (a palavra vai sempre junto da cor). */
export const TOM_DA_SITUACAO: Record<SituacaoDoRegistro, TomSelo> = {
  confirmado: 'sucesso',
  aguardando_confirmacao: 'revisao',
  vencido: 'perigo',
}

/** "Crea-SC 123456 · válido até 31/03/2027". */
export function detalheDoRegistro(registro: RegistroProfissional): string {
  const texto = descreverRegistro(registro)
  return registro.validoAte
    ? `${texto} · válido até ${formatarDataCivil(registro.validoAte)}`
    : texto
}
