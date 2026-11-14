// Acesso de suporte (ADM-01; ADR-0025; Termos de Uso §13). Só RPCs e a Edge Function do aviso: o
// banco confere quem autoriza (Gestão de verdade), quem entra (operador com dois fatores), o prazo e
// barra toda escrita do suporte. Esconder botão no front é apresentação.

import {
  ehCategoriaDeEmergencia,
  type CategoriaDeEmergencia,
  type DuracaoDeSuporte,
} from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

import { lista, texto } from './json'

export const TAMANHO_PAGINA_SUPORTE = 50

export type ModoDeSuporte = 'autorizado' | 'emergencia'
export type Encerramento = 'gestao' | 'operador' | 'prazo'

export interface EntradaDoSuporte {
  nome: string
  instante: string
}

export interface AcessoDeSuporte {
  id: string
  modo: ModoDeSuporte
  categoria: CategoriaDeEmergencia | null
  motivo: string | null
  inicio: string
  fimPrevisto: string
  ativo: boolean
  encerradoEm: string | null
  encerramento: Encerramento | null
  encerradoPorNome: string | null
  autorizadoPorNome: string | null
  abertoPorNome: string | null
  entradas: EntradaDoSuporte[]
  avisoVistoEm: string | null
  avisoVistoPorNome: string | null
}

export interface PaginaDeAcessos {
  itens: AcessoDeSuporte[]
  total: number
}

interface LinhaDoHistorico {
  id: string
  modo: string
  categoria: string | null
  motivo: string | null
  inicio: string
  fim_previsto: string
  ativo: boolean
  encerrado_em: string | null
  encerramento: string | null
  encerrado_por_nome: string | null
  autorizado_por_nome: string | null
  aberto_por_nome: string | null
  entradas: Json
  aviso_visto_em: string | null
  aviso_visto_por_nome: string | null
  total: number
}

function encerramentoOuNulo(valor: string | null): Encerramento | null {
  return valor === 'gestao' || valor === 'operador' || valor === 'prazo' ? valor : null
}

function paraAcesso(linha: LinhaDoHistorico): AcessoDeSuporte {
  return {
    id: linha.id,
    modo: linha.modo === 'emergencia' ? 'emergencia' : 'autorizado',
    categoria: ehCategoriaDeEmergencia(linha.categoria) ? linha.categoria : null,
    motivo: linha.motivo,
    inicio: linha.inicio,
    fimPrevisto: linha.fim_previsto,
    ativo: linha.ativo,
    encerradoEm: linha.encerrado_em,
    encerramento: encerramentoOuNulo(linha.encerramento),
    encerradoPorNome: linha.encerrado_por_nome,
    autorizadoPorNome: linha.autorizado_por_nome,
    abertoPorNome: linha.aberto_por_nome,
    entradas: lista(linha.entradas).map((e) => ({
      nome: texto(e.nome),
      instante: texto(e.instante),
    })),
    avisoVistoEm: linha.aviso_visto_em,
    avisoVistoPorNome: linha.aviso_visto_por_nome,
  }
}

function paginaDe(linhas: LinhaDoHistorico[] | null): PaginaDeAcessos {
  const dados = linhas ?? []
  return { itens: dados.map(paraAcesso), total: dados[0]?.total ?? 0 }
}

/** Próxima página do histórico (50 por página). */
export function proximaPaginaDeAcessos(
  ultima: PaginaDeAcessos,
  todas: PaginaDeAcessos[],
): number | undefined {
  const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
  return ultima.itens.length === TAMANHO_PAGINA_SUPORTE && carregados < ultima.total
    ? todas.length
    : undefined
}

/** "Acessos do suporte" na Equipe (Gestão da consultoria). */
export async function listarAcessosDeSuporte(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDeAcessos> {
  const { data, error } = await obterSupabase().rpc('listar_acessos_de_suporte', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_SUPORTE,
    p_deslocamento: pagina * TAMANHO_PAGINA_SUPORTE,
  })
  if (error) throw error
  return paginaDe(data)
}

/** O mesmo histórico, na central (operador com dois fatores). */
export async function listarAcessosNaCentral(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDeAcessos> {
  const { data, error } = await obterSupabase().rpc('central_acessos_de_suporte', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_SUPORTE,
    p_deslocamento: pagina * TAMANHO_PAGINA_SUPORTE,
  })
  if (error) throw error
  return paginaDe(data)
}

/** Acesso valendo agora (o banco decide; aqui só escolhe o que mostrar). */
export function acessoValendo(
  itens: readonly AcessoDeSuporte[],
  agora: Date,
): AcessoDeSuporte | null {
  return itens.find((a) => a.ativo && new Date(a.fimPrevisto).getTime() > agora.getTime()) ?? null
}

