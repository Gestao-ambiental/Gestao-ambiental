// Central administrativa (ADM-01; ADR-0022). Só RPCs: cada uma confere no banco se quem chama é
// operador da plataforma e devolve só contagens, pessoas (nome, e-mail, papel, situação) e a
// situação da consultoria. Esconder o link no front é apresentação; quem decide é o banco.

import {
  DIAS_SEM_USO_PARA_ALERTA,
  MINUTOS_PARA_AGORA,
  ehModuloDeUso,
  type ModuloDeUso,
  type PapelMembro,
  type SituacaoMembro,
} from '@gestao-ambiental/domain'

import type { Database } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_CENTRAL = 50

export type SituacaoConsultoria = Database['public']['Enums']['situacao_consultoria']

export const SITUACOES_CONSULTORIA: readonly SituacaoConsultoria[] = [
  'teste',
  'ativa',
  'suspensa',
  'arquivada',
]

export const ROTULO_SITUACAO_CONSULTORIA: Record<SituacaoConsultoria, string> = {
  teste: 'Teste',
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  arquivada: 'Arquivada',
}

export function situacaoConsultoriaOuNula(valor: string | null): SituacaoConsultoria | null {
  return SITUACOES_CONSULTORIA.find((s) => s === valor) ?? null
}

export interface PessoaDaGestao {
  nome: string
  email: string
}

export interface NumerosDaConsultoria {
  pessoasAtivas: number
  orcamentos: number
  empreendimentos: number
  licencas: number
}

export interface ConsultoriaNaCentral extends NumerosDaConsultoria {
  id: string
  nome: string
  criadaEm: string
  fuso: string
  situacao: SituacaoConsultoria
  gestao: PessoaDaGestao[]
}

export interface ConsultoriaDaLista extends ConsultoriaNaCentral {
  /** Último registro de uso de qualquer pessoa; nulo se nunca usou. */
  ultimoUsoEm: string | null
}

export interface ConsultoriaDetalhada extends ConsultoriaNaCentral {
  situacaoMotivo: string | null
  situacaoAlteradaEm: string | null
  situacaoAlteradaPorNome: string | null
  rowVersion: number
}

export interface PessoaNaCentral {
  membroId: string
  nome: string
  email: string
  papel: PapelMembro
  situacao: SituacaoMembro
  criadoEm: string
  desligadoEm: string | null
  ultimoUsoEm: string | null
  /** Dias com uso nos últimos 30 dias (hoje incluído, fuso da consultoria). */
  diasComUso30: number
}

export interface ResumoDeUso {
  agora: number
  ultimos7Dias: number
  ultimos30Dias: number
}

export interface AlertaDeSemUso {
  id: string
  nome: string
  criadaEm: string
  fuso: string
  situacao: SituacaoConsultoria
  pessoasAtivas: number
  ultimoUsoEm: string | null
}

export interface UsoDoModulo {
  modulo: ModuloDeUso
  /** Dias com uso nos últimos 30 dias. */
  dias: number
}

export interface MudancaDeSituacao {
  id: string
  anterior: SituacaoConsultoria
  nova: SituacaoConsultoria
  motivo: string
  alteradaEm: string
  alteradaPorNome: string
}

export interface PaginaDaCentral<T> {
  itens: T[]
  total: number
}

/** Gestão como devolvida pelo banco ([{nome, email}]); qualquer outra forma vira lista vazia. */
function lerGestao(valor: unknown): PessoaDaGestao[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const { nome, email } = item as Record<string, unknown>
    return typeof nome === 'string' && typeof email === 'string' ? [{ nome, email }] : []
  })
}

/** O link da central só aparece para operador (apresentação; o banco recusa os outros). */
export async function souOperador(): Promise<boolean> {
  const { data, error } = await obterSupabase().rpc('sou_operador')
  if (error) throw error
  return data
}

export async function listarConsultoriasDaCentral(
  busca: string,
  situacao: SituacaoConsultoria | null,
  pagina: number,
): Promise<PaginaDaCentral<ConsultoriaDaLista>> {
  const { data, error } = await obterSupabase().rpc('central_listar_consultorias', {
    p_busca: busca,
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
    ...(situacao ? { p_situacao: situacao } : {}),
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      criadaEm: linha.criada_em,
      fuso: linha.fuso,
      situacao: linha.situacao,
      gestao: lerGestao(linha.gestao),
      pessoasAtivas: linha.pessoas_ativas,
      orcamentos: linha.orcamentos,
      empreendimentos: linha.empreendimentos,
      licencas: linha.licencas,
      // Nulo enquanto ninguém usou (o tipo gerado não sabe).
      ultimoUsoEm: (linha.ultimo_uso_em as string | null) ?? null,
    })),
    total: data[0]?.total ?? 0,
  }
}

