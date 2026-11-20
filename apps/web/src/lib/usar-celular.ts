import { useSyncExternalStore } from 'react'

const CONSULTA = '(max-width: 767px)'

function assinar(aoMudar: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const midia = window.matchMedia(CONSULTA)
  midia.addEventListener('change', aoMudar)
  return () => {
    midia.removeEventListener('change', aoMudar)
  }
}

function agora(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches
}

/** Verdadeiro abaixo de 768px (o `md` do Tailwind). Sem matchMedia, conta como desktop. */
export function useCelular(): boolean {
  return useSyncExternalStore(assinar, agora, () => false)
}
