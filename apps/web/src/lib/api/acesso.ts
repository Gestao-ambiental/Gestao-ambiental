// Acesso a dados do épico 2 (conta, consultoria, convite e equipe). Toda escrita é RPC; a
// autorização é do banco (RLS e checagens nas funções). Erros sobem como vieram: a tela traduz
// com lib/erros.

import type { PapelMembro, SituacaoConviteGravada, SituacaoMembro } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA = 50

export interface Vinculo {
  membroId: string
  consultoriaId: string
  consultoriaNome: string
  fuso: string
  papel: PapelMembro
  situacao: SituacaoMembro
  desligadoEm: string | null
}

export async function listarMeusVinculos(): Promise<Vinculo[]> {
  const { data, error } = await obterSupabase().rpc('meus_vinculos')
  if (error) throw error
  return data.map((linha) => ({
    membroId: linha.membro_id,
    consultoriaId: linha.consultoria_id,
    consultoriaNome: linha.consultoria_nome,
    fuso: linha.consultoria_fuso,
    papel: linha.papel,
    situacao: linha.situacao,
    desligadoEm: linha.desligado_em,
  }))
}

export async function criarConsultoria(id: string, nome: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_consultoria', {
    p_id: id,
    p_nome: nome,
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Convite
// ---------------------------------------------------------------------------

export interface ConviteRecebido {
  consultoriaNome: string
  fuso: string
  convidadoPorNome: string
  email: string
  papel: PapelMembro
  situacao: 'pendente' | 'expirado' | 'aceito' | 'cancelado'
  expiraEm: string
  contaComSenha: boolean
}

/** Convite pelo token do link. `null` se o token não corresponde a nenhum convite. */
export async function consultarConvite(token: string): Promise<ConviteRecebido | null> {
  const { data, error } = await obterSupabase().rpc('consultar_convite', { p_token: token })
  if (error) throw error
  const linha = data[0]
  if (!linha) return null
  return {
    consultoriaNome: linha.consultoria_nome,
    fuso: linha.consultoria_fuso,
    convidadoPorNome: linha.convidado_por_nome,
    email: linha.email,
    papel: linha.papel,
    situacao: linha.situacao as ConviteRecebido['situacao'],
    expiraEm: linha.expira_em,
    contaComSenha: linha.conta_com_senha,
  }
}

export async function aceitarConvite(token: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('aceitar_convite', { p_token: token })
  if (error) throw error
  return data
}

/** Endereço do convite no app. O token vai na query (o hash é usado pelo Auth para a sessão). */
export function linkDoConvite(token: string): string {
  return `${window.location.origin}/convite?token=${encodeURIComponent(token)}`
}

/**
 * Manda o e-mail do convite pelo Supabase Auth: um link de acesso que confirma o e-mail, abre a
 * sessão da pessoa convidada (em qualquer aparelho) e volta para /convite com o token. Cria a
 * conta se ainda não existir; a senha é definida na tela do convite.
 */
export async function enviarEmailDoConvite(email: string, token: string): Promise<void> {
  const { error } = await obterSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: linkDoConvite(token), shouldCreateUser: true },
  })
  if (error) throw error
}

export interface ConvitePendente {
  id: string
  email: string
  papel: PapelMembro
  situacao: SituacaoConviteGravada
  enviadoEm: string
  expiraEm: string
}

export async function listarConvitesPendentes(
  consultoriaId: string,
  pagina: number,
): Promise<{ itens: ConvitePendente[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA
  const { data, error, count } = await obterSupabase()
    .from('convite')
    .select('id, email, papel, situacao, enviado_em, expira_em', { count: 'exact' })
    .eq('consultoria_id', consultoriaId)
    .eq('situacao', 'pendente')
    .order('enviado_em', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA - 1)
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      email: linha.email,
      papel: linha.papel,
      situacao: linha.situacao,
      enviadoEm: linha.enviado_em,
      expiraEm: linha.expira_em,
    })),
    total: count ?? data.length,
  }
}

/** Cria o convite e devolve o token (uma única vez) para o link do e-mail. */
export async function criarConvite(
  consultoriaId: string,
  email: string,
  papel: PapelMembro,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_convite', {
    p_consultoria_id: consultoriaId,
    p_email: email,
    p_papel: papel,
  })
  if (error) throw error
  const token = data[0]?.token
  if (!token) throw new Error('convite sem token')
  return token
}

/** Gera token novo (o link anterior deixa de valer) e renova a validade. */
export async function reenviarConvite(conviteId: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('reenviar_convite', {
    p_convite_id: conviteId,
  })
  if (error) throw error
  return data
}

export async function cancelarConvite(conviteId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('cancelar_convite', { p_convite_id: conviteId })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

export interface Membro {
  id: string
  nome: string
  email: string
  papel: PapelMembro
  situacao: SituacaoMembro
  criadoEm: string
  desligadoEm: string | null
}

/** Membros da consultoria: ativos primeiro, depois os desligados (autoria preservada). */
export async function listarMembros(
  consultoriaId: string,
  pagina: number,
): Promise<{ itens: Membro[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA
  const { data, error, count } = await obterSupabase()
    .from('membro')
    .select('id, nome, email, papel, situacao, criado_em, desligado_em', { count: 'exact' })
    .eq('consultoria_id', consultoriaId)
    .order('situacao', { ascending: true })
    .order('nome', { ascending: true })
    .range(inicio, inicio + TAMANHO_PAGINA - 1)
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      papel: linha.papel,
      situacao: linha.situacao,
      criadoEm: linha.criado_em,
      desligadoEm: linha.desligado_em,
    })),
    total: count ?? data.length,
  }
}

export async function alterarPapel(membroId: string, papel: PapelMembro): Promise<void> {
  const { error } = await obterSupabase().rpc('alterar_papel', {
    p_membro_id: membroId,
    p_papel: papel,
  })
  if (error) throw error
}

export async function desligarMembro(membroId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('desligar_membro', { p_membro_id: membroId })
  if (error) throw error
}
