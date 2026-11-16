// Datas civis `AAAA-MM-DD` como inteiros (dias desde 1970-01-01), sem `Date`: o fuso da máquina
// não tem como interferir. Conversões pelo algoritmo de Howard Hinnant
// ("chrono-compatible low-level date algorithms").

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 0
}

function diaDe(ano: number, mes: number, dia: number): number {
  const a = mes <= 2 ? ano - 1 : ano
  const era = Math.floor(a / 400)
  const anoDaEra = a - era * 400
  const diaDoAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
  const diaDaEra = anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno
  return era * 146097 + diaDaEra - 719468
}

function civil(dia: number): [ano: number, mes: number, dia: number] {
  const z = dia + 719468
  const era = Math.floor(z / 146097)
  const diaDaEra = z - era * 146097
  const anoDaEra = Math.floor(
    (diaDaEra -
      Math.floor(diaDaEra / 1460) +
      Math.floor(diaDaEra / 36524) -
      Math.floor(diaDaEra / 146096)) /
      365,
  )
  const diaDoAno =
    diaDaEra - (365 * anoDaEra + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100))
  const mp = Math.floor((5 * diaDoAno + 2) / 153)
  const d = diaDoAno - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const ano = anoDaEra + era * 400 + (m <= 2 ? 1 : 0)
  return [ano, m, d]
}

/** Dia (inteiro) de uma data civil; `null` se o valor não é uma data existente. */
export function paraDia(valor: unknown): number | null {
  if (typeof valor !== 'string') return null
  const partes = FORMATO.exec(valor)
  if (!partes) return null
  const ano = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDoMes(ano, mes)) return null
  return diaDe(ano, mes, dia)
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/** Data civil de um dia inteiro. */
export function paraData(dia: number): string {
  const [ano, mes, d] = civil(dia)
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(d)}`
}

/** Índice do mês de um dia: ano × 12 + (mês − 1). */
export function mesDoDia(dia: number): number {
  const [ano, mes] = civil(dia)
  return ano * 12 + (mes - 1)
}

/** Primeiro dia de um mês dado pelo índice. */
export function primeiroDiaDoMes(mes: number): number {
  return diaDe(Math.floor(mes / 12), (mes % 12) + 1, 1)
}

/** `AAAA-MM` de um índice de mês. */
export function rotuloDoMes(mes: number): string {
  return `${String(Math.floor(mes / 12)).padStart(4, '0')}-${doisDigitos((mes % 12) + 1)}`
}
