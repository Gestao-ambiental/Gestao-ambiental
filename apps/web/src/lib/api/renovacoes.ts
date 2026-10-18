// Acompanhamentos e renovação de LAO (épico 7). Leitura por funções do banco; escrita só por RPC
// (só a Gestão muda a antecedência e registra o protocolo). O comprovante vai direto ao Storage e
// vira versão imutável pela RPC.

import type { DataCivil } from '@gestao-ambiental/domain'

import { EXTENSOES, TIPOS_DE_EVIDENCIA, sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_ACOMPANHAMENTOS = 20

// O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
function anulavel<T>(valor: T): T | null {
  return valor
}

export interface Pagina<T> {
  itens: T[]
  total: number
}

// ---------------------------------------------------------------------------
// Renovações no radar
// ---------------------------------------------------------------------------

export interface Renovacao {
  instrumentoId: string
  licenca: string
  orgao: string | null
  empreendimentoId: string
  empreendimentoNome: string
  unidadeNome: string
  validade: DataCivil
  diasLimite: number
  antecedencia: number
  protocoladoEm: DataCivil | null
  protocoloNumero: string | null
  hoje: DataCivil
}

export async function listarRenovacoes(
  consultoriaId: string,
  pagina: number,
): Promise<Pagina<Renovacao>> {
  const { data, error } = await obterSupabase().rpc('listar_renovacoes', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_ACOMPANHAMENTOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_ACOMPANHAMENTOS,
  })
  if (error) throw error
  return {
    total: data[0]?.total ?? 0,
    itens: data.map((r) => ({
      instrumentoId: r.instrumento_id,
      licenca: anulavel(r.licenca) ?? 'LAO',
      orgao: anulavel(r.orgao),
      empreendimentoId: r.empreendimento_id,
      empreendimentoNome: r.empreendimento_nome,
      unidadeNome: r.unidade_nome,
      validade: r.validade as DataCivil,
      diasLimite: r.dias_limite_protocolo,
      antecedencia: r.antecedencia_dias,
      protocoladoEm: anulavel(r.protocolado_em) as DataCivil | null,
      protocoloNumero: anulavel(r.protocolo_numero),
      hoje: r.hoje as DataCivil,
    })),
  }
}

// ---------------------------------------------------------------------------
// Plano de uma LAO
// ---------------------------------------------------------------------------

export interface PlanoRenovacao extends Renovacao {
  id: string
  consultoriaId: string
  comprovante: { caminho: string; nome: string; tamanho: number } | null
  registradoPorNome: string | null
  registradoEm: string | null
  rowVersion: number
}

export async function obterPlano(instrumentoId: string): Promise<PlanoRenovacao | null> {
  const { data, error } = await obterSupabase().rpc('obter_plano_renovacao', {
    p_instrumento_id: instrumentoId,
  })
  if (error) throw error
  const p = data[0]
  if (!p) return null
  const caminho = anulavel(p.comprovante_caminho)
  return {
    id: p.id,
    consultoriaId: p.consultoria_id,
    instrumentoId: p.instrumento_id,
    licenca: anulavel(p.licenca) ?? 'LAO',
    orgao: anulavel(p.orgao),
    empreendimentoId: p.empreendimento_id,
    empreendimentoNome: p.empreendimento_nome,
    unidadeNome: p.unidade_nome,
    validade: p.validade as DataCivil,
    diasLimite: p.dias_limite_protocolo,
    antecedencia: p.antecedencia_dias,
    protocoladoEm: anulavel(p.protocolado_em) as DataCivil | null,
    protocoloNumero: anulavel(p.protocolo_numero),
    comprovante: caminho
      ? { caminho, nome: p.comprovante_nome, tamanho: p.comprovante_tamanho }
      : null,
    registradoPorNome: anulavel(p.registrado_por_nome),
    registradoEm: anulavel(p.registrado_em),
    hoje: p.hoje as DataCivil,
    rowVersion: p.row_version,
  }
}

export async function definirAntecedencia(
  planoId: string,
  dias: number,
  rowVersion: number,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('definir_antecedencia_renovacao', {
    p_plano_id: planoId,
    p_antecedencia: dias,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

export interface DadosProtocolo {
  numero: string
  data: DataCivil
  arquivo: File
}

/**
 * Envia o comprovante como objeto novo em consultoria_id/protocolo/<uuid>.<ext> e registra o
 * protocolo. `versaoId` vem da tela: repetir depois de erro de rede não duplica.
 */
export async function registrarProtocolo(
  plano: Pick<PlanoRenovacao, 'id' | 'consultoriaId' | 'rowVersion'>,
  versaoId: string,
  dados: DadosProtocolo,
): Promise<number> {
  const supabase = obterSupabase()
  const tipo = dados.arquivo.type as (typeof TIPOS_DE_EVIDENCIA)[number]
  const caminho = `${plano.consultoriaId}/protocolo/${versaoId}.${EXTENSOES[tipo]}`
  const hash = await sha256(dados.arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, dados.arquivo, { contentType: tipo, upsert: false })
  // Objeto já enviado numa tentativa anterior: segue para o registro.
  if (envio.error && !envio.error.message.toLowerCase().includes('exists')) throw envio.error
  const { data, error } = await supabase.rpc('registrar_protocolo', {
    p_plano_id: plano.id,
    p_numero: dados.numero,
    p_data: dados.data,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: dados.arquivo.name,
    p_sha256: hash,
    p_row_version: plano.rowVersion,
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Aguardando conferência
// ---------------------------------------------------------------------------

export interface AguardandoConferencia {
  ocorrenciaId: string
  codigo: string
  titulo: string
  empreendimentoNome: string
  responsavelNome: string | null
  conferenteNome: string | null
  evidenciaNumero: number
  enviadaEm: string
}

export async function listarAguardandoConferencia(
  consultoriaId: string,
  pagina: number,
): Promise<Pagina<AguardandoConferencia>> {
  const { data, error } = await obterSupabase().rpc('listar_aguardando_conferencia', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_ACOMPANHAMENTOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_ACOMPANHAMENTOS,
  })
  if (error) throw error
  return {
    total: data[0]?.total ?? 0,
    itens: data.map((a) => ({
      ocorrenciaId: a.ocorrencia_id,
      codigo: a.codigo,
      titulo: a.titulo,
      empreendimentoNome: a.empreendimento_nome,
      responsavelNome: anulavel(a.responsavel_nome),
      conferenteNome: anulavel(a.conferente_nome),
      evidenciaNumero: a.evidencia_numero,
      enviadaEm: a.enviada_em,
    })),
  }
}
