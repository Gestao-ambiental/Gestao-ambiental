import {
  INTERVALO_DE_REGISTRO_MINUTOS,
  moduloDaRota,
  podeRegistrarUso,
} from '@gestao-ambiental/domain'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { registrarUso } from '@/lib/api/uso'

/**
 * Sinal de uso diário (ADR-0024): ao navegar dentro da consultoria, registra a área da rota
 * (licenças e prazos, orçamentos, propostas, equipe e conta) no máximo uma vez a cada 5 minutos por
 * área, e só com a aba visível. Enquanto a pessoa fica na mesma tela, renova a cada 5 minutos.
 * Sem consultoria, na central ou em rota sem área: nada. Falha nunca aparece para a pessoa.
 */
export function useRegistroDeUso(consultoriaId: string | null) {
  const { pathname } = useLocation()
  // Último registro por consultoria e área (milissegundos do relógio do aparelho: só cadência).
  const ultimos = useRef(new Map<string, number>())

  useEffect(() => {
    if (!consultoriaId) return
    const modulo = moduloDaRota(pathname)
    if (!modulo) return
    const chave = `${consultoriaId}:${modulo}`

    const tentar = () => {
      if (document.visibilityState !== 'visible') return
      const agora = Date.now()
      if (!podeRegistrarUso(ultimos.current.get(chave), agora)) return
      ultimos.current.set(chave, agora)
      void registrarUso(consultoriaId, modulo)
    }

    tentar()
    const intervalo = window.setInterval(tentar, INTERVALO_DE_REGISTRO_MINUTOS * 60_000)
    document.addEventListener('visibilitychange', tentar)
    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tentar)
    }
  }, [consultoriaId, pathname])
}
