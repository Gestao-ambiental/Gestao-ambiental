import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useSessao } from '@/app/sessao/contexto-sessao'

import {
  CHAVE_BLOQUEIO,
  ContextoBloqueio,
  ehAtalhoDeBloqueio,
  gravarBloqueio,
  lerBloqueio,
} from './contexto-bloqueio'
import { TelaBloqueada } from './TelaBloqueada'

/**
 * Bloquear tela (ACC-05): esconde o conteúdo sem sair nem trocar de pessoa. Nada é desmontado
 * (rota, formulários e modais abertos continuam como estavam); a tela bloqueada fica por cima e
 * só sai com a senha da mesma conta. Sessão revogada leva ao login pelo caminho normal.
 */
export function ProvedorBloqueio({ children }: { children: ReactNode }) {
  const { sessao } = useSessao()
  const usuarioId = sessao?.user.id ?? ''
  const [bloqueadaPor, setBloqueadaPor] = useState<string | null>(lerBloqueio)
  const bloqueada = usuarioId !== '' && bloqueadaPor === usuarioId

  const bloquear = useCallback(() => {
    if (!usuarioId) return
    gravarBloqueio(usuarioId)
    setBloqueadaPor(usuarioId)
  }, [usuarioId])

  const desbloquear = useCallback(() => {
    gravarBloqueio(null)
    setBloqueadaPor(null)
  }, [])

  // Outras abas bloqueiam e desbloqueiam junto.
  useEffect(() => {
    function aoMudarArmazenamento(evento: StorageEvent) {
      if (evento.key === CHAVE_BLOQUEIO || evento.key === null) setBloqueadaPor(lerBloqueio())
    }
    window.addEventListener('storage', aoMudarArmazenamento)
    return () => {
      window.removeEventListener('storage', aoMudarArmazenamento)
    }
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (!ehAtalhoDeBloqueio(evento)) return
      evento.preventDefault()
      bloquear()
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => {
      window.removeEventListener('keydown', aoTeclar, true)
    }
  }, [bloquear])

  // O título da aba também some (ele cita licença, ocorrência…).
  useEffect(() => {
    if (!bloqueada) return
    const anterior = document.title
    document.title = 'Tela bloqueada · Grama'
    return () => {
      document.title = anterior
    }
  }, [bloqueada])

  const valor = useMemo(
    () => ({ bloqueada, bloquear, desbloquear }),
    [bloqueada, bloquear, desbloquear],
  )

  return (
    <ContextoBloqueio.Provider value={valor}>
      {children}
      {bloqueada && sessao ? <TelaBloqueada sessao={sessao} aoDesbloquear={desbloquear} /> : null}
    </ContextoBloqueio.Provider>
  )
}
