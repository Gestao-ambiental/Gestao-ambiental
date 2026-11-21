// Requisitos legais do empreendimento (ADR-0050, LEG-07 e LEG-08). Toda escrita passa por RPC; a
// situação de cada requisito é calculada no domínio (situacaoDoRequisito), nunca no banco.

import type { DataCivil } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_REQUISITOS = 50

export interface RequisitoLegal {
  id: string
  normaId: string
  normaTitulo: string
  normaRevogada: boolean
  dispositivo: string | null
  descricao: string | null
  origem: 'sugerido' | 'manual'
  motivo: { criterio: string; valor: string } | null
  aplicavel: boolean | null
  justificativa: string | null
  rowVersion: number
  avaliacaoResultado: 'conforme' | 'nao_conforme' | null
  avaliadaEm: DataCivil | null
  avaliadaPorNome: string | null
  ultimaMudancaPublicadaEm: string | null
  acao: {
    id: string
    descricao: string
    prazo: DataCivil
    responsavelId: string | null
    responsavelNome: string | null
    rowVersion: number
  } | null
  evidencias: number
  menorValidade: DataCivil | null
}

export interface AcaoNova {
  descricao: string
  prazo: DataCivil
  responsavelId: string | null
}

function anulavel<T>(valor: T | null | undefined): T | null {
  return valor ?? null
}

function lerMotivo(valor: unknown): RequisitoLegal['motivo'] {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null
  const { criterio, valor: v } = valor as Record<string, unknown>
  return typeof criterio === 'string' && typeof v === 'string' ? { criterio, valor: v } : null
}

function lerResultado(valor: string | null | undefined): RequisitoLegal['avaliacaoResultado'] {
  return valor === 'conforme' || valor === 'nao_conforme' ? valor : null
}

export async function listarRequisitosDoEmpreendimento(
  consultoriaId: string,
  empreendimentoId: string,
  pagina: number,
): Promise<{ itens: RequisitoLegal[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_requisitos_do_empreendimento', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
    p_limite: TAMANHO_PAGINA_REQUISITOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_REQUISITOS,
  })
  if (error) throw error
  return {
    itens: data.map((l) => ({
      id: l.id,
      normaId: l.norma_id,
      normaTitulo: l.norma_titulo,
      normaRevogada: l.norma_situacao_na_fonte === 'revogada',
      dispositivo: anulavel(l.dispositivo),
      descricao: anulavel(l.descricao),
      origem: l.origem === 'manual' ? 'manual' : 'sugerido',
      motivo: lerMotivo(l.motivo),
      aplicavel: anulavel(l.aplicavel),
      justificativa: anulavel(l.justificativa),
      rowVersion: l.row_version,
      avaliacaoResultado: lerResultado(l.avaliacao_resultado),
      avaliadaEm: anulavel(l.avaliada_em) as DataCivil | null,
      avaliadaPorNome: anulavel(l.avaliada_por_nome),
      ultimaMudancaPublicadaEm: anulavel(l.ultima_mudanca_publicada_em),
      acao: l.acao_id
        ? {
            id: l.acao_id,
            descricao: l.acao_descricao,
            prazo: l.acao_prazo as DataCivil,
            responsavelId: anulavel(l.acao_responsavel_id),
            responsavelNome: anulavel(l.acao_responsavel_nome),
            rowVersion: l.acao_row_version,
          }
        : null,
      evidencias: l.evidencias,
      menorValidade: anulavel(l.menor_validade) as DataCivil | null,
    })),
    total: data[0]?.total ?? 0,
  }
}

export async function sugerirRequisitos(
  consultoriaId: string,
  empreendimentoId: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('sugerir_requisitos', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
  })
  if (error) throw error
  return data
}

export async function adicionarRequisito(
  consultoriaId: string,
  empreendimentoId: string,
  normaId: string,
  dispositivo: string | null,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('adicionar_requisito', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
    p_norma_id: normaId,
    ...(dispositivo ? { p_dispositivo: dispositivo } : {}),
  })
  if (error) throw error
  return data
}

export async function decidirAplicabilidade(
  consultoriaId: string,
  requisito: Pick<RequisitoLegal, 'id' | 'rowVersion'>,
  aplicavel: boolean,
  justificativa: string | null,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('decidir_aplicabilidade', {
    p_consultoria_id: consultoriaId,
    p_requisito_id: requisito.id,
    p_aplicavel: aplicavel,
    p_justificativa: aceitaNulo(justificativa),
    p_row_version: requisito.rowVersion,
  })
  if (error) throw error
  return data
}

export async function avaliarRequisito(
  consultoriaId: string,
  requisito: Pick<RequisitoLegal, 'id' | 'rowVersion'>,
  resultado: 'conforme' | 'nao_conforme',
  avaliadaEm: DataCivil,
  observacao: string | null,
  acao: AcaoNova | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('avaliar_requisito', {
    p_consultoria_id: consultoriaId,
    p_requisito_id: requisito.id,
    p_resultado: resultado,
    p_avaliada_em: avaliadaEm,
    p_observacao: aceitaNulo(observacao),
    p_acao: aceitaNulo(
      acao
        ? {
            descricao: acao.descricao,
            prazo: acao.prazo,
            ...(acao.responsavelId ? { responsavel_id: acao.responsavelId } : {}),
          }
        : null,
    ),
    p_row_version: requisito.rowVersion,
  })
  if (error) throw error
}

export async function concluirAcaoLegal(
  consultoriaId: string,
  acao: { id: string; rowVersion: number },
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('concluir_acao_legal', {
    p_consultoria_id: consultoriaId,
    p_acao_id: acao.id,
    p_row_version: acao.rowVersion,
  })
  if (error) throw error
  return data
}

export async function atribuirAcaoLegal(
  consultoriaId: string,
  acaoId: string,
  membroId: string,
  rowVersion: number,
): Promise<void> {
  const { error } = await obterSupabase().rpc('atribuir_acao_legal', {
    p_consultoria_id: consultoriaId,
    p_acao_id: acaoId,
    p_responsavel_id: membroId,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/**
 * Envia o PDF como objeto novo em consultoria_id/requisito_legal/<uuid>.pdf e registra a evidência.
 * `versaoId` vem da tela: repetir depois de erro de rede devolve a mesma evidência.
 */
export async function anexarEvidencia(
  consultoriaId: string,
  requisitoId: string,
  versaoId: string,
  arquivo: File,
  validade: DataCivil | null,
): Promise<string> {
  const supabase = obterSupabase()
  const caminho = `${consultoriaId}/requisito_legal/${versaoId}.pdf`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false })
  if (envio.error && !envio.error.message.toLowerCase().includes('exists')) throw envio.error
  const { data, error } = await supabase.rpc('anexar_evidencia_ao_requisito', {
    p_consultoria_id: consultoriaId,
    p_requisito_id: requisitoId,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
    ...(validade ? { p_validade: validade } : {}),
  })
  if (error) throw error
  return data
}
