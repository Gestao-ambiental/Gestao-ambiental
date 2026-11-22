// Detalhe e execução da ocorrência (épico 6). Escrita só por RPC (o banco decide quem confere,
// quem conclui e a independência); o arquivo vai direto ao Storage e vira versão pela RPC.

import {
  LIMITE_DE_ETAPAS,
  type DataCivil,
  type SituacaoDaEvidencia,
  type SituacaoGravadaDaOcorrencia,
} from '@gestao-ambiental/domain'

import { FunctionsHttpError } from '@supabase/supabase-js'

import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
import { aceitaNulo } from '@/lib/api/nulo'
import { obterSupabase } from '@/lib/supabase'

// O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
function anulavel<T>(valor: T): T | null {
  return valor
}

export interface Ocorrencia {
  id: string
  consultoriaId: string
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
  dataReferencia: DataCivil | null
  hoje: DataCivil
  situacao: SituacaoGravadaDaOcorrencia
  responsavelNome: string | null
  conferenteId: string | null
  conferenteNome: string | null
  concluidaEm: string | null
  concluidaPorNome: string | null
  concluidaSemEvidencia: boolean
  conferenciaIndependente: boolean
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
    dataReferencia: anulavel(o.data_referencia) as DataCivil | null,
    hoje: o.hoje as DataCivil,
    situacao: o.situacao,
    responsavelNome: anulavel(o.responsavel_nome),
    conferenteId: anulavel(o.conferente_id),
    conferenteNome: anulavel(o.conferente_nome),
    concluidaEm: anulavel(o.concluida_em),
    concluidaPorNome: anulavel(o.concluida_por_nome),
    concluidaSemEvidencia: o.concluida_sem_evidencia,
    conferenciaIndependente: o.conferencia_independente,
    rowVersion: o.row_version,
  }
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

export interface Etapa {
  id: string
  titulo: string
  modo: 'trabalho' | 'espera_externa'
  responsavelNome: string | null
  responsavelExterno: string | null
  meta: DataCivil | null
  horas: number | null
  concluida: boolean
}

/**
 * Todas as etapas, em páginas de LIMITE_DE_ETAPAS (ADR-0059). O banco recusa a 201ª; as
 * ocorrências antigas com mais etapas continuam vendo todas.
 */
export async function listarEtapas(ocorrenciaId: string): Promise<Etapa[]> {
  const etapas: Etapa[] = []
  for (let de = 0; ; de += LIMITE_DE_ETAPAS) {
    const { data, error } = await obterSupabase()
      .from('etapa')
      .select(
        'id, titulo, modo, responsavel_externo, meta, horas_estimadas, concluida_em, responsavel:membro!etapa_responsavel_fk(nome)',
      )
      .eq('ocorrencia_id', ocorrenciaId)
      .order('posicao')
      .order('id')
      .range(de, de + LIMITE_DE_ETAPAS - 1)
    if (error) throw error
    for (const e of data) {
      etapas.push({
        id: e.id,
        titulo: e.titulo,
        modo: e.modo,
        responsavelNome: e.responsavel?.nome ?? null,
        responsavelExterno: e.responsavel_externo,
        meta: e.meta as DataCivil | null,
        horas: e.horas_estimadas,
        concluida: e.concluida_em !== null,
      })
    }
    if (data.length < LIMITE_DE_ETAPAS) return etapas
  }
}

export interface DadosEtapa {
  titulo: string
  modo: 'trabalho' | 'espera_externa'
  responsavelId: string | null
  responsavelExterno: string
  meta: DataCivil | null
  horas: number | null
}

export async function criarEtapa(
  id: string,
  ocorrenciaId: string,
  dados: DadosEtapa,
): Promise<void> {
  const { error } = await obterSupabase().rpc('criar_etapa', {
    p_id: id,
    p_ocorrencia_id: ocorrenciaId,
    p_titulo: dados.titulo,
    p_modo: dados.modo,
    p_responsavel_id: aceitaNulo(dados.responsavelId),
    p_responsavel_externo: dados.responsavelExterno,
    p_meta: aceitaNulo(dados.meta),
    p_horas: aceitaNulo(dados.horas),
  })
  if (error) throw error
}

