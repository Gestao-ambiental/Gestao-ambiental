import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  aplicarTema,
  lerPreferenciaTema,
  resolverTema,
  salvarPreferenciaTema,
  sistemaPrefereEscuro,
  type PreferenciaTema,
} from '@/lib/tema'

import { ContextoTema } from './contexto-tema'

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(() => lerPreferenciaTema())
  const [prefereEscuro, setPrefereEscuro] = useState(sistemaPrefereEscuro)

  // Acompanha a troca de tema do sistema enquanto a preferência for "sistema".
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = (evento: MediaQueryListEvent) => {
      setPrefereEscuro(evento.matches)
    }
    consulta.addEventListener('change', aoMudar)
    return () => {
      consulta.removeEventListener('change', aoMudar)
    }
  }, [])

  const tema = resolverTema(preferencia, prefereEscuro)

  useEffect(() => {
    aplicarTema(tema)
  }, [tema])

  const valor = useMemo(
    () => ({
      preferencia,
      tema,
      definirPreferencia: (nova: PreferenciaTema) => {
        salvarPreferenciaTema(nova)
        setPreferencia(nova)
      },
    }),
    [preferencia, tema],
  )

  return <ContextoTema value={valor}>{children}</ContextoTema>
}
