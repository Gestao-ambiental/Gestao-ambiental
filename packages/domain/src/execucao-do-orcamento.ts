// Execução do orçamento aprovado (P7, ADR-0053): horas orçadas contra lançadas e o dinheiro das
// parcelas (recebido, a receber, vencido sem receber). Diferença = orçado − lançado: positiva é
// folga, negativa é estouro. Estornos não contam (o banco já devolve o recebido sem eles).
import type { DataCivil } from './data-civil'

export interface HorasDoItem {
  orcadoMinutos: number
  lancadoMinutos: number
}

export interface HorasDaExecucao {
  orcadoMinutos: number
  lancadoMinutos: number
  diferencaMinutos: number
  /** Lançado ÷ orçado, de 0 em diante; nulo quando nada foi orçado. */
  proporcao: number | null
}

export function horasDaExecucao(itens: readonly HorasDoItem[]): HorasDaExecucao {
  const orcadoMinutos = itens.reduce((soma, i) => soma + Math.max(0, i.orcadoMinutos), 0)
  const lancadoMinutos = itens.reduce((soma, i) => soma + Math.max(0, i.lancadoMinutos), 0)
  return {
    orcadoMinutos,
    lancadoMinutos,
    diferencaMinutos: orcadoMinutos - lancadoMinutos,
    proporcao: orcadoMinutos > 0 ? lancadoMinutos / orcadoMinutos : null,
  }
}

export interface ParcelaDaExecucao {
  valorCentavos: number
  recebidoCentavos: number
  venceEm: DataCivil | null
}

export interface SituacaoFinanceira {
  aprovadoCentavos: number
  recebidoCentavos: number
  aReceberCentavos: number
  vencidoCentavos: number
}

/** Somas do dinheiro das parcelas; vencida = vence antes de hoje e ainda tem saldo. */
export function situacaoFinanceira(
  parcelas: readonly ParcelaDaExecucao[],
  hoje: DataCivil,
): SituacaoFinanceira {
  let aprovado = 0
  let recebido = 0
  let aReceber = 0
  let vencido = 0
  for (const p of parcelas) {
    const saldo = Math.max(0, p.valorCentavos - p.recebidoCentavos)
    aprovado += p.valorCentavos
    recebido += p.recebidoCentavos
    aReceber += saldo
    if (p.venceEm !== null && p.venceEm < hoje) vencido += saldo
  }
  return {
    aprovadoCentavos: aprovado,
    recebidoCentavos: recebido,
    aReceberCentavos: aReceber,
    vencidoCentavos: vencido,
  }
}

export type SituacaoDaParcela = 'recebida' | 'vencida' | 'a_receber'

export function situacaoDaParcela(parcela: ParcelaDaExecucao, hoje: DataCivil): SituacaoDaParcela {
  if (parcela.recebidoCentavos >= parcela.valorCentavos) return 'recebida'
  if (parcela.venceEm !== null && parcela.venceEm < hoje) return 'vencida'
  return 'a_receber'
}

/** Minutos de 1 a 1440 (até 24 h por lançamento), como no banco. */
export function minutosDoLancamentoValidos(minutos: number): boolean {
  return Number.isInteger(minutos) && minutos >= 1 && minutos <= 1440
}
