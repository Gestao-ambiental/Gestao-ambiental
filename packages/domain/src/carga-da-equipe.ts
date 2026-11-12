// Carga da equipe por mês de execução (decisão do Eduardo, 12/11/2026). Cada serviço do orçamento
// tem um responsável (membro) e o mês previsto. Ao escolher a pessoa, a tela mostra as horas dela
// naquele mês: as de orçamentos aprovados (vêm do banco, carga_da_equipe) mais as deste orçamento,
// contra a jornada do mês cadastrada em Custos e taxas.

import { adicionarMeses, dataCivil, ehDataCivil, type DataCivil } from './data-civil'

/** Quantos meses o seletor oferece, a partir do mês atual. */
export const MESES_DE_EXECUCAO = 18

const NOMES_DOS_MESES = [
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
] as const

export interface JornadaDoMembro {
  membroId: string
  /** Horas de trabalho no mês (Custos e taxas). */
  horasMes: number
}

export interface HorasComprometidas {
  membroId: string
  /** Primeiro dia do mês (aaaa-mm-01). */
  mes: string
  minutos: number
}

export interface ServicoComResponsavel {
  responsavelId?: string | null
  mesPrevisto?: string | null
  minutos: number
}

export interface CargaDoMes {
  /** `null` quando a pessoa não está na equipe de Custos e taxas. */
  jornadaMinutos: number | null
  /** Em orçamentos aprovados. */
  comprometidoMinutos: number
  /** Neste orçamento, somando todos os serviços da pessoa no mês. */
  desteOrcamentoMinutos: number
  totalMinutos: number
  acimaDaJornada: boolean
}

/** Mês como primeiro dia (aaaa-mm-01). */
export function ehMesDeExecucao(texto: unknown): texto is DataCivil {
  return ehDataCivil(texto) && texto.endsWith('-01')
}

/** Primeiro dia do mês de uma data. */
export function inicioDoMes(data: DataCivil): DataCivil {
  return dataCivil(`${data.slice(0, 8)}01`)
}

/** Meses que o seletor oferece: do mês de `hoje` em diante. */
export function mesesDeExecucao(hoje: DataCivil, quantidade = MESES_DE_EXECUCAO): DataCivil[] {
  const primeiro = inicioDoMes(hoje)
  return Array.from({ length: quantidade }, (_, i) => adicionarMeses(primeiro, i))
}

/** "dez/2026". */
export function rotuloDoMes(mes: string): string {
  if (!ehMesDeExecucao(mes)) return mes
  const numero = Number(mes.slice(5, 7))
  return `${NOMES_DOS_MESES[numero - 1] ?? ''}/${mes.slice(0, 4)}`
}

/** Horas da pessoa no mês: aprovadas + deste orçamento, contra a jornada. */
export function cargaDoMes(
  membroId: string,
  mes: string,
  jornadas: readonly JornadaDoMembro[],
  comprometido: readonly HorasComprometidas[],
  servicos: readonly ServicoComResponsavel[],
): CargaDoMes {
  const jornada = jornadas.find((j) => j.membroId === membroId)
  const comprometidoMinutos = comprometido
    .filter((c) => c.membroId === membroId && c.mes === mes)
    .reduce((soma, c) => soma + c.minutos, 0)
  const desteOrcamentoMinutos = servicos
    .filter((s) => s.responsavelId === membroId && s.mesPrevisto === mes)
    .reduce((soma, s) => soma + s.minutos, 0)
  const totalMinutos = comprometidoMinutos + desteOrcamentoMinutos
  const jornadaMinutos = jornada ? jornada.horasMes * 60 : null
  return {
    jornadaMinutos,
    comprometidoMinutos,
    desteOrcamentoMinutos,
    totalMinutos,
    acimaDaJornada: jornadaMinutos !== null && totalMinutos > jornadaMinutos,
  }
}
