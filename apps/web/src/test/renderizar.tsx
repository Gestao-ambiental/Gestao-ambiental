import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { rotas } from '@/app/rotas'
import { ProvedorTema } from '@/app/tema/ProvedorTema'

/** Renderiza o app inteiro (provedores + rotas reais) num roteador em memória. */
export function renderizarApp(caminhoInicial = '/') {
  const router = createMemoryRouter(rotas, { initialEntries: [caminhoInicial] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <ProvedorTema>
        <RouterProvider router={router} />
      </ProvedorTema>
    </QueryClientProvider>,
  )
  return { ...resultado, router }
}
