import { createContext, useContext } from 'react'

import type { Vinculo } from '@/lib/api/acesso'

export interface EstadoConsultoria {
  /** Vínculo ativo escolhido. A consultoria é filtro de tela; o acesso é decidido no banco. */
  atual: Vinculo
  /** Todos os vínculos da pessoa (ativos e encerrados). */
  vinculos: readonly Vinculo[]
  /** Troca de consultoria: limpa o cache e remonta as telas (ACC-04). */
  trocar: (consultoriaId: string) => void
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

export const CHAVE_MEUS_VINCULOS = 'meus-vinculos'
