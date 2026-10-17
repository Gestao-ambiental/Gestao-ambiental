import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { obterSupabase } from '@/lib/supabase'

import { ContextoSessao, type EstadoSessao } from './contexto-sessao'

/**
 * Sessão do Supabase Auth para o app inteiro. Ouve login, logout, renovação e o retorno dos
 * links de e-mail. Sair limpa todo o cache de consultas: nada da conta anterior fica na tela.
 */
export function ProvedorSessao({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [configurado] = useState(() => {
    try {
      obterSupabase()
      return true
    } catch {
      return false
    }
  })
  const [estado, setEstado] = useState<Omit<EstadoSessao, 'sair'>>({
    carregando: configurado,
    sessao: null,
    recuperandoSenha: false,
    erroConfiguracao: !configurado,
    sessaoExpirou: false,
    avisoDeSaida: null,
  })
  // Saída pedida pela pessoa (botão Sair) não é "sessão expirada".
  const saidaPedida = useRef(false)

  useEffect(() => {
    if (!configurado) return
    const supabase = obterSupabase()
    let ativo = true
    void supabase.auth.getSession().then(({ data }) => {
      if (ativo) setEstado((anterior) => ({ ...anterior, carregando: false, sessao: data.session }))
    })
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      const expirou = evento === 'SIGNED_OUT' && !saidaPedida.current
      if (evento === 'SIGNED_OUT') saidaPedida.current = false
      setEstado((anterior) => ({
        ...anterior,
        carregando: false,
        sessao,
        recuperandoSenha: evento === 'PASSWORD_RECOVERY' ? true : anterior.recuperandoSenha,
        sessaoExpirou: evento === 'SIGNED_IN' ? false : expirou || anterior.sessaoExpirou,
        avisoDeSaida: evento === 'SIGNED_IN' ? null : anterior.avisoDeSaida,
      }))
      if (evento === 'SIGNED_OUT') queryClient.clear()
    })
    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [configurado, queryClient])

  const sair = useCallback(
    async (aviso?: string) => {
      saidaPedida.current = true
      setEstado((anterior) => ({ ...anterior, avisoDeSaida: aviso ?? null }))
      await obterSupabase().auth.signOut({ scope: 'local' })
      queryClient.clear()
    },
    [queryClient],
  )

  const valor = useMemo(() => ({ ...estado, sair }), [estado, sair])

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}
