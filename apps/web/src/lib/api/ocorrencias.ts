// Detalhe e execução da ocorrência (épico 6; Tela 16 v2). Escrita só por RPC (o banco decide quem
// confere, quem conclui, quem cancela e a independência); os arquivos vão direto ao Storage como
// objetos novos e viram versões imutáveis pela RPC, que confere caminho, tipo e tamanho.

import type {
  DataCivil,
  SituacaoDaEvidencia,
  SituacaoGravadaDaOcorrencia,
} from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
import { obterSupabase } from '@/lib/supabase'

// O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
function anulavel<T>(valor: T): T | null {
  return valor
}

/** O gerador marca todo argumento de RPC como não nulo; o banco aceita nulo. */
function aceitaNulo<T>(valor: T | null): T {
  return valor as unknown as T
}

export interface Ocorrencia {
  id: string
  consultoriaId: string
  instrumentoId: string
  ciclo: number
  codigo: string
  titulo: string
  textoLiteral: string
  licenca: string | null
  empreendimentoId: string
  empreendimentoNome: string
  unidadeNome: string
  prazoOriginal: DataCivil
  prazoAtual: DataCivil
  metaInterna: DataCivil | null
  prazoCicloAnterior: DataCivil | null
  ocorrenciaAnteriorId: string | null
  dataReferencia: DataCivil | null
  hoje: DataCivil
  recorrencia: string
  criadoEm: string
  situacao: SituacaoGravadaDaOcorrencia
  responsavelId: string | null
  responsavelNome: string | null
  conferenteId: string | null
  conferenteNome: string | null
  concluidaEm: string | null
  concluidaPorNome: string | null
  concluidaSemEvidencia: boolean
  conferenciaIndependente: boolean
  encerramentoSolicitadoEm: string | null
  rowVersion: number
}

export async function obterOcorrencia(id: string): Promise<Ocorrencia | null> {
  const { data, error } = await obterSupabase().rpc('obter_ocorrencia', { p_id: id })
  if (error) throw error
  const o = data[0]
  if (!o) return null
  return {
    id: o.id,
    consultoriaId: o.consultoria_id,
    instrumentoId: o.instrumento_id,
    ciclo: o.ciclo,
    codigo: o.codigo,
    titulo: o.titulo,
    textoLiteral: o.texto_literal,
    licenca: anulavel(o.licenca),
    empreendimentoId: o.empreendimento_id,
    empreendimentoNome: o.empreendimento_nome,
    unidadeNome: o.unidade_nome,
    prazoOriginal: o.prazo_oficial_original as DataCivil,
    prazoAtual: o.prazo_oficial_atual as DataCivil,
    metaInterna: anulavel(o.meta_interna) as DataCivil | null,
    prazoCicloAnterior: anulavel(o.prazo_ciclo_anterior) as DataCivil | null,
    ocorrenciaAnteriorId: anulavel(o.ocorrencia_anterior_id),
    dataReferencia: anulavel(o.data_referencia) as DataCivil | null,
    hoje: o.hoje as DataCivil,
    recorrencia: o.recorrencia,
    criadoEm: o.criado_em,
    situacao: o.situacao,
    responsavelId: anulavel(o.responsavel_id),
    responsavelNome: anulavel(o.responsavel_nome),
    conferenteId: anulavel(o.conferente_id),
    conferenteNome: anulavel(o.conferente_nome),
    concluidaEm: anulavel(o.concluida_em),
    concluidaPorNome: anulavel(o.concluida_por_nome),
    concluidaSemEvidencia: o.concluida_sem_evidencia,
    conferenciaIndependente: o.conferencia_independente,
    encerramentoSolicitadoEm: anulavel(o.encerramento_solicitado_em),
    rowVersion: o.row_version,
  }
}

// ---------------------------------------------------------------------------
// Envios (evidência) e conferência
// ---------------------------------------------------------------------------

export interface ArquivoDoEnvio {
  versaoId: string
  caminho: string
  nome: string
  tamanho: number
  mime: string
}

