import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { queryClient } from '@/lib/query-client'

import { ProvedorSessao } from './sessao/ProvedorSessao'
import { ProvedorTema } from './tema/ProvedorTema'

export function Provedores({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorSessao>
        <ProvedorTema>{children}</ProvedorTema>
      </ProvedorSessao>
    </QueryClientProvider>
  )
}
