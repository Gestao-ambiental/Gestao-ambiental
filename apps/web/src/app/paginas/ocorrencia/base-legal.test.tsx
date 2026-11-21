import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { BaseLegal } from './BaseLegal'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function montar(texto: string) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <BaseLegal texto={texto} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('base legal da condicionante (LEG-10)', () => {
  it('mostra as normas citadas que estão no catálogo, com link', async () => {
    falso.reiniciar({
      rpc: {
        normas_por_chave: {
          data: [
            {
              chave: 'sc;ima;instrucao_normativa;2',
              id: 'n2',
              titulo: 'IN 2 · Combustíveis',
              situacao_na_fonte: 'vigente',
            },
            {
              chave: 'sc;ima;instrucao_normativa;84',
              id: 'n84',
              titulo: 'IN 84 · Reserva legal',
              situacao_na_fonte: 'revogada',
            },
          ],
        },
      },
    })
    montar('Cumprir a IN 02 e a IN 84 do IMA.')

    expect(await screen.findByRole('link', { name: 'IN 2 · Combustíveis' })).toHaveAttribute(
      'href',
      '/normas/n2',
    )
    expect(screen.getByText(/revogada/)).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('normas_por_chave', {
      p_chaves: ['sc;ima;instrucao_normativa;2', 'sc;ima;instrucao_normativa;84'],
    })
  })

  it('texto sem citação não pergunta nada e não mostra nada', () => {
    falso.reiniciar({})
    const { container } = montar('Manter o sistema de drenagem limpo.')
    expect(container).toBeEmptyDOMElement()
    expect(falso.cliente.rpc).not.toHaveBeenCalled()
  })
})
