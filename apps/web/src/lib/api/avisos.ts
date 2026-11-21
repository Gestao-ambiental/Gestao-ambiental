// Avisos até a pessoa (ADR-0047): o resumo diário por e-mail e o link do calendário, só da própria
// pessoa. Quem decide é o banco (RPCs security definer); aqui só a tradução para a tela.
import { FunctionsHttpError } from '@supabase/supabase-js'

import { lerAmbiente } from '@/lib/env'
import { obterSupabase } from '@/lib/supabase'

export const CHAVE_MEUS_AVISOS = 'meus-avisos'

export interface MeusAvisos {
  resumoDiario: boolean
  /** 0 enquanto a pessoa nunca mudou a preferência (sem linha = ligado). */
  rowVersion: number
  linkAtivo: boolean
  linkCriadoEm: string | null
  linkUltimoAcessoEm: string | null
}

/** Sem linha de preferência: o resumo está ligado e não há link do calendário. */
const PADRAO: MeusAvisos = {
  resumoDiario: true,
  rowVersion: 0,
  linkAtivo: false,
  linkCriadoEm: null,
  linkUltimoAcessoEm: null,
}

export async function lerMeusAvisos(consultoriaId: string): Promise<MeusAvisos> {
  const { data, error } = await obterSupabase().rpc('meus_avisos', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const linha = ((data as typeof data | null) ?? [])[0]
  if (!linha) return PADRAO
  return {
    resumoDiario: linha.resumo_diario,
    rowVersion: linha.row_version,
    linkAtivo: linha.link_ativo,
    // O gerador tipa as colunas como texto, mas sem link elas vêm nulas.
    linkCriadoEm: linha.link_criado_em,
    linkUltimoAcessoEm: linha.link_ultimo_acesso_em,
  }
}

/** Liga ou desliga o resumo diário; devolve a row_version nova. */
export async function definirResumoDiario(
  consultoriaId: string,
  ligado: boolean,
  rowVersion: number,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('definir_resumo_diario', {
    p_consultoria_id: consultoriaId,
    p_ligado: ligado,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

/** Endereço do feed (a própria Edge Function, sem passar pelo Vercel). */
export function urlDoFeed(token: string, base?: string): string {
  return `${base ?? lerAmbiente().VITE_SUPABASE_URL}/functions/v1/feed-calendario/${token}.ics`
}

/**
 * Gera um link novo (o anterior para de valer) e devolve o endereço completo. O token só existe
 * nesta resposta: o banco guarda o hash.
 */
export async function gerarLinkDoCalendario(consultoriaId: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('gerar_link_do_calendario', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return urlDoFeed(data)
}

/** Revoga o link ativo; `false` quando não havia link (idempotente). */
export async function revogarLinkDoCalendario(consultoriaId: string): Promise<boolean> {
  const { data, error } = await obterSupabase().rpc('revogar_link_do_calendario', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data
}

/** Descadastro sem login, pelo link do e-mail. Link recusado: `Error('link_invalido')`. */
export async function pararResumoPorLink(token: string): Promise<void> {
  const resposta = await obterSupabase().functions.invoke('preferencias-por-link', {
    body: { token },
  })
  const erro: unknown = resposta.error
  if (!erro) return
  if (erro instanceof FunctionsHttpError && (erro.context as Response).status === 400) {
    throw new Error('link_invalido')
  }
  throw erro instanceof Error ? erro : new Error('falha_no_descadastro')
}
