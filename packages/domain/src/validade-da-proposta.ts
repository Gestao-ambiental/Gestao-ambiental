// Data e validade da proposta (Protótipo 21). A data da proposta é o dia em que ela saiu do
// rascunho (normalmente "enviada"), no fuso da consultoria; enquanto rascunho, é hoje. A validade
// conta dias corridos a partir dessa data: 30 dias de 12/10/2026 vão até 11/11/2026.

import { adicionarDias, hojeNoFuso, type DataCivil } from './data-civil'

/** Uma mudança de situação do histórico (orcamento_situacao). `em` é o instante em ISO. */
export interface MudancaDaProposta {
  de: string
  para: string
  revisao: number
  em: string
}

export interface DatasDaProposta {
  /** Data que a proposta mostra: a do envio ou, em rascunho, hoje. */
  data: DataCivil
  /** Último dia de validade: `data` + dias corridos. */
  validaAte: DataCivil
  /** Verdadeiro quando há registro da saída do rascunho; senão a data é hoje e muda a cada dia. */
  enviada: boolean
}

/**
 * Datas da proposta. Fora do rascunho, vale a saída mais recente do rascunho na revisão atual
 * (enviada, ou aprovada direto); sem esse registro (dado antigo), cai em hoje, como no rascunho.
 * `agora` vem de quem chama: o domínio não lê relógio.
 */
export function datasDaProposta(entrada: {
  situacao: string
  revisao: number
  historico: readonly MudancaDaProposta[]
  validadeDias: number
  agora: Date
  fuso: string
}): DatasDaProposta {
  const { situacao, revisao, historico, validadeDias, agora, fuso } = entrada
  if (!Number.isInteger(validadeDias) || validadeDias < 0)
    throw new Error(`Validade inválida: ${String(validadeDias)}.`)
  const hoje = hojeNoFuso(agora, fuso)
  let saida: Date | null = null
  if (situacao !== 'rascunho') {
    for (const h of historico) {
      if (h.de !== 'rascunho' || h.para === 'rascunho' || h.revisao !== revisao) continue
      const instante = new Date(h.em)
      if (Number.isNaN(instante.getTime())) continue
      if (!saida || instante > saida) saida = instante
    }
  }
  const data = saida ? hojeNoFuso(saida, fuso) : hoje
  return { data, validaAte: adicionarDias(data, validadeDias), enviada: saida !== null }
}
