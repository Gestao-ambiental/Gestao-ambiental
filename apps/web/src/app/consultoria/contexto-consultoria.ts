import { createContext, useContext } from 'react'

import type { Vinculo } from '@/lib/api/acesso'

/** Operador navegando a consultoria como suporte (ADR-0025): só leitura, até o fim previsto. */
export interface SuporteAtual {
  acessoId: string
  modo: 'autorizado' | 'emergencia'
  fimPrevisto: string
  /** Sai do acesso (encerra no banco) e volta para a central. */
  sair: () => Promise<void>
}

export interface EstadoConsultoria {
  /**
   * Vínculo ativo escolhido. A consultoria é filtro de tela; o acesso é decidido no banco. Em modo
   * suporte é um vínculo de apresentação (papel Gestão, sem membro): o suporte lê o que a Gestão lê.
   */
  atual: Vinculo
  /** Preenchido só quando o operador navega como suporte. */
  suporte: SuporteAtual | null
  /** Operador: entra como suporte num acesso valendo (o banco registra a entrada). */
  abrirSuporte: (consultoriaId: string) => Promise<void>
  /** Todos os vínculos da pessoa (ativos e encerrados). */
  vinculos: readonly Vinculo[]
  /**
   * Troca de consultoria: limpa o cache e remonta as telas (ACC-04). Vai para `destino` (padrão: o
   * início), como na Minha semana, que abre o item na consultoria dele.
   */
  trocar: (consultoriaId: string, destino?: string) => void
}

export const ContextoConsultoria = createContext<EstadoConsultoria | null>(null)

export function useConsultoria(): EstadoConsultoria {
  const valor = useContext(ContextoConsultoria)
  if (!valor) throw new Error('useConsultoria fora de <RequerConsultoria>')
  return valor
}

// Preferência por aparelho e por conta. Só lembra a escolha; não é autoridade de nada.
const prefixo = 'grama:consultoria:'

export function lerConsultoriaPreferida(usuarioId: string): string | null {
  try {
    return window.localStorage.getItem(prefixo + usuarioId)
  } catch {
    return null
  }
}

export function gravarConsultoriaPreferida(usuarioId: string, consultoriaId: string | null): void {
  try {
    if (consultoriaId) window.localStorage.setItem(prefixo + usuarioId, consultoriaId)
    else window.localStorage.removeItem(prefixo + usuarioId)
  } catch {
    // sem armazenamento: a escolha vale só até recarregar
  }
}

// Consultoria em que o operador entrou como suporte (por aparelho e por conta). Só lembra a escolha
// feita na central: sem acesso valendo no banco, o app sai do modo suporte.
const prefixoSuporte = 'grama:suporte:'

export function lerSuporteEscolhido(usuarioId: string): string | null {
  try {
    return window.localStorage.getItem(prefixoSuporte + usuarioId)
  } catch {
    return null
  }
}

export function gravarSuporteEscolhido(usuarioId: string, consultoriaId: string | null): void {
  try {
    if (consultoriaId) window.localStorage.setItem(prefixoSuporte + usuarioId, consultoriaId)
    else window.localStorage.removeItem(prefixoSuporte + usuarioId)
  } catch {
    // sem armazenamento: o modo suporte vale só até recarregar
  }
}

export const CHAVE_MEUS_VINCULOS = 'meus-vinculos'

/** Acessos de suporte valendo em que o operador entrou. */
export const CHAVE_MEUS_ACESSOS_DE_SUPORTE = 'meus-acessos-de-suporte'

/** Histórico "Acessos do suporte" da consultoria (Equipe) e faixa de emergência da Gestão. */
export const CHAVE_ACESSOS_DE_SUPORTE = 'acessos-de-suporte'
export const CHAVE_AVISOS_DE_EMERGENCIA = 'avisos-de-emergencia'

/** Formação e gênero do vínculo atual (RequerCadastroCompleto). */
export const CHAVE_MEU_CADASTRO = 'meu-cadastro'
