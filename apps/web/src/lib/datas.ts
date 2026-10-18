import { dataEHoraNoFuso, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'

/**
 * Instante do servidor (TIMESTAMPTZ em ISO) exibido como dd/mm/aaaa no fuso da consultoria,
 * nunca no fuso do aparelho.
 */
export function formatarInstanteComoData(instante: string, fuso: string): string {
  return formatarDataCivil(hojeNoFuso(new Date(instante), fuso))
}

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** "28 ago" no ano de `hoje`; "15 fev 2027" em outro ano (Protótipo 05). */
export function formatarDataCurta(data: string, hoje: string): string {
  const [ano, mes, dia] = data.split('-')
  const texto = `${String(Number(dia))} ${MESES_CURTOS[Number(mes) - 1] ?? ''}`
  return ano === hoje.slice(0, 4) ? texto : `${texto} ${ano ?? ''}`
}

/** "outubro de 2026". `mes` de 1 a 12. */
export function nomeDoMes(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? ''} de ${String(ano)}`
}

/** Instante do servidor como "dd/mm/aaaa às HH:MM" no fuso da consultoria. */
export function formatarInstanteComHora(instante: string, fuso: string): string {
  const { data, hora } = dataEHoraNoFuso(new Date(instante), fuso)
  return `${formatarDataCivil(data)} às ${hora.slice(0, 5)}`
}
