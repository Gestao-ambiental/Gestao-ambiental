// Relatório escrito no Grama (ADR-0040): nasce de um modelo já preenchido, é editado no editor dos
// modelos, guarda versões e passa pela revisão. As RPCs decidem quem edita, envia, devolve e aprova;
// a tela só mostra as ações que fazem sentido.
import type { DataCivil, NoDoDocumento } from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

import { aceitaNulo } from './nulo'
import { MIME_DOCX, sha256 } from './ocorrencias'

export type SituacaoDoRelatorio = 'rascunho' | 'em_revisao' | 'devolvido' | 'aprovado'

export const ROTULO_DA_SITUACAO: Record<SituacaoDoRelatorio, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  devolvido: 'Devolvido',
  aprovado: 'Aprovado',
}

export interface RelatorioNaLista {
  id: string
  titulo: string
  situacao: SituacaoDoRelatorio
  versao: number
  atualizadoEm: string
  autorNome: string
}

export interface Relatorio extends RelatorioNaLista {
  consultoriaId: string
  empreendimentoId: string
  empreendimentoNome: string
  ocorrenciaId: string | null
  conteudo: NoDoDocumento
  rowVersion: number
  autorId: string
  revisorNome: string | null
  motivoDevolucao: string | null
  /** Evidência da ocorrência criada ao aprovar. */
  evidenciaId: string | null
}

function situacao(valor: string): SituacaoDoRelatorio {
  return valor === 'em_revisao' || valor === 'devolvido' || valor === 'aprovado'
    ? valor
    : 'rascunho'
}

/** Relatórios da ocorrência ou do empreendimento, os mais recentes primeiro (até 50). */
export async function listarRelatorios(filtro: {
  ocorrenciaId?: string
  empreendimentoId?: string
}): Promise<RelatorioNaLista[]> {
  let consulta = obterSupabase()
    .from('relatorio')
    .select('id, titulo, situacao, versao, atualizado_em, autor:membro!relatorio_autor_fk(nome)')
  if (filtro.ocorrenciaId) consulta = consulta.eq('ocorrencia_id', filtro.ocorrenciaId)
  if (filtro.empreendimentoId) consulta = consulta.eq('empreendimento_id', filtro.empreendimentoId)
  const { data, error } = await consulta
    .order('atualizado_em', { ascending: false })
    .order('id', { ascending: true })
    .range(0, 49)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    situacao: situacao(r.situacao),
    versao: r.versao,
    atualizadoEm: r.atualizado_em,
    autorNome: r.autor.nome,
  }))
}

/** `null` quando não existe ou é de outra consultoria (a RLS devolve zero linhas). */
export async function obterRelatorio(id: string): Promise<Relatorio | null> {
  const { data, error } = await obterSupabase()
    .from('relatorio')
    .select(
      `id, consultoria_id, empreendimento_id, ocorrencia_id, titulo, conteudo, situacao, versao,
       row_version, atualizado_em, autor_id, motivo_devolucao, evidencia_id,
       empreendimento:empreendimento!relatorio_empreendimento_fk(nome),
       autor:membro!relatorio_autor_fk(nome),
       revisor:membro!relatorio_revisor_fk(nome)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    consultoriaId: data.consultoria_id,
    empreendimentoId: data.empreendimento_id,
    empreendimentoNome: data.empreendimento.nome,
    ocorrenciaId: data.ocorrencia_id,
    titulo: data.titulo,
    conteudo: data.conteudo as unknown as NoDoDocumento,
    situacao: situacao(data.situacao),
    versao: data.versao,
    rowVersion: data.row_version,
    atualizadoEm: data.atualizado_em,
    autorId: data.autor_id,
    autorNome: data.autor.nome,
    revisorNome: data.revisor?.nome ?? null,
    motivoDevolucao: data.motivo_devolucao,
    evidenciaId: data.evidencia_id,
  }
}

export interface PermissoesDoRelatorio {
  podeEditar: boolean
  podeRevisar: boolean
}

export async function permissoesDoRelatorio(id: string): Promise<PermissoesDoRelatorio> {
  const { data, error } = await obterSupabase().rpc('permissoes_do_relatorio', { p_id: id })
  if (error) throw error
  const linha = data[0]
  return { podeEditar: linha?.pode_editar ?? false, podeRevisar: linha?.pode_revisar ?? false }
}

/** Cria com o id gerado na tela (repetir não duplica). Devolve o row_version. */
export async function criarRelatorio(dados: {
  id: string
  empreendimentoId: string
  ocorrenciaId: string | null
  modeloId: string | null
  titulo: string
  conteudo: NoDoDocumento
}): Promise<number> {
  const { data, error } = await obterSupabase().rpc('criar_relatorio', {
    p_id: dados.id,
    p_empreendimento_id: dados.empreendimentoId,
    p_ocorrencia_id: aceitaNulo(dados.ocorrenciaId),
    p_modelo_id: aceitaNulo(dados.modeloId),
    p_titulo: dados.titulo,
    p_conteudo: dados.conteudo as unknown as Json,
  })
  if (error) throw error
  return data
}

/** Salva (versão nova só quando mudou). Devolve o row_version gravado. */
export async function salvarRelatorio(
  id: string,
  titulo: string,
  conteudo: NoDoDocumento,
  rowVersion: number,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_relatorio', {
    p_id: id,
    p_titulo: titulo,
    p_conteudo: conteudo as unknown as Json,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

export async function enviarRelatorio(id: string, rowVersion: number): Promise<number> {
  const { data, error } = await obterSupabase().rpc('enviar_relatorio', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

export async function devolverRelatorio(
  id: string,
  motivo: string,
  rowVersion: number,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('devolver_relatorio', {
    p_id: id,
    p_motivo: motivo,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

/** O .docx da versão aprovada e a data real de execução (só quando há ocorrência). */
export interface EvidenciaDoRelatorio {
  consultoriaId: string
  arquivo: Blob
  nomeOriginal: string
  dataExecucao: DataCivil
}

/**
 * Aprova. Com ocorrência, o .docx vai antes ao Storage como objeto novo e o banco registra, na mesma
 * transação da aprovação, a evidência da ocorrência (ADR-0040). Se a aprovação falhar, o objeto
 * enviado fica sem uso, como qualquer envio interrompido.
 */
export async function aprovarRelatorio(
  id: string,
  rowVersion: number,
  evidencia: EvidenciaDoRelatorio | null,
): Promise<number> {
  const supabase = obterSupabase()
  if (!evidencia) {
    const { data, error } = await supabase.rpc('aprovar_relatorio', {
      p_id: id,
      p_row_version: rowVersion,
    })
    if (error) throw error
    return data
  }
  const versaoId = crypto.randomUUID()
  const caminho = `${evidencia.consultoriaId}/evidencia/${versaoId}.docx`
  const arquivo = new File([evidencia.arquivo], evidencia.nomeOriginal, { type: MIME_DOCX })
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: MIME_DOCX, upsert: false })
  if (envio.error) throw envio.error
  const { data, error } = await supabase.rpc('aprovar_relatorio', {
    p_id: id,
    p_row_version: rowVersion,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: evidencia.nomeOriginal,
    p_sha256: hash,
    p_data_execucao: evidencia.dataExecucao,
  })
  if (error) throw error
  return data
}