export async function autorizarAcessoDeSuporte(
  id: string,
  consultoriaId: string,
  horas: DuracaoDeSuporte,
  motivo: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('autorizar_acesso_de_suporte', {
    p_id: id,
    p_consultoria_id: consultoriaId,
    p_horas: horas,
    p_motivo: motivo,
  })
  if (error) throw error
  return data
}

export async function encerrarAcessoDeSuporte(acessoId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('encerrar_acesso_de_suporte', {
    p_acesso_id: acessoId,
  })
  if (error) throw error
}

export interface AvisoDeEmergencia {
  id: string
  categoria: CategoriaDeEmergencia | null
  motivo: string
  inicio: string
  fimPrevisto: string
  operadorNome: string
}

/** Emergências que a Gestão ainda não marcou como vistas. */
export async function listarAvisosDeEmergencia(
  consultoriaId: string,
): Promise<AvisoDeEmergencia[]> {
  const { data, error } = await obterSupabase().rpc('avisos_de_suporte_pendentes', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((linha) => ({
    id: linha.id,
    categoria: ehCategoriaDeEmergencia(linha.categoria) ? linha.categoria : null,
    motivo: linha.motivo,
    inicio: linha.inicio,
    fimPrevisto: linha.fim_previsto,
    operadorNome: linha.operador_nome,
  }))
}

export async function marcarAvisoComoVisto(acessoId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('marcar_aviso_de_suporte_visto', {
    p_acesso_id: acessoId,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Operador
// ---------------------------------------------------------------------------

export interface AcessoDoOperador {
  acessoId: string
  consultoriaId: string
  consultoriaNome: string
  fuso: string
  modo: ModoDeSuporte
  fimPrevisto: string
}

/** Acessos valendo em que o operador entrou: o app abre a consultoria em modo suporte. */
export async function listarMeusAcessosDeSuporte(): Promise<AcessoDoOperador[]> {
  const { data, error } = await obterSupabase().rpc('meus_acessos_de_suporte')
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((linha) => ({
    acessoId: linha.acesso_id,
    consultoriaId: linha.consultoria_id,
    consultoriaNome: linha.consultoria_nome,
    fuso: linha.consultoria_fuso,
    modo: linha.modo === 'emergencia' ? 'emergencia' : 'autorizado',
    fimPrevisto: linha.fim_previsto,
  }))
}

export async function entrarComoSuporte(consultoriaId: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('entrar_como_suporte', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data
}

export async function abrirAcessoDeEmergencia(
  id: string,
  consultoriaId: string,
  categoria: CategoriaDeEmergencia,
  motivo: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('abrir_acesso_de_emergencia', {
    p_id: id,
    p_consultoria_id: consultoriaId,
    p_categoria: categoria,
    p_motivo: motivo,
  })
  if (error) throw error
  return data
}

export async function sairDoAcessoDeSuporte(consultoriaId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('sair_do_acesso_de_suporte', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
}

const MOTIVOS_DO_EMAIL: Record<string, string> = {
  configuracao_ausente: 'o envio de e-mail não está configurado',
  sem_destinatarios: 'a Gestão não tem e-mail cadastrado',
  falha_no_envio: 'o serviço de e-mail recusou o envio',
  sem_acesso_de_emergencia: 'o acesso de emergência não está valendo',
  dois_fatores_necessarios: 'a sessão precisa dos dois fatores',
  sem_permissao: 'sem permissão',
}

/** Resultado do e-mail para a Gestão: enviado, ou o motivo (frase curta) de não ter saído. */
export type ResultadoDoAviso = { enviado: true } | { enviado: false; motivo: string }

/**
 * Pede à Edge Function o e-mail de aviso da emergência para a Gestão. Nunca lança: o acesso já
 * começou e continua valendo; a tela só mostra se o e-mail não saiu.
 */
export async function avisarGestaoPorEmail(acessoId: string): Promise<ResultadoDoAviso> {
  try {
    const resposta = await obterSupabase().functions.invoke('avisar-acesso-de-suporte', {
      body: { acessoId },
    })
    const erro: unknown = resposta.error
    if (!erro) return { enviado: true }
    if (erro instanceof FunctionsHttpError) {
      const corpo = (await (erro.context as Response).json().catch(() => ({}))) as {
        erro?: string
      }
      return { enviado: false, motivo: MOTIVOS_DO_EMAIL[corpo.erro ?? ''] ?? 'erro no envio' }
    }
    return { enviado: false, motivo: 'sem conexão com o servidor' }
  } catch {
    return { enviado: false, motivo: 'sem conexão com o servidor' }
  }
}
