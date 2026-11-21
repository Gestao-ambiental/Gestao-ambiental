// Execução do orçamento aprovado (P7, ADR-0053): horas lançadas e recebimentos das parcelas.
import { dataCivil, type DataCivil } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { obterSupabase } from '@/lib/supabase'

export interface ItemDaExecucao {
  id: string
  descricao: string
  orcadoMinutos: number
  lancadoMinutos: number
}

export interface Apontamento {
  id: string
  data: DataCivil
  minutos: number
  nota: string | null
  membroId: string
  membroNome: string
  itemId: string | null
}

export interface Recebimento {
  id: string
  valorCentavos: number
  recebidoEm: DataCivil
  nota: string | null
  estornado: boolean
  rowVersion: number
}

export interface ParcelaComRecebimentos {
  id: string
  descricao: string
  valorCentavos: number
  recebidoCentavos: number
  venceEm: DataCivil | null
  recebimentos: Recebimento[]
}

export interface ExecucaoDoOrcamento {
  financeiro: boolean
  itens: ItemDaExecucao[]
  apontamentos: Apontamento[]
  /** Nulo para quem não tem a permissão financeira. */
  parcelas: ParcelaComRecebimentos[] | null
}

interface Cru {
  financeiro: boolean
  itens: { id: string; descricao: string; orcado_minutos: number; lancado_minutos: number }[]
  apontamentos: {
    id: string
    data: string
    minutos: number
    nota: string | null
    membro_id: string
    membro_nome: string
    item_id: string | null
  }[]
  parcelas:
    | {
        id: string
        descricao: string
        valor_centavos: number
        recebido_centavos: number
        vence_em: string | null
        recebimentos: {
          id: string
          valor_centavos: number
          recebido_em: string
          nota: string | null
          estornado: boolean
          row_version: number
        }[]
      }[]
    | null
}

export async function obterExecucao(orcamentoId: string): Promise<ExecucaoDoOrcamento> {
  const { data, error } = await obterSupabase().rpc('execucao_do_orcamento', {
    p_orcamento_id: orcamentoId,
  })
  if (error) throw error
  const cru = data as unknown as Cru
  return {
    financeiro: cru.financeiro,
    itens: cru.itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      orcadoMinutos: i.orcado_minutos,
      lancadoMinutos: i.lancado_minutos,
    })),
    apontamentos: cru.apontamentos.map((a) => ({
      id: a.id,
      data: dataCivil(a.data),
      minutos: a.minutos,
      nota: a.nota,
      membroId: a.membro_id,
      membroNome: a.membro_nome,
      itemId: a.item_id,
    })),
    parcelas:
      cru.parcelas?.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        valorCentavos: p.valor_centavos,
        recebidoCentavos: p.recebido_centavos,
        venceEm: p.vence_em ? dataCivil(p.vence_em) : null,
        recebimentos: p.recebimentos.map((r) => ({
          id: r.id,
          valorCentavos: r.valor_centavos,
          recebidoEm: dataCivil(r.recebido_em),
          nota: r.nota,
          estornado: r.estornado,
          rowVersion: r.row_version,
        })),
      })) ?? null,
  }
}

export async function lancarHoras(dados: {
  id: string
  orcamentoId: string
  itemId: string
  data: DataCivil
  minutos: number
  nota: string | null
}): Promise<void> {
  const { error } = await obterSupabase().rpc('lancar_horas', {
    p_id: dados.id,
    p_orcamento_id: dados.orcamentoId,
    p_orcamento_item_id: dados.itemId,
    p_tarefa_servico_id: aceitaNulo<string>(null),
    p_data: dados.data,
    p_minutos: dados.minutos,
    p_nota: aceitaNulo(dados.nota),
  })
  if (error) throw error
}

export async function removerApontamento(id: string): Promise<void> {
  const { error } = await obterSupabase().rpc('remover_apontamento', { p_id: id })
  if (error) throw error
}

export async function registrarRecebimento(dados: {
  id: string
  parcelaId: string
  valorCentavos: number
  recebidoEm: DataCivil
  nota: string | null
}): Promise<void> {
  const { error } = await obterSupabase().rpc('registrar_recebimento', {
    p_id: dados.id,
    p_parcela_id: dados.parcelaId,
    p_valor_centavos: dados.valorCentavos,
    p_recebido_em: dados.recebidoEm,
    p_nota: aceitaNulo(dados.nota),
  })
  if (error) throw error
}

export async function estornarRecebimento(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('estornar_recebimento', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

export async function obterAReceber(
  consultoriaId: string,
): Promise<{ aReceberCentavos: number; vencidoCentavos: number }> {
  const { data, error } = await obterSupabase().rpc('a_receber_dos_orcamentos', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const linha = data[0]
  return {
    aReceberCentavos: linha?.a_receber_centavos ?? 0,
    vencidoCentavos: linha?.vencido_centavos ?? 0,
  }
}