export interface Evidencia {
  id: string
  numero: number
  situacao: SituacaoDaEvidencia
  dataExecucao: DataCivil
  observacoes: string | null
  enviadaEm: string
  enviadaPorId: string
  enviadaPorNome: string
  arquivos: ArquivoDoEnvio[]
  conferencia: {
    decisao: 'aprovada' | 'devolvida'
    motivo: string | null
    conferenteId: string
    conferenteNome: string
    em: string
  } | null
}

/** Envios da ocorrência, do mais novo para o mais antigo, com os arquivos em ordem. */
export async function listarEvidencias(ocorrenciaId: string): Promise<Evidencia[]> {
  const { data, error } = await obterSupabase()
    .from('evidencia')
    .select(
      `id, numero, situacao, data_execucao, observacoes, enviada_em, enviada_por,
       autor:membro!evidencia_enviada_por_fk(nome),
       arquivos:evidencia_arquivo!evidencia_arquivo_evidencia_fk(posicao,
         versao:documento_versao!evidencia_arquivo_versao_fk(id, caminho, nome_original, tamanho_bytes, mime)),
       conferencia(decisao, motivo, decidida_em, conferente_id, conferente:membro!conferencia_conferente_fk(nome))`,
    )
    .eq('ocorrencia_id', ocorrenciaId)
    .order('numero', { ascending: false })
    .range(0, 99)
  if (error) throw error
  return data.map((e) => {
    // Um-para-um (evidencia_id único): o PostgREST devolve objeto, o gerador de tipos diz lista.
    const conferencia = primeiro<(typeof e.conferencia)[number]>(e.conferencia)
    return {
      id: e.id,
      numero: e.numero,
      situacao: e.situacao,
      dataExecucao: e.data_execucao as DataCivil,
      observacoes: e.observacoes,
      enviadaEm: e.enviada_em,
      enviadaPorId: e.enviada_por,
      enviadaPorNome: e.autor.nome,
      arquivos: [...e.arquivos]
        .sort((a, b) => a.posicao - b.posicao)
        .map((a) => ({
          versaoId: a.versao.id,
          caminho: a.versao.caminho,
          nome: a.versao.nome_original,
          tamanho: a.versao.tamanho_bytes,
          mime: a.versao.mime,
        })),
      conferencia: conferencia
        ? {
            decisao: conferencia.decisao,
            motivo: conferencia.motivo,
            conferenteId: conferencia.conferente_id,
            conferenteNome: conferencia.conferente.nome,
            em: conferencia.decidida_em,
          }
        : null,
    }
  })
}

function primeiro<T>(valor: T[] | T | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor
}

export const TIPOS_DE_EVIDENCIA = ['application/pdf', 'image/png', 'image/jpeg'] as const
export const EXTENSOES: Record<(typeof TIPOS_DE_EVIDENCIA)[number], string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}
/** Igual ao limite da RPC: até 20 arquivos por envio. */
export const MAXIMO_DE_ARQUIVOS = 20

export type ProblemaDaEvidencia = ProblemaDoPdf | 'tipo'

/** PDF (com assinatura conferida), PNG ou JPEG, até 25 MB. */
export async function conferirArquivoDeEvidencia(
  arquivo: File,
): Promise<ProblemaDaEvidencia | null> {
  if (arquivo.type === 'application/pdf') return conferirPdf(arquivo)
  if (!(TIPOS_DE_EVIDENCIA as readonly string[]).includes(arquivo.type)) return 'tipo'
  if (arquivo.size === 0) return 'vazio'
  return arquivo.size > 25 * 1024 * 1024 ? 'grande_demais' : null
}

export async function sha256(arquivo: File): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Objeto já existe no Storage: é uma nova tentativa do mesmo envio (IDs estáveis na tela). */
function jaExiste(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const { statusCode, message } = erro as { statusCode?: unknown; message?: unknown }
  return (
    String(statusCode) === '409' || (typeof message === 'string' && /already exists/i.test(message))
  )
}

