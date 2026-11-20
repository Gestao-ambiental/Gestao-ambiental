// Modelos de documento (ADR-0036, fatia 1): texto padrão da consultoria com campos a preencher.
// Todo membro lê; a Gestão salva e arquiva pelas RPCs (o banco recusa a Equipe).

import type { DadosParaRelatorio, NoDoDocumento } from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

/** Lista de modelos: no máximo 200 ativos por consultoria nesta tela. */
export const LIMITE_MODELOS = 200

export interface ModeloNaLista {
  id: string
  nome: string
  atualizadoEm: string
  atualizadoPorNome: string
}

export async function listarModelosDeDocumento(consultoriaId: string): Promise<ModeloNaLista[]> {
  const { data, error } = await obterSupabase()
    .from('modelo_documento')
    .select('id, nome, atualizado_em, autor:membro!modelo_documento_atualizado_por_fk(nome)')
    .eq('consultoria_id', consultoriaId)
    .is('arquivado_em', null)
    .order('nome', { ascending: true })
    .order('id', { ascending: true })
    .range(0, LIMITE_MODELOS - 1)
  if (error) throw error
  return data.map((m) => ({
    id: m.id,
    nome: m.nome,
    atualizadoEm: m.atualizado_em,
    atualizadoPorNome: m.autor.nome,
  }))
}

export interface ModeloDeDocumento {
  id: string
  nome: string
  conteudo: NoDoDocumento
  rowVersion: number
  arquivado: boolean
}

/** `null` quando não existe ou é de outra consultoria (a RLS devolve zero linhas). */
export async function obterModeloDeDocumento(id: string): Promise<ModeloDeDocumento | null> {
  const { data, error } = await obterSupabase()
    .from('modelo_documento')
    .select('id, nome, conteudo, row_version, arquivado_em')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    nome: data.nome,
    conteudo: data.conteudo as unknown as NoDoDocumento,
    rowVersion: data.row_version,
    arquivado: data.arquivado_em !== null,
  }
}

/** Cria (rowVersion nulo) ou atualiza. Devolve a versão gravada. */
export async function salvarModeloDeDocumento(dados: {
  id: string
  consultoriaId: string
  nome: string
  conteudo: NoDoDocumento
  rowVersion: number | null
}): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_modelo_documento', {
    p_id: dados.id,
    p_consultoria_id: dados.consultoriaId,
    p_nome: dados.nome,
    p_conteudo: dados.conteudo as unknown as Json,
    ...(dados.rowVersion === null ? {} : { p_row_version: dados.rowVersion }),
  })
  if (error) throw error
  return data
}

export async function arquivarModeloDeDocumento(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('arquivar_modelo_documento', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/** Dados do cadastro para preencher o modelo (dados_para_relatorio; a RLS decide o acesso). */
export async function dadosParaRelatorio(
  empreendimentoId: string,
  ocorrenciaId: string | null,
): Promise<DadosParaRelatorio> {
  const { data, error } = await obterSupabase().rpc('dados_para_relatorio', {
    p_empreendimento_id: empreendimentoId,
    ...(ocorrenciaId ? { p_ocorrencia_id: ocorrenciaId } : {}),
  })
  if (error) throw error
  return data as unknown as DadosParaRelatorio
}
