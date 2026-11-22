// Triagem vira orçamento (ADR-0056): Orçar e guardar os valores da modalidade.
import type { DespesaDaTaxa, Modalidade } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { obterSupabase } from '@/lib/supabase'

export async function criarOrcamentoDaTriagem(dados: {
  id: string
  consultoriaId: string
  empreendimentoId: string | null
  prospectoNome?: string
  modalidade: Modalidade
  objeto: string
  taxa: DespesaDaTaxa | null
}): Promise<{ orcamentoId: string; modeloId: string | null }> {
  const { data, error } = await obterSupabase().rpc('criar_orcamento_da_triagem', {
    p_id: dados.id,
    p_consultoria_id: dados.consultoriaId,
    p_empreendimento_id: aceitaNulo(dados.empreendimentoId),
    p_modalidade: dados.modalidade,
    p_objeto: dados.objeto,
    p_taxa: aceitaNulo(
      dados.taxa
        ? { descricao: dados.taxa.descricao, estimativa_centavos: dados.taxa.estimativaCentavos }
        : null,
    ),
    ...(dados.prospectoNome === undefined ? {} : { p_prospecto_nome: dados.prospectoNome }),
  })
  if (error) throw error
  const r = data as { orcamento_id: string; modelo_id: string | null }
  return { orcamentoId: r.orcamento_id, modeloId: r.modelo_id }
}

export async function salvarValoresDaModalidade(dados: {
  orcamentoId: string
  modeloId: string
  modalidade: Modalidade
  nome: string
}): Promise<void> {
  const { error } = await obterSupabase().rpc('salvar_valores_da_modalidade', {
    p_orcamento_id: dados.orcamentoId,
    p_modelo_id: dados.modeloId,
    p_modalidade: dados.modalidade,
    p_nome: dados.nome,
  })
  if (error) throw error
}