/** Arquivo novo escolhido na tela: o ID da versão nasce na escolha e vale para as novas tentativas. */
export interface ArquivoNovo {
  versaoId: string
  arquivo: File
}

interface ArquivoEnviado {
  versao_id: string
  caminho: string
  nome_original: string
  sha256: string
}

async function subirArquivo(
  consultoriaId: string,
  entidade: 'evidencia' | 'prorrogacao',
  novo: ArquivoNovo,
): Promise<ArquivoEnviado> {
  const tipo = novo.arquivo.type as (typeof TIPOS_DE_EVIDENCIA)[number]
  const caminho = `${consultoriaId}/${entidade}/${novo.versaoId}.${EXTENSOES[tipo]}`
  const [hash, envio] = await Promise.all([
    sha256(novo.arquivo),
    obterSupabase()
      .storage.from('arquivos')
      .upload(caminho, novo.arquivo, { contentType: tipo, upsert: false }),
  ])
  if (envio.error && !jaExiste(envio.error)) throw envio.error
  return { versao_id: novo.versaoId, caminho, nome_original: novo.arquivo.name, sha256: hash }
}

export interface DadosDoEnvio {
  /** Gerado na tela: repetir o envio não duplica. */
  evidenciaId: string
  dataExecucao: DataCivil
  observacoes: string
  novos: readonly ArquivoNovo[]
  /** Versões de envios anteriores desta ocorrência que seguem no envio (reenvio). */
  mantidos: readonly string[]
}

/**
 * Sobe os arquivos novos como objetos em consultoria_id/evidencia/<uuid>.<ext> e registra o envio
 * com a data real de execução e as observações. A ocorrência passa a Em conferência.
 */
export async function enviarEvidencia(
  ocorrencia: Pick<Ocorrencia, 'id' | 'consultoriaId'>,
  dados: DadosDoEnvio,
): Promise<number> {
  const enviados = await Promise.all(
    dados.novos.map((novo) => subirArquivo(ocorrencia.consultoriaId, 'evidencia', novo)),
  )
  const { data, error } = await obterSupabase().rpc('enviar_evidencia', {
    p_ocorrencia_id: ocorrencia.id,
    p_evidencia_id: dados.evidenciaId,
    p_data_execucao: dados.dataExecucao,
    p_observacoes: dados.observacoes,
    p_arquivos: enviados as unknown as Json,
    p_mantidos: [...dados.mantidos],
  })
  if (error) throw error
  return data
}

export async function cancelarEnvio(evidenciaId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('cancelar_envio', { p_evidencia_id: evidenciaId })
  if (error) throw error
}

export async function urlDoArquivo(caminho: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrl(caminho, 300)
  if (error) throw error
  return data.signedUrl
}

/** URLs assinadas (1 h) para miniaturas e carrossel, numa chamada só. */
export async function urlsDosArquivos(caminhos: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (caminhos.length === 0) return urls
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrls([...caminhos], 60 * 60)
  if (error) throw error
  for (const item of data) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}

export async function designarConferente(
  ocorrenciaId: string,
  membroId: string | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('designar_conferente', {
    p_ocorrencia_id: ocorrenciaId,
    p_membro_id: aceitaNulo(membroId),
  })
  if (error) throw error
}

