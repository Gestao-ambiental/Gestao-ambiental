import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export interface EstadoSessao {
  /** Ainda lendo a sessão guardada (ou a que veio no link do e-mail). */
  carregando: boolean
  sessao: Session | null
  /** A sessão veio de um link de recuperação de senha (evento PASSWORD_RECOVERY). */
  recuperandoSenha: boolean
  /** Falta configuração do Supabase (variáveis do front). */
  erroConfiguracao: boolean
  /** A sessão acabou sem a pessoa pedir (token expirado ou revogado em outro aparelho). */
  sessaoExpirou: boolean
  /** Motivo de uma saída forçada pelo app (ex.: acesso encerrado pela gestão), para o login. */
  avisoDeSaida: string | null
  sair: (aviso?: string) => Promise<void>
}

export const ContextoSessao = createContext<EstadoSessao | null>(null)

export function useSessao(): EstadoSessao {
  const valor = useContext(ContextoSessao)
  if (!valor) throw new Error('useSessao fora de <ProvedorSessao>')
  return valor
}

export interface UsuarioDaSessao {
  id: string
  email: string
  nome: string
}

/** Nome e e-mail da conta logada (o nome vem do cadastro, em user_metadata.nome). */
export function usuarioDaSessao(sessao: Session): UsuarioDaSessao {
  const email = sessao.user.email ?? ''
  const metadados: Record<string, unknown> = sessao.user.user_metadata
  const informado = typeof metadados.nome === 'string' ? metadados.nome.trim() : ''
  const parteLocal = email.split('@')[0] ?? ''
  const nome = informado !== '' ? informado : parteLocal !== '' ? parteLocal : email
  return { id: sessao.user.id, email, nome }
}
