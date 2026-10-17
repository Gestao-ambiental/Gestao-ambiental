import { QueryClient } from '@tanstack/react-query'

/** QueryClient único do app. Erros de leitura viram EstadoErro com "Tentar de novo" na tela. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