export async function concluirEtapa(etapaId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('concluir_etapa', { p_etapa_id: etapaId })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Evidência e conferência
// ---------------------------------------------------------------------------

export interface Evidencia {
  id: string
  numero: number
  situacao: SituacaoDaEvidencia
  dataExecucao: DataCivil
  enviadaEm: string
  enviadaPorId: string
  enviadaPorNome: string
  versaoId: string
  arquivo: {
    caminho: string
    nome: string
    tamanho: number
    mime: string
    sha256: string
    /** Hash recalculado no servidor: true confere, false diverge, null ainda não conferido. */
    confere: boolean | null
  }
  conferencia: {
    decisao: 'aprovada' | 'devolvida'
    motivo: string | null
    conferenteNome: string
    em: string
  } | null
}

export async function listarEvidencias(ocorrenciaId: string): Promise<Evidencia[]> {
  const { data, error } = await obterSupabase()
    .from('evidencia')
    .select(
      `id, numero, situacao, data_execucao, enviada_em, enviada_por, documento_versao_id,
       autor:membro!evidencia_enviada_por_fk(nome),
       versao:documento_versao!evidencia_versao_fk(caminho, nome_original, tamanho_bytes, mime, sha256,
         conferencia_de_arquivo(confere)),
       conferencia(decisao, motivo, decidida_em, conferente:membro!conferencia_conferente_fk(nome))`,
    )
    .eq('ocorrencia_id', ocorrenciaId)
    .order('numero', { ascending: false })
    .range(0, 99)
  if (error) throw error
  return data.map((e) => {
    // Um-para-um (evidencia_id único): o PostgREST devolve objeto, o gerador de tipos diz lista.
    const conferencia = primeiro<(typeof e.conferencia)[number]>(e.conferencia)
    // Também um-para-um (uma conferência por versão).
    const arquivoConferido = primeiro<(typeof e.versao.conferencia_de_arquivo)[number]>(
      e.versao.conferencia_de_arquivo,
    )
    return {
      id: e.id,
      numero: e.numero,
      situacao: e.situacao,
      dataExecucao: e.data_execucao as DataCivil,
      enviadaEm: e.enviada_em,
      enviadaPorId: e.enviada_por,
      enviadaPorNome: e.autor.nome,
      versaoId: e.documento_versao_id,
      arquivo: {
        caminho: e.versao.caminho,
        nome: e.versao.nome_original,
        tamanho: e.versao.tamanho_bytes,
        mime: e.versao.mime,
        sha256: e.versao.sha256,
        confere: arquivoConferido?.confere ?? null,
      },
      conferencia: conferencia
        ? {
            decisao: conferencia.decisao,
            motivo: conferencia.motivo,
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

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const TIPOS_DE_EVIDENCIA = ['application/pdf', 'image/png', 'image/jpeg', MIME_DOCX] as const
export type TipoDeEvidencia = (typeof TIPOS_DE_EVIDENCIA)[number]
export const EXTENSOES: Record<TipoDeEvidencia, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  [MIME_DOCX]: 'docx',
}

/** Tipos que têm texto para a conferência por IA (ADR-0036). */
export function temTextoParaConferir(mime: string): boolean {
  return mime === 'application/pdf' || mime === MIME_DOCX
}

/** Tipo do arquivo; o .docx às vezes chega sem tipo do navegador, então vale a extensão. */
export function tipoDaEvidencia(arquivo: File): TipoDeEvidencia | null {
  if ((TIPOS_DE_EVIDENCIA as readonly string[]).includes(arquivo.type))
    return arquivo.type as TipoDeEvidencia
  if (
    /\.docx$/i.test(arquivo.name) &&
    ['', 'application/octet-stream', 'application/zip'].includes(arquivo.type)
  )
    return MIME_DOCX
  return null
}

export type ProblemaDaEvidencia = ProblemaDoPdf | 'tipo' | 'nao_docx'

/**
 * PDF (com assinatura conferida), PNG, JPEG ou DOCX (zip conferido), até 25 MB. O comprovante de
 * protocolo não aceita DOCX (docx: false).
 */
export async function conferirArquivoDeEvidencia(
  arquivo: File,
  { docx = true }: { docx?: boolean } = {},
): Promise<ProblemaDaEvidencia | null> {
  const tipo = tipoDaEvidencia(arquivo)
  if (tipo === 'application/pdf') return conferirPdf(arquivo)
  if (!tipo || (tipo === MIME_DOCX && !docx)) return 'tipo'
  if (arquivo.size === 0) return 'vazio'
  if (arquivo.size > 25 * 1024 * 1024) return 'grande_demais'
  if (tipo === MIME_DOCX) {
    const inicio = new Uint8Array(await arquivo.slice(0, 4).arrayBuffer())
    const assinatura = [0x50, 0x4b, 0x03, 0x04]
    if (assinatura.some((byte, i) => inicio[i] !== byte)) return 'nao_docx'
  }
  return null
}

export async function sha256(arquivo: File): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Envia o arquivo como objeto novo em consultoria_id/evidencia/<uuid>.<ext> e registra a evidência
 * com a data real de execução. `evidenciaId` vem da tela: repetir não duplica.
 */
export async function enviarEvidencia(
  ocorrencia: Pick<Ocorrencia, 'id' | 'consultoriaId'>,
  evidenciaId: string,
  arquivo: File,
  dataExecucao: DataCivil,
): Promise<number> {
  const supabase = obterSupabase()
  const tipo = tipoDaEvidencia(arquivo)
  if (!tipo) throw new Error('arquivo_tipo_invalido')
  const versaoId = crypto.randomUUID()
  const caminho = `${ocorrencia.consultoriaId}/evidencia/${versaoId}.${EXTENSOES[tipo]}`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: tipo, upsert: false })
  if (envio.error) throw envio.error
  const { data, error } = await supabase.rpc('enviar_evidencia', {
    p_ocorrencia_id: ocorrencia.id,
    p_evidencia_id: evidenciaId,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
    p_data_execucao: dataExecucao,
  })
  if (error) throw error
  // Conferência do hash no servidor logo depois do envio. Se falhar (sinal fraco, função fora), a
  // evidência fica registrada mesmo assim e a conferência roda de novo na hora de aprovar.
  await conferirArquivo(versaoId).catch(() => null)
  return data
}

/**
 * Pede ao servidor (Edge Function conferir-arquivo) para recalcular o SHA-256 do objeto guardado e
 * comparar com o declarado no envio. Repetir devolve o resultado já gravado.
 */
export async function conferirArquivo(
  versaoId: string,
): Promise<{ confere: boolean; sha256: string }> {
  const resposta = await obterSupabase().functions.invoke('conferir-arquivo', {
    body: { versaoId },
  })
  const error: unknown = resposta.error
  if (!error) return resposta.data as { confere: boolean; sha256: string }
  if (error instanceof FunctionsHttpError) {
    const corpo = (await (error.context as Response).json().catch(() => ({}))) as {
      erro?: string
    }
    throw new Error(corpo.erro ?? 'erro_interno')
  }
  throw new Error('arquivo_nao_conferido')
}

/** Aprova só depois de o servidor confirmar que o arquivo guardado é o enviado. */
export async function aprovarEvidencia(evidencia: Pick<Evidencia, 'id' | 'versaoId'>) {
  const { confere } = await conferirArquivo(evidencia.versaoId)
  if (!confere) throw new Error('arquivo_divergente')
  await conferirEvidencia(evidencia.id, 'aprovada', '')
}

export interface EvidenciaAprovada {
  evidenciaId: string
  numero: number
  versaoId: string
  caminho: string
  nomeOriginal: string
  sha256: string
  arquivoConfere: boolean | null
  dataExecucao: DataCivil
  enviadaPorNome: string
  enviadaEm: string
  conferenteNome: string | null
  conferidaEm: string | null
  concluidaPorNome: string | null
  concluidaEm: string | null
}

/** A versão que vale: a ligada à conclusão ou, antes de concluir, a última se aprovada. */
export async function obterEvidenciaAprovada(
  ocorrenciaId: string,
): Promise<EvidenciaAprovada | null> {
  const { data, error } = await obterSupabase().rpc('obter_evidencia_aprovada', {
    p_ocorrencia_id: ocorrenciaId,
  })
  if (error) throw error
  const e = data[0]
  if (!e) return null
  return {
    evidenciaId: e.evidencia_id,
    numero: e.numero,
    versaoId: e.versao_id,
    caminho: e.caminho,
    nomeOriginal: e.nome_original,
    sha256: e.sha256,
    arquivoConfere: anulavel(e.arquivo_confere),
    dataExecucao: e.data_execucao as DataCivil,
    enviadaPorNome: e.enviada_por_nome,
    enviadaEm: e.enviada_em,
    conferenteNome: anulavel(e.conferente_nome),
    conferidaEm: anulavel(e.conferida_em),
    concluidaPorNome: anulavel(e.concluida_por_nome),
    concluidaEm: anulavel(e.concluida_em),
  }
}

export async function urlDoArquivo(caminho: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrl(caminho, 300)
  if (error) throw error
  return data.signedUrl
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
// Conclusão
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
// Histórico
// ---------------------------------------------------------------------------

export interface EventoDoHistorico {
  id: number
  tipo: string
  atorNome: string | null
  instante: string
  evidenciaNumero: number | null
  detalhe: string | null
}

export async function listarHistorico(ocorrenciaId: string): Promise<EventoDoHistorico[]> {
  const { data, error } = await obterSupabase()
    .from('ocorrencia_historico')
    .select(
      'id, tipo, instante, evidencia_numero, detalhe, ator:membro!ocorrencia_historico_ator_fk(nome)',
    )
    .eq('ocorrencia_id', ocorrenciaId)
    .order('id', { ascending: false })
    .range(0, 99)
  if (error) throw error
  return data.map((h) => ({
    id: h.id,
    tipo: h.tipo,
    atorNome: h.ator?.nome ?? null,
    instante: h.instante,
    evidenciaNumero: h.evidencia_numero,
    detalhe: h.detalhe,
  }))
}

// ---------------------------------------------------------------------------
// Auditoria (só Gestão)
// ---------------------------------------------------------------------------

export const ITENS_POR_PAGINA_DA_AUDITORIA = 50

export interface RegistroDeAuditoria {
  id: number
  instante: string
  entidade: string
  acao: 'insert' | 'update' | 'delete'
  atorNome: string | null
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  motivo: string | null
}

export async function listarAuditoriaDaOcorrencia(
  ocorrenciaId: string,
  pagina: number,
): Promise<{ registros: RegistroDeAuditoria[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_auditoria_da_ocorrencia', {
    p_ocorrencia_id: ocorrenciaId,
    p_limite: ITENS_POR_PAGINA_DA_AUDITORIA,
    p_deslocamento: pagina * ITENS_POR_PAGINA_DA_AUDITORIA,
  })
  if (error) throw error
  return {
    total: data[0]?.total ?? 0,
    registros: data.map((a) => ({
      id: a.id,
      instante: a.instante,
      entidade: a.entidade,
      acao: a.acao,
      atorNome: anulavel(a.ator_nome),
      antes: anulavel(a.antes) as Record<string, unknown> | null,
      depois: anulavel(a.depois) as Record<string, unknown> | null,
      motivo: anulavel(a.motivo),
    })),
  }
}
