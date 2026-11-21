// Estações da linha de trajeto do plano de renovação: só apresentação. As datas vêm do domínio
// (datasRenovacaoLao); aqui elas só são postas em ordem e ganham o estado em relação a hoje.
import { diferencaEmDias, type DataCivil } from '@gestao-ambiental/domain'

export type EstadoDaEstacao = 'feito' | 'atual' | 'futuro'

export interface Estacao {
  chave: 'inicio' | 'protocolo' | 'limite' | 'vencimento' | 'hoje'
  rotulo: string
  data: DataCivil
  estado: EstadoDaEstacao
  /** A estação cai hoje (a de "hoje" e qualquer outra com a data de hoje). */
  ehHoje: boolean
  /** Dias corridos até a próxima estação; nulo na última. */
  diasAteAProxima: number | null
}

/**
 * Início da preparação, protocolo (se houver), limite de protocolo e vencimento, em ordem de
 * data, com "hoje" entre elas. Antes de hoje = feito (estação cheia); hoje = atual (verde com aro);
 * depois = futuro (vazada). Uma estação na data de hoje vira a atual no lugar da estação "hoje".
 */
export function estacoesDaRenovacao(entrada: {
  inicio: DataCivil
  limite: DataCivil
  vencimento: DataCivil
  protocoladoEm: DataCivil | null
  hoje: DataCivil
}): Estacao[] {
  const { inicio, limite, vencimento, protocoladoEm, hoje } = entrada
  const base: { chave: Estacao['chave']; rotulo: string; data: DataCivil }[] = [
    { chave: 'inicio', rotulo: 'Início da preparação', data: inicio },
    ...(protocoladoEm
      ? [{ chave: 'protocolo' as const, rotulo: 'Protocolada', data: protocoladoEm }]
      : []),
    { chave: 'limite', rotulo: 'Limite de protocolo', data: limite },
    { chave: 'vencimento', rotulo: 'Vencimento', data: vencimento },
  ]
  const comHoje = base.some((e) => e.data === hoje)
    ? base
    : [...base, { chave: 'hoje' as const, rotulo: 'Hoje', data: hoje }]
  // Ordem estável: em datas iguais, a ordem de cima vale (hoje fica depois do que cai no mesmo dia).
  const ordenadas = comHoje
    .map((e, indice) => ({ ...e, indice }))
    .sort((a, b) => (a.data === b.data ? a.indice - b.indice : a.data < b.data ? -1 : 1))
  return ordenadas.map((e, i) => {
    const proxima = ordenadas[i + 1]
    return {
      chave: e.chave,
      rotulo: e.rotulo,
      data: e.data,
      estado: e.data < hoje ? 'feito' : e.data === hoje ? 'atual' : 'futuro',
      ehHoje: e.data === hoje,
      diasAteAProxima: proxima ? diferencaEmDias(proxima.data, e.data) : null,
    }
  })
}
