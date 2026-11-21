// Orçamento aberto pela triagem sem valores (ADR-0056): a oferta aparece só com ?sem-valores=1 e uma
// modalidade válida; guardar chama a RPC com o nome dos valores; o erro aparece.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso, type Cenario } from '@/test/supabase-falso'

import { ValoresDaModalidade } from './ValoresDaModalidade'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function montar(caminho: string) {
  const cliente = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[caminho]}>
        <ValoresDaModalidade orcamentoId="o1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

function cenario(rpc: Cenario['rpc'] = {}) {
  falso.reiniciar({ rpc })
}

beforeEach(() => {
  cenario()
})

describe('valores da modalidade no orçamento', () => {
  it('sem o aviso da triagem, nada aparece', () => {
    montar('/orcamentos/o1')
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull()
    montar('/orcamentos/o1?modalidade=LAC&sem-valores=1')
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull()
  })

  it('guarda os itens como valores da modalidade', async () => {
    cenario({ salvar_valores_da_modalidade: { data: 'mod-1' } })
    const usuario = montar('/orcamentos/o1?modalidade=trifasica&sem-valores=1')
    expect(
      screen.getByText('Sem valores para Licenciamento trifásico (LAP, LAI e LAO)'),
    ).toBeVisible()
    await usuario.click(screen.getByRole('button', { name: 'Guardar como valores da modalidade' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'salvar_valores_da_modalidade',
        expect.objectContaining({
          p_orcamento_id: 'o1',
          p_modalidade: 'trifasica',
          p_nome: 'Valores · Licenciamento trifásico (LAP, LAI e LAO)',
        }),
      )
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Valores guardados')
  })

  it('o erro do banco aparece', async () => {
    cenario({ salvar_valores_da_modalidade: { error: { message: 'sem_permissao' } } })
    const usuario = montar('/orcamentos/o1?modalidade=AuA&sem-valores=1')
    await usuario.click(screen.getByRole('button', { name: 'Guardar como valores da modalidade' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para esta ação.',
    )
  })
})
