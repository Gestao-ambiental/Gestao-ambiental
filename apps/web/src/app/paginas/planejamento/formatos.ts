const HORAS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export const NOMES_DOS_MESES: readonly string[] = [
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

/** "1.193 h". */
export function formatarHoras(horas: number): string {
  return `${HORAS.format(horas)} h`
}

function partes(mes: string): { ano: string; nome: string } {
  return { ano: mes.slice(0, 4), nome: NOMES_DOS_MESES[Number(mes.slice(5, 7)) - 1] ?? mes }
}

/** `2027-03` vira "março de 2027". */
export function nomeDoMes(mes: string): string {
  const { ano, nome } = partes(mes)
  return `${nome} de ${ano}`
}

/** `2027-03` vira "mar"; janeiro leva o ano ("jan/27") para marcar a virada. */
export function nomeCurtoDoMes(mes: string): string {
  const { ano, nome } = partes(mes)
  const curto = nome.slice(0, 3)
  return mes.endsWith('-01') ? `${curto}/${ano.slice(2)}` : curto
}
