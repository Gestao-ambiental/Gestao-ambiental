import { formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'

/**
 * Instante do servidor (TIMESTAMPTZ em ISO) exibido como dd/mm/aaaa no fuso da consultoria,
 * nunca no fuso do aparelho.
 */
export function formatarInstanteComoData(instante: string, fuso: string): string {
  return formatarDataCivil(hojeNoFuso(new Date(instante), fuso))
}
