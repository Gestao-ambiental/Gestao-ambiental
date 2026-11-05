// Cálculos do campo de data com calendário: a grade do mês, a máscara dd/mm/aaaa e a leitura do que
// a pessoa digitou. Só datas civis (ADR-0009): nada de Date, então o fuso do aparelho não entra.

import { adicionarDias, diaDaSemana, ehDataCivil, type DataCivil } from './data-civil'

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
] as const

/** Nome do mês (1 a 12) em português, minúsculo. */
export function nomeDoMes(mes: number): string {
  return MESES[mes - 1] ?? ''
}

/** "15 de fevereiro de 2027", para nome acessível do dia. */
export function dataPorExtenso(data: DataCivil): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return `${String(dia)} de ${nomeDoMes(mes ?? 0)} de ${String(ano)}`
}

/** Monta a data civil de ano, mês (1 a 12) e dia, sem validar. */
export function montarData(ano: number, mes: number, dia: number): DataCivil {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` as DataCivil
}

/**
 * As seis semanas (domingo a sábado) que mostram o mês: começa no domingo da semana do dia 1 e
 * completa com os dias dos meses vizinhos, para a grade nunca mudar de altura.
 */
export function semanasDoMes(ano: number, mes: number): DataCivil[][] {
  const primeiro = montarData(ano, mes, 1)
  let dia = adicionarDias(primeiro, -diaDaSemana(primeiro))
  const semanas: DataCivil[][] = []
  for (let s = 0; s < 6; s++) {
    const semana: DataCivil[] = []
    for (let d = 0; d < 7; d++) {
      semana.push(dia)
      dia = adicionarDias(dia, 1)
    }
    semanas.push(semana)
  }
  return semanas
}

/** Põe as barras enquanto a pessoa digita: "1402" vira "14/02", "14022023" vira "14/02/2023". */
export function mascararData(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8)
  if (digitos.length <= 2) return digitos
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`
}

export type LeituraDeData =
  | { situacao: 'vazia' }
  | { situacao: 'incompleta' }
  | { situacao: 'inexistente' }
  | { situacao: 'valida'; data: DataCivil }

/**
 * Lê "dd/mm/aaaa" (ou "aaaa-mm-dd", quando colado). "31/02/2027" é inexistente; "14/02" é
 * incompleta. O ano tem sempre quatro dígitos: "14/02/23" não vira 2023 por adivinhação.
 */
export function lerDataDigitada(texto: string): LeituraDeData {
  const limpo = texto.trim()
  if (limpo === '') return { situacao: 'vazia' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    return ehDataCivil(limpo) ? { situacao: 'valida', data: limpo } : { situacao: 'inexistente' }
  }
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo)
  if (!partes) return { situacao: 'incompleta' }
  const data = `${partes[3] ?? ''}-${partes[2] ?? ''}-${partes[1] ?? ''}`
  return ehDataCivil(data) ? { situacao: 'valida', data } : { situacao: 'inexistente' }
}
