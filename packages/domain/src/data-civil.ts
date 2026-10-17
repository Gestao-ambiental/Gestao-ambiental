// Datas civis (ADR-0009): `AAAA-MM-DD`, sem hora e sem fuso.
// Portado de dist/domain.js do protótipo (iso, parse, addDays, days, addMonths, weekRange, weekdayLabel, brDate).
// O protótipo calculava com Date em UTC ao meio-dia; aqui a aritmética é inteira (dias desde 1970-01-01),
// com o mesmo resultado e sem nenhum Date, então o fuso da máquina não tem como interferir.

/** Data civil no formato ISO `AAAA-MM-DD`. */
export type DataCivil = `${number}-${number}-${number}`

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

/** Último dia do mês (mês de 1 a 12). */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 0
}

/** Diz se o texto é uma data civil existente (rejeita 2026-02-30, 2026-13-01, 2026-1-5). */
export function ehDataCivil(texto: unknown): texto is DataCivil {
  if (typeof texto !== 'string') return false
  const partes = FORMATO.exec(texto)
  if (!partes) return false
  const ano = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDiaDoMes(ano, mes)
}

/** Valida e devolve a data como DataCivil; lança erro se não for uma data existente. */
export function dataCivil(texto: string): DataCivil {
  if (!ehDataCivil(texto)) throw new Error(`Data civil inválida: "${texto}". Use AAAA-MM-DD.`)
  return texto
}

function partes(data: DataCivil): [ano: number, mes: number, dia: number] {
  const valida = dataCivil(data)
  return [Number(valida.slice(0, 4)), Number(valida.slice(5, 7)), Number(valida.slice(8, 10))]
}

function montar(ano: number, mes: number, dia: number): DataCivil {
  const a = String(ano).padStart(4, '0')
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${a}-${m}-${d}` as DataCivil
}

// Conversão data civil <-> dias desde 1970-01-01 no calendário gregoriano proleptico
// (algoritmo de Howard Hinnant, "chrono-compatible low-level date algorithms").
function paraDias(data: DataCivil): number {
  const [ano, mes, dia] = partes(data)
  const a = mes <= 2 ? ano - 1 : ano
  const era = Math.floor(a / 400)
  const anoDaEra = a - era * 400
  const diaDoAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
  const diaDaEra = anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno
  return era * 146097 + diaDaEra - 719468
}

function deDias(total: number): DataCivil {
  const z = total + 719468
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
  const dia = diaDoAno - Math.floor((153 * mp + 2) / 5) + 1
  const mes = mp < 10 ? mp + 3 : mp - 9
  const ano = anoDaEra + era * 400 + (mes <= 2 ? 1 : 0)
  return montar(ano, mes, dia)
}

/** Soma (ou subtrai, se negativo) dias corridos. Protótipo: `addDays`. */
export function adicionarDias(data: DataCivil, dias: number): DataCivil {
  if (!Number.isInteger(dias)) throw new Error(`Quantidade de dias inválida: ${String(dias)}.`)
  return deDias(paraDias(data) + dias)
}

/** Diferença em dias corridos: `a − b` (positivo se `a` vem depois). Protótipo: `days(a, b)`. */
export function diferencaEmDias(a: DataCivil, b: DataCivil): number {
  return paraDias(a) - paraDias(b)
}

/**
 * Soma meses preservando o dia; se o dia não existe no mês de destino, usa o último dia do mês
 * (31/01 + 1 mês = 28/02 ou 29/02; 29/02 + 12 meses = 28/02 do ano seguinte). Protótipo: `addMonths`.
 */
export function adicionarMeses(data: DataCivil, meses: number): DataCivil {
  if (!Number.isInteger(meses)) throw new Error(`Quantidade de meses inválida: ${String(meses)}.`)
  const [ano, mes, dia] = partes(data)
  const indice = ano * 12 + (mes - 1) + meses
  const novoAno = Math.floor(indice / 12)
  const novoMes = indice - novoAno * 12 + 1
  return montar(novoAno, novoMes, Math.min(dia, ultimoDiaDoMes(novoAno, novoMes)))
}

/** Dia da semana: 0 = domingo … 6 = sábado (como `getUTCDay` no protótipo). */
export function diaDaSemana(data: DataCivil): number {
  // 1970-01-01 foi quinta-feira (4)
  return (((paraDias(data) + 4) % 7) + 7) % 7
}

const NOMES_DIAS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

/** Nome do dia da semana em português. Protótipo: `weekdayLabel` (que usava toLocaleDateString pt-BR). */
export function nomeDoDiaDaSemana(data: DataCivil): string {
  return NOMES_DIAS[diaDaSemana(data)] ?? ''
}

/** Segunda a domingo da semana que contém a data. Protótipo: `weekRange`. */
export function semanaDe(data: DataCivil): [segunda: DataCivil, domingo: DataCivil] {
  const segunda = adicionarDias(data, -((diaDaSemana(data) + 6) % 7))
  return [segunda, adicionarDias(segunda, 6)]
}

/** Exibição `dd/mm/aaaa`; vazio para data ausente. Protótipo: `brDate`. */
export function formatarDataCivil(data: DataCivil | '' | null | undefined): string {
  return data ? data.slice(0, 10).split('-').reverse().join('/') : ''
}

/** Data e hora de parede num fuso IANA, para um instante absoluto. */
export interface DataEHoraNoFuso {
  data: DataCivil
  /** `HH:MM:SS`, 24 horas */
  hora: string
  /** `AAAA-MM-DDTHH:MM:SS`, sem fuso */
  iso: string
}

const formatadores = new Map<string, Intl.DateTimeFormat>()

/**
 * Converte um instante para a data e a hora de parede no fuso da consultoria (ex.: America/Sao_Paulo).
 * É assim que se obtém "hoje" para calcular prazos: o instante vem de fora (servidor ou relógio
 * corrigido) e o fuso vem da consultoria, nunca do aparelho. Protótipo: `brasiliaNow`, fixo em Brasília.
 */
export function dataEHoraNoFuso(instante: Date, fuso: string): DataEHoraNoFuso {
  let formatador = formatadores.get(fuso)
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatadores.set(fuso, formatador)
  }
  const p = Object.fromEntries(formatador.formatToParts(instante).map((x) => [x.type, x.value]))
  const data = dataCivil(`${p.year ?? ''}-${p.month ?? ''}-${p.day ?? ''}`)
  const hora = `${p.hour ?? ''}:${p.minute ?? ''}:${p.second ?? ''}`
  return { data, hora, iso: `${data}T${hora}` }
}

/** "Hoje" no fuso da consultoria, para o instante informado. */
export function hojeNoFuso(instante: Date, fuso: string): DataCivil {
  return dataEHoraNoFuso(instante, fuso).data
}
