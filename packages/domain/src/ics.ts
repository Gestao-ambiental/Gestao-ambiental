// Calendário em iCalendar (RFC 5545) com eventos de dia inteiro (ADR-0047). Mesma regra e mesmos
// vetores de teste de supabase/functions/_shared/ics.ts (o feed): mudar uma exige mudar a outra.
// Sem relógio: o instante do DTSTAMP entra como parâmetro.

import { adicionarDias, ehDataCivil, type DataCivil } from './data-civil'

export interface EventoIcs {
  /** Identificador estável do evento (`<tipo>-<id>@gramaapp.com.br`). */
  uid: string
  /** Dia do evento (dia inteiro). */
  data: DataCivil
  resumo: string
  descricao?: string | null
  url?: string | null
}

export interface OpcoesDoIcs {
  /** Nome do calendário (X-WR-CALNAME). */
  nome: string
  /** Instante da geração (DTSTAMP, em UTC). */
  agora: Date
}

const CRLF = '\r\n'
const LIMITE_OCTETOS = 75

/** Octetos UTF-8 de um ponto de código. */
function octetos(caractere: string): number {
  const codigo = caractere.codePointAt(0) ?? 0
  if (codigo < 0x80) return 1
  if (codigo < 0x800) return 2
  if (codigo < 0x10000) return 3
  return 4
}

function ehControle(caractere: string): boolean {
  const codigo = caractere.codePointAt(0) ?? 0
  return codigo <= 0x1f || codigo === 0x7f
}

/**
 * Escapa um valor TEXT: `\` primeiro, depois `;` e `,`; quebras de linha (CRLF, LF ou CR) viram
 * `\n`; os outros caracteres de controle saem.
 */
export function escaparTextoIcs(texto: string): string {
  const escapado = texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
  let limpo = ''
  for (const caractere of escapado) if (!ehControle(caractere)) limpo += caractere
  return limpo
}

/**
 * Dobra a linha em linhas físicas de até 75 octetos UTF-8; a continuação começa com um espaço
 * (que conta nos 75). Nunca parte um caractere de vários octetos.
 */
export function dobrarLinhaIcs(linha: string): string {
  const partes: string[] = []
  let atual = ''
  let tamanho = 0
  for (const caractere of linha) {
    const n = octetos(caractere)
    if (tamanho + n > LIMITE_OCTETOS) {
      partes.push(atual)
      atual = ' '
      tamanho = 1
    }
    atual += caractere
    tamanho += n
  }
  partes.push(atual)
  return partes.join(CRLF)
}

function dataIcs(data: DataCivil): string {
  return data.replace(/-/g, '')
}

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, '0')
}

function instanteUtc(agora: Date): string {
  if (Number.isNaN(agora.getTime())) throw new Error('Data inválida no calendário.')
  return (
    String(agora.getUTCFullYear()).padStart(4, '0') +
    doisDigitos(agora.getUTCMonth() + 1) +
    doisDigitos(agora.getUTCDate()) +
    'T' +
    doisDigitos(agora.getUTCHours()) +
    doisDigitos(agora.getUTCMinutes()) +
    doisDigitos(agora.getUTCSeconds()) +
    'Z'
  )
}

/**
 * Gera o arquivo .ics: cabeçalho fixo, um VEVENT de dia inteiro por evento (na ordem dada) e CRLF
 * em toda linha, inclusive a última. Lista vazia gera um calendário válido sem eventos.
 */
export function gerarIcs(eventos: readonly EventoIcs[], opcoes: OpcoesDoIcs): string {
  const carimbo = instanteUtc(opcoes.agora)
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grama//Prazos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTextoIcs(opcoes.nome)}`,
  ]
  for (const evento of eventos) {
    if (!ehDataCivil(evento.data)) throw new Error('Data inválida no calendário.')
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${escaparTextoIcs(evento.uid)}`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dataIcs(evento.data)}`,
      `DTEND;VALUE=DATE:${dataIcs(adicionarDias(evento.data, 1))}`,
      `SUMMARY:${escaparTextoIcs(evento.resumo)}`,
    )
    if (evento.descricao) linhas.push(`DESCRIPTION:${escaparTextoIcs(evento.descricao)}`)
    if (evento.url) linhas.push(`URL:${evento.url}`)
    linhas.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  linhas.push('END:VCALENDAR')
  return linhas.map((linha) => dobrarLinhaIcs(linha) + CRLF).join('')
}
