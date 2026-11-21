// Gerador de calendário iCalendar (RFC 5545) para o feed do calendário (ADR-0047). Mesma regra de
// packages/domain/src/ics.ts (o Deno não importa o domínio): as duas implementações passam pelos
// mesmos vetores de teste (V1 a V6). Mudar uma exige mudar a outra.
//
// - CRLF em toda linha, inclusive a última.
// - Eventos de dia inteiro: DTSTART;VALUE=DATE e DTEND;VALUE=DATE (dia seguinte, exclusivo).
// - Texto (SUMMARY, DESCRIPTION, UID, X-WR-CALNAME) escapado: \ ; , e quebra de linha; outros
//   caracteres de controle removidos.
// - Linhas dobradas em 75 octetos UTF-8, sem partir caractere multibyte.

/** Data civil no formato aaaa-mm-dd. */
export type DataCivil = string

export interface EventoIcs {
  uid: string
  data: DataCivil
  resumo: string
  descricao?: string | null
  url?: string | null
}

export interface OpcoesDoIcs {
  nome: string
  agora: Date
}

const CRLF = '\r\n'
const LIMITE_OCTETOS = 75
const codificador = new TextEncoder()

/** Escapa um valor TEXT (RFC 5545, 3.3.11). */
export function escaparTextoIcs(texto: string): string {
  return (
    texto
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\n|\r/g, '\\n')
      // deno-lint-ignore no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
  )
}

/** Dobra uma linha de conteúdo em linhas físicas de até 75 octetos (RFC 5545, 3.1). */
export function dobrarLinhaIcs(linha: string): string {
  const partes: string[] = []
  let atual = ''
  let octetos = 0
  let limite = LIMITE_OCTETOS
  for (const caractere of linha) {
    const tamanho = codificador.encode(caractere).length
    if (octetos + tamanho > limite) {
      partes.push(atual)
      atual = ''
      octetos = 0
      // Continuação: o espaço inicial conta nos 75 octetos.
      limite = LIMITE_OCTETOS - 1
    }
    atual += caractere
    octetos += tamanho
  }
  partes.push(atual)
  return partes.join(`${CRLF} `)
}

function lerData(data: DataCivil): { ano: number; mes: number; dia: number } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!partes) throw new Error('Data inválida no calendário.')
  const ano = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])
  const conferida = new Date(Date.UTC(ano, mes - 1, dia))
  if (
    conferida.getUTCFullYear() !== ano ||
    conferida.getUTCMonth() !== mes - 1 ||
    conferida.getUTCDate() !== dia
  ) {
    throw new Error('Data inválida no calendário.')
  }
  return { ano, mes, dia }
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

function dataCompacta(data: Date): string {
  return `${String(data.getUTCFullYear()).padStart(4, '0')}${doisDigitos(data.getUTCMonth() + 1)}${doisDigitos(data.getUTCDate())}`
}

function instanteUtc(agora: Date): string {
  return `${dataCompacta(agora)}T${doisDigitos(agora.getUTCHours())}${doisDigitos(agora.getUTCMinutes())}${doisDigitos(agora.getUTCSeconds())}Z`
}

/** Gera o calendário com os eventos de dia inteiro, na ordem dada. */
export function gerarIcs(eventos: readonly EventoIcs[], opcoes: OpcoesDoIcs): string {
  const carimbo = instanteUtc(opcoes.agora)
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grama//Prazos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTextoIcs(opcoes.nome)}`,
  ]
  for (const evento of eventos) {
    const { ano, mes, dia } = lerData(evento.data)
    const inicio = new Date(Date.UTC(ano, mes - 1, dia))
    const fim = new Date(Date.UTC(ano, mes - 1, dia + 1))
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${escaparTextoIcs(evento.uid)}`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dataCompacta(inicio)}`,
      `DTEND;VALUE=DATE:${dataCompacta(fim)}`,
      `SUMMARY:${escaparTextoIcs(evento.resumo)}`,
    )
    if (evento.descricao) linhas.push(`DESCRIPTION:${escaparTextoIcs(evento.descricao)}`)
    // URI, sem escape de texto; caracteres de controle nunca entram (não quebram a linha).
    // deno-lint-ignore no-control-regex
    const url = evento.url ? evento.url.replace(/[\u0000-\u001f\u007f]/g, '') : ''
    if (url) linhas.push(`URL:${url}`)
    linhas.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  linhas.push('END:VCALENDAR')
  return linhas.map(dobrarLinhaIcs).join(CRLF) + CRLF
}
