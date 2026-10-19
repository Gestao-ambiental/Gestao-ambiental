import { createContext, useContext } from 'react'

export interface EstadoBloqueio {
  bloqueada: boolean
  bloquear: () => void
  /** Chamado depois de a senha ser conferida. */
  desbloquear: () => void
}

export const ContextoBloqueio = createContext<EstadoBloqueio | null>(null)

export function useBloqueio(): EstadoBloqueio {
  const valor = useContext(ContextoBloqueio)
  if (!valor) throw new Error('useBloqueio fora de <ProvedorBloqueio>')
  return valor
}

// O bloqueio fica no navegador (todas as abas): recarregar ou abrir outra aba não fura. Guarda só
// o id da conta bloqueada; nada de conteúdo.
export const CHAVE_BLOQUEIO = 'gestao-ambiental.tela-bloqueada'

export function lerBloqueio(): string | null {
  try {
    return localStorage.getItem(CHAVE_BLOQUEIO)
  } catch {
    return null
  }
}

export function gravarBloqueio(usuarioId: string | null): void {
  try {
    if (usuarioId) localStorage.setItem(CHAVE_BLOQUEIO, usuarioId)
    else localStorage.removeItem(CHAVE_BLOQUEIO)
  } catch {
    // Armazenamento indisponível: o bloqueio vale só enquanto a página estiver aberta.
  }
}

/** Ctrl+Shift+L (Cmd+Shift+L no Mac): funciona até com um modal aberto. */
export function ehAtalhoDeBloqueio(evento: KeyboardEvent): boolean {
  return (evento.ctrlKey || evento.metaKey) && evento.shiftKey && evento.key.toLowerCase() === 'l'
}
