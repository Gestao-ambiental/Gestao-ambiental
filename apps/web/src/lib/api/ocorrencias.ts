// Detalhe e execução da ocorrência (épico 6). Escrita só por RPC (o banco decide quem confere,
// quem conclui e a independência); o arquivo vai direto ao Storage e vira versão pela RPC.

import type {
  DataCivil,
  SituacaoDaEvidencia,
  SituacaoGravadaDaOcorrencia,
} from '@gestao-ambiental/domain'

import { conferirPdf, type ProblemaDoPdf } from '@/lib/api/licencas'
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

export async function listarEtapas(ocorrenciaId: string): Promise<Etapa[]> {
  const { data, error } = await obterSupabase()
    .from('etapa')
    .select(
      'id, titulo, modo, responsavel_externo, meta, horas_estimadas, concluida_em, responsavel:membro!etapa_responsavel_fk(nome)',
    )
    .eq('ocorrencia_id', ocorrenciaId)
    .order('posicao')
    .range(0, 199)
  if (error) throw error
  return data.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    modo: e.modo,
    responsavelNome: e.responsavel?.nome ?? null,
    responsavelExterno: e.responsavel_externo,
    meta: e.meta as DataCivil | null,
    horas: e.horas_estimadas,
    concluida: e.concluida_em !== null,
  }))
}

export interface DadosEtapa {
  titulo: string
  modo: 'trabalho' | 'espera_externa'
  responsavelId: string | null
  responsavelExterno: string
  meta: DataCivil | null
  horas: number | null
}

/** O gerador marca todo argumento de RPC como não nulo; o banco aceita nulo. */
function aceitaNulo<T>(valor: T | null): T {
  return valor as unknown as T
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
  arquivo: { caminho: string; nome: string; tamanho: number }
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
      `id, numero, situacao, data_execucao, enviada_em, enviada_por,
       autor:membro!evidencia_enviada_por_fk(nome),
       versao:documento_versao!evidencia_versao_fk(caminho, nome_original, tamanho_bytes),
       conferencia(decisao, motivo, decidida_em, conferente:membro!conferencia_conferente_fk(nome))`,
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
      enviadaEm: e.enviada_em,
      enviadaPorId: e.enviada_por,
      enviadaPorNome: e.autor.nome,
      arquivo: {
        caminho: e.versao.caminho,
        nome: e.versao.nome_original,
        tamanho: e.versao.tamanho_bytes,
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

export const TIPOS_DE_EVIDENCIA = ['application/pdf', 'image/png', 'image/jpeg'] as const
const EXTENSOES: Record<(typeof TIPOS_DE_EVIDENCIA)[number], string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

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

async function sha256(arquivo: File): Promise<string> {
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
  const tipo = arquivo.type as (typeof TIPOS_DE_EVIDENCIA)[number]
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
  return data
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
