import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { queryClient } from '@/lib/query-client'

import { ProvedorTema } from './tema/ProvedorTema'

export function Provedores({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorTema>{children}</ProvedorTema>
    </QueryClientProvider>
  )
}