/** Visão geral: consultorias com uso agora (15 min), nos últimos 7 e 30 dias. */
export async function resumoDeUso(): Promise<ResumoDeUso> {
  const { data, error } = await obterSupabase().rpc('central_resumo_de_uso', {
    p_minutos_agora: MINUTOS_PARA_AGORA,
  })
  if (error) throw error
  const linha = data[0]
  return {
    agora: linha?.agora ?? 0,
    ultimos7Dias: linha?.ultimos_7_dias ?? 0,
    ultimos30Dias: linha?.ultimos_30_dias ?? 0,
  }
}

/** Alerta "sem uso há 14 dias" (a regra está no domínio; o limiar vai como parâmetro). */
export async function listarAlertasDeSemUso(
  pagina: number,
): Promise<PaginaDaCentral<AlertaDeSemUso>> {
  const { data, error } = await obterSupabase().rpc('central_alertas_sem_uso', {
    p_dias: DIAS_SEM_USO_PARA_ALERTA,
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      criadaEm: linha.criada_em,
      fuso: linha.fuso,
      situacao: linha.situacao,
      pessoasAtivas: linha.pessoas_ativas,
      ultimoUsoEm: (linha.ultimo_uso_em as string | null) ?? null,
    })),
    total: data[0]?.total ?? 0,
  }
}

/** Dias com uso por área nos últimos 30 dias, nas quatro áreas. */
export async function listarUsoPorModulo(consultoriaId: string): Promise<UsoDoModulo[]> {
  const { data, error } = await obterSupabase().rpc('central_uso_por_modulo', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data.flatMap((linha) =>
    ehModuloDeUso(linha.modulo) ? [{ modulo: linha.modulo, dias: linha.dias }] : [],
  )
}

/** Nula quando a consultoria não existe. */
export async function detalharConsultoriaDaCentral(
  consultoriaId: string,
): Promise<ConsultoriaDetalhada | null> {
  const { data, error } = await obterSupabase().rpc('central_detalhar_consultoria', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const linha = data[0]
  if (!linha) return null
  return {
    id: linha.id,
    nome: linha.nome,
    criadaEm: linha.criada_em,
    fuso: linha.fuso,
    situacao: linha.situacao,
    // Nulos enquanto a situação nunca mudou (o tipo gerado não sabe).
    situacaoMotivo: linha.situacao_motivo,
    situacaoAlteradaEm: linha.situacao_alterada_em,
    situacaoAlteradaPorNome: linha.situacao_alterada_por_nome,
    rowVersion: linha.row_version,
    gestao: lerGestao(linha.gestao),
    pessoasAtivas: linha.pessoas_ativas,
    orcamentos: linha.orcamentos,
    empreendimentos: linha.empreendimentos,
    licencas: linha.licencas,
  }
}

export async function listarPessoasDaCentral(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDaCentral<PessoaNaCentral>> {
  const { data, error } = await obterSupabase().rpc('central_listar_pessoas', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      membroId: linha.membro_id,
      nome: linha.nome,
      email: linha.email,
      papel: linha.papel,
      situacao: linha.situacao,
      criadoEm: linha.criado_em,
      desligadoEm: (linha.desligado_em as string | null) ?? null,
      ultimoUsoEm: (linha.ultimo_uso_em as string | null) ?? null,
      diasComUso30: linha.dias_com_uso_30,
    })),
    total: data[0]?.total ?? 0,
  }
}

export async function listarHistoricoDeSituacao(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDaCentral<MudancaDeSituacao>> {
  const { data, error } = await obterSupabase().rpc('central_historico_situacao', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      anterior: linha.situacao_anterior,
      nova: linha.situacao_nova,
      motivo: linha.motivo,
      alteradaEm: linha.alterada_em,
      alteradaPorNome: linha.alterada_por_nome,
    })),
    total: data[0]?.total ?? 0,
  }
}

/**
 * Muda a situação. `chave` identifica a operação: repetir com a mesma chave (ex.: depois de uma
 * falha de rede) não duplica. Devolve a versão nova.
 */
export async function mudarSituacaoDaConsultoria(
  consultoriaId: string,
  situacao: SituacaoConsultoria,
  motivo: string,
  rowVersion: number,
  chave: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('central_mudar_situacao', {
    p_consultoria_id: consultoriaId,
    p_situacao: situacao,
    p_motivo: motivo,
    p_row_version: rowVersion,
    p_chave: chave,
  })
  if (error) throw error
  return data
}