export async function conferirEvidencia(
  evidenciaId: string,
  decisao: 'aprovada' | 'devolvida',
  motivo: string,
): Promise<void> {
  const { error } = await obterSupabase().rpc('conferir_evidencia', {
    p_evidencia_id: evidenciaId,
    p_decisao: decisao,
    p_motivo: motivo,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Regularizar (ocorrência atrasada)
// ---------------------------------------------------------------------------

export interface DadosDaProrrogacao {
  id: string
  numeroOficio: string
  novoPrazo: DataCivil
  oficio: ArquivoNovo
}

/** Ofício (PDF) em consultoria_id/prorrogacao/<uuid>.pdf e novo prazo oficial. */
export async function registrarProrrogacao(
  ocorrencia: Pick<Ocorrencia, 'id' | 'consultoriaId'>,
  dados: DadosDaProrrogacao,
): Promise<void> {
  const enviado = await subirArquivo(ocorrencia.consultoriaId, 'prorrogacao', dados.oficio)
  const { error } = await obterSupabase().rpc('registrar_prorrogacao', {
    p_id: dados.id,
    p_ocorrencia_id: ocorrencia.id,
    p_numero_oficio: dados.numeroOficio,
    p_novo_prazo: dados.novoPrazo,
    p_versao_id: enviado.versao_id,
    p_caminho: enviado.caminho,
    p_nome_original: enviado.nome_original,
    p_sha256: enviado.sha256,
  })
  if (error) throw error
}

export async function solicitarEncerramento(
  id: string,
  ocorrenciaId: string,
  justificativa: string,
): Promise<void> {
  const { error } = await obterSupabase().rpc('solicitar_encerramento', {
    p_id: id,
    p_ocorrencia_id: ocorrenciaId,
    p_justificativa: justificativa,
  })
  if (error) throw error
}

export async function definirMetaInterna(ocorrenciaId: string, meta: DataCivil): Promise<void> {
  const { error } = await obterSupabase().rpc('definir_meta_interna', {
    p_ocorrencia_id: ocorrenciaId,
    p_meta: meta,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Conclusão (Gestão)
// ---------------------------------------------------------------------------

export async function concluirOcorrencia(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('concluir_ocorrencia', {
    p_ocorrencia_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

export async function concluirSemEvidencia(id: string, justificativa: string, rowVersion: number) {
  const { error } = await obterSupabase().rpc('concluir_sem_evidencia', {
    p_ocorrencia_id: id,
    p_justificativa: justificativa,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

export async function reabrirOcorrencia(id: string, motivo: string, rowVersion: number) {
  const { error } = await obterSupabase().rpc('reabrir_ocorrencia', {
    p_ocorrencia_id: id,
    p_motivo: motivo,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Atividade (eventos + comentários)
// ---------------------------------------------------------------------------

export interface EventoDaAtividade {
  id: number
  tipo: string
  /** Nulo = Sistema. */
  atorId: string | null
  atorNome: string | null
  instante: string
  evidenciaNumero: number | null
  detalhe: string | null
  dados: Record<string, unknown> | null
}

/** Feed em ordem cronológica (mais antigo primeiro). Até 500 itens por ocorrência. */
export async function listarAtividade(ocorrenciaId: string): Promise<EventoDaAtividade[]> {
  const { data, error } = await obterSupabase()
    .from('ocorrencia_historico')
    .select(
      'id, tipo, instante, evidencia_numero, detalhe, dados, ator_id, ator:membro!ocorrencia_historico_ator_fk(nome)',
    )
    .eq('ocorrencia_id', ocorrenciaId)
    .order('id', { ascending: true })
    .range(0, 499)
  if (error) throw error
  return data.map((h) => ({
    id: h.id,
    tipo: h.tipo,
    atorId: h.ator_id,
    atorNome: h.ator?.nome ?? null,
    instante: h.instante,
    evidenciaNumero: h.evidencia_numero,
    detalhe: h.detalhe,
    dados:
      typeof h.dados === 'object' && h.dados !== null && !Array.isArray(h.dados)
        ? (h.dados as Record<string, unknown>)
        : null,
  }))
}

/** Comentário com menções. `chave` vem da tela: repetir não duplica. */
export async function comentar(
  chave: string,
  ocorrenciaId: string,
  texto: string,
  mencoes: readonly string[],
): Promise<void> {
  const { error } = await obterSupabase().rpc('comentar_ocorrencia', {
    p_chave: chave,
    p_ocorrencia_id: ocorrenciaId,
    p_texto: texto,
    p_mencoes: [...mencoes],
  })
  if (error) throw error
}
