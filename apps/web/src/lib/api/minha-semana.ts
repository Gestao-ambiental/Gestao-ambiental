// Minha semana: os prazos da pessoa logada em todas as consultorias em que é membro ativo. A função
// não recebe consultoria: o banco usa os vínculos de auth.uid(). `dias` vem calculado no fuso de
// cada consultoria.

import type { DataCivil, ItemDaMinhaSemana } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_MINHA_SEMANA = 50

export interface ItemDaSemana extends ItemDaMinhaSemana {
  /** 'prazo' (ocorrência), 'meta', 'exigencia', 'acao_legal' e as fontes que vierem. */
  tipo: string
  dias: number
  codigo: string | null
  empreendimentoId: string | null
  empreendimentoNome: string
  unidadeNome: string
  licenca: string | null
  emConferencia: boolean
  /** Consultoria em só leitura comercial: aparece, mas marcada. */
  somenteLeitura: boolean
  /** 'ativa', 'teste', 'suspensa' ou 'arquivada'. */
  situacaoConsultoria: string
}

export interface PaginaDaMinhaSemana {
  itens: ItemDaSemana[]
  total: number
}

function anulavel<T>(valor: T | null | undefined): T | null {
  return valor ?? null
}

export async function listarMinhaSemana(
  de: DataCivil | null,
  ate: DataCivil,
  pagina: number,
): Promise<PaginaDaMinhaSemana> {
  const { data, error } = await obterSupabase().rpc('minha_semana', {
    ...(de ? { p_de: de } : {}),
    p_ate: ate,
    p_limite: TAMANHO_PAGINA_MINHA_SEMANA,
    p_deslocamento: pagina * TAMANHO_PAGINA_MINHA_SEMANA,
  })
  if (error) throw error
  return {
    total: data[0]?.total ?? 0,
    itens: data.map((linha) => ({
      data: linha.data as DataCivil,
      consultoriaId: linha.consultoria_id,
      consultoriaNome: linha.consultoria_nome,
      tipo: linha.tipo_evento,
      titulo: linha.titulo,
      id: linha.id,
      dias: linha.dias,
      codigo: anulavel(linha.codigo),
      empreendimentoId: anulavel(linha.empreendimento_id),
      empreendimentoNome: linha.empreendimento_nome,
      unidadeNome: linha.unidade_nome,
      licenca: anulavel(linha.licenca),
      emConferencia: linha.em_conferencia,
      somenteLeitura: linha.somente_leitura,
      situacaoConsultoria: linha.situacao_consultoria,
    })),
  }
}
