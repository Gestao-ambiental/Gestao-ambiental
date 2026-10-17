import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { rotas } from '@/app/rotas'
import { ProvedorSessao } from '@/app/sessao/ProvedorSessao'
import { ProvedorTema } from '@/app/tema/ProvedorTema'

/**
 * Renderiza o app inteiro (provedores + rotas reais) num roteador em memória. Os testes que usam
 * isto mocam '@/lib/supabase' com '@/test/supabase-falso' e montam o cenário antes.
 */
export function renderizarApp(caminhoInicial = '/') {
  const router = createMemoryRouter(rotas, { initialEntries: [caminhoInicial] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <ProvedorSessao>
        <ProvedorTema>
          <RouterProvider router={router} />
        </ProvedorTema>
      </ProvedorSessao>
    </QueryClientProvider>,
  )
  return { ...resultado, router, queryClient }
}

/** Vínculo como devolvido pela RPC meus_vinculos. */
export function vinculoFalso(
  consultoria: string,
  papel: 'gestao' | 'equipe',
  extra: Partial<{ situacao: 'ativo' | 'desligado'; desligado_em: string; membro_id: string }> = {},
) {
  return {
    membro_id: extra.membro_id ?? `m-${consultoria}`,
    consultoria_id: `c-${consultoria}`,
    consultoria_nome: consultoria,
    consultoria_fuso: 'America/Sao_Paulo',
    papel,
    situacao: extra.situacao ?? 'ativo',
    desligado_em: extra.desligado_em ?? null,
  }
}
