import { createContext, use } from 'react'

import type { PreferenciaTema, TemaEfetivo } from '@/lib/tema'

export interface ValorTema {
  preferencia: PreferenciaTema
  tema: TemaEfetivo
  definirPreferencia: (preferencia: PreferenciaTema) => void
}

export const ContextoTema = createContext<ValorTema | null>(null)

export function useTema(): ValorTema {
  const valor = use(ContextoTema)
  if (!valor) throw new Error('useTema precisa estar dentro de <ProvedorTema>.')
  return valor
}
