// Visão da equipe e calendário (épico 5). Leitura por RPCs security invoker: a RLS decide o que
// aparece; `dias` vem calculado do banco com hoje no fuso da consultoria.

import type { DataCivil, TipoLinhaDePrazo } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_PRAZOS = 25

export type Aba = 'todos' | 'minhas'
export type Faixa = 'atrasadas' | 'hoje' | 'proximos_7' | 'sem_responsavel'
export type Ordem =
  | 'prazo'
  | '-prazo'
  | 'demanda'
  | '-demanda'
  | 'empreendimento'
  | '-empreendimento'
  | 'licenca'
  | '-licenca'
  | 'responsavel'
  | '-responsavel'

export interface Filtros {
  aba: Aba
  responsavelId: string | null
  semResponsavel: boolean
  tipoId: string | null
  empreendimentoId: string | null
}

export interface LinhaDePrazo {
  tipo: TipoLinhaDePrazo
  id: string
  instrumentoId: string
  prazo: DataCivil
  dias: number
  codigo: string | null
  titulo: string
  empreendimentoId: string
  empreendimentoNome: string
  unidadeNome: string
  licenca: string | null
  responsavelId: string | null
  responsavelNome: string | null
  emConferencia: boolean
  rowVersion: number
}

// O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
function anulavel<T>(valor: T): T | null {
  return valor
}

function argumentosDosFiltros(consultoriaId: string, filtros: Filtros) {
  return {
    p_consultoria_id: consultoriaId,
    p_aba: filtros.aba,
    ...(filtros.responsavelId ? { p_responsavel_id: filtros.responsavelId } : {}),
    p_sem_responsavel: filtros.semResponsavel,
    ...(filtros.tipoId ? { p_tipo_id: filtros.tipoId } : {}),
    ...(filtros.empreendimentoId ? { p_empreendimento_id: filtros.empreendimentoId } : {}),
  }
}

export async function listarPrazos(
  consultoriaId: string,
  filtros: Filtros,
  faixa: Faixa | null,
  ordem: Ordem,
  pagina: number,
  tamanho = TAMANHO_PAGINA_PRAZOS,
): Promise<{ itens: LinhaDePrazo[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_prazos', {
    ...argumentosDosFiltros(consultoriaId, filtros),
    ...(faixa ? { p_faixa: faixa } : {}),
    p_ordem: ordem,
    p_limite: tamanho,
    p_deslocamento: pagina * tamanho,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      tipo: linha.tipo_linha as TipoLinhaDePrazo,
      id: linha.id,
      instrumentoId: linha.instrumento_id,
      prazo: linha.prazo as DataCivil,
      dias: linha.dias,
      codigo: anulavel(linha.codigo),
      titulo: linha.titulo,
      empreendimentoId: linha.empreendimento_id,
      empreendimentoNome: linha.empreendimento_nome,
      unidadeNome: linha.unidade_nome,
      licenca: anulavel(linha.licenca),
      responsavelId: anulavel(linha.responsavel_id),
      responsavelNome: anulavel(linha.responsavel_nome),
      emConferencia: linha.situacao_ocorrencia === 'em_conferencia',
      rowVersion: linha.row_version,
    })),
    total: data[0]?.total ?? 0,
  }
}

export interface Contadores {
  atrasadas: number
  hoje: number
  proximos7: number
  semResponsavel: number
}

export async function contarPrazos(consultoriaId: string, filtros: Filtros): Promise<Contadores> {
  const { data, error } = await obterSupabase().rpc(
    'contar_prazos',
    argumentosDosFiltros(consultoriaId, filtros),
  )
  if (error) throw error
  const linha = data[0]
  return {
    atrasadas: linha?.atrasadas ?? 0,
    hoje: linha?.hoje ?? 0,
    proximos7: linha?.proximos_7 ?? 0,
    semResponsavel: linha?.sem_responsavel ?? 0,
  }
}

export async function atribuirOcorrencia(
  ocorrenciaId: string,
  membroId: string,
  rowVersion: number,
): Promise<void> {
  const { error } = await obterSupabase().rpc('atribuir_ocorrencia', {
    p_ocorrencia_id: ocorrenciaId,
    p_membro_id: membroId,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/** Tipos de instrumento realmente cadastrados (EQ-02: nunca lista fixa). */
export async function listarTiposEmUso(
  consultoriaId: string,
): Promise<{ id: string; sigla: string }[]> {
  const { data, error } = await obterSupabase()
    .from('instrumento')
    .select('tipo:tipo_instrumento!instrumento_tipo_fk(id, sigla)')
    .eq('consultoria_id', consultoriaId)
    .not('tipo_id', 'is', null)
    .range(0, 999)
  if (error) throw error
  const porId = new Map<string, string>()
  for (const linha of data) if (linha.tipo) porId.set(linha.tipo.id, linha.tipo.sigla)
  return [...porId]
    .map(([id, sigla]) => ({ id, sigla }))
    .sort((a, b) => a.sigla.localeCompare(b.sigla))
}

// ---------------------------------------------------------------------------
// Calendário (EQ-04)
// ---------------------------------------------------------------------------

export type TipoEvento = 'prazo' | 'meta' | 'validade' | 'limite_protocolo'

export interface EventoDoCalendario {
  tipo: TipoEvento
  data: DataCivil
  id: string
  codigo: string | null
  titulo: string
  empreendimentoNome: string
  unidadeNome: string
  licenca: string | null
  responsavelNome: string | null
  semResponsavel: boolean
}

export interface FiltrosDoCalendario {
  responsavelId: string | null
  unidadeId: string | null
  semResponsavel: boolean
}

export async function listarCalendario(
  consultoriaId: string,
  de: DataCivil,
  ate: DataCivil,
  filtros: FiltrosDoCalendario,
): Promise<EventoDoCalendario[]> {
  const { data, error } = await obterSupabase().rpc('listar_calendario', {
    p_consultoria_id: consultoriaId,
    p_de: de,
    p_ate: ate,
    ...(filtros.responsavelId ? { p_responsavel_id: filtros.responsavelId } : {}),
    ...(filtros.unidadeId ? { p_unidade_id: filtros.unidadeId } : {}),
    p_sem_responsavel: filtros.semResponsavel,
  })
  if (error) throw error
  return data.map((linha) => ({
    tipo: linha.tipo_evento as TipoEvento,
    data: linha.data as DataCivil,
    id: linha.id,
    codigo: anulavel(linha.codigo),
    titulo: linha.titulo,
    empreendimentoNome: linha.empreendimento_nome,
    unidadeNome: linha.unidade_nome,
    licenca: anulavel(linha.licenca),
    responsavelNome: anulavel(linha.responsavel_nome),
    semResponsavel: linha.sem_responsavel,
  }))
}

/** Unidades da consultoria, para o filtro do calendário. */
export async function listarUnidadesDaConsultoria(
  consultoriaId: string,
): Promise<{ id: string; nome: string; empreendimentoNome: string }[]> {
  const { data, error } = await obterSupabase()
    .from('unidade')
    .select('id, nome, empreendimento:empreendimento!unidade_empreendimento_fk(nome)')
    .eq('consultoria_id', consultoriaId)
    .order('nome')
    .range(0, 499)
  if (error) throw error
  return data.map((u) => ({ id: u.id, nome: u.nome, empreendimentoNome: u.empreendimento.nome }))
}
