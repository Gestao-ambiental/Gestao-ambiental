import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { ContextoConsultoria, type EstadoConsultoria } from '../consultoria/contexto-consultoria'
import { BuscaGlobal } from './BuscaGlobal'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const LINHAS = [
  {
    tipo: 'empreendimento',
    id: 'e1',
    titulo: 'Metalúrgica São João',
    detalhe: 'Grupo Açoriano',
    referencia_id: 'e1',
  },
  {
    tipo: 'licenca',
    id: 'i1',
    titulo: 'LAO 4821/2023',
    detalhe: 'Metalúrgica São João',
    referencia_id: 'e1',
  },
  {
    tipo: 'orcamento',
    id: 'o1',
    titulo: 'Licenciamento da Metalúrgica',
    detalhe: 'ORC-2026-007 · Metalúrgica São João',
    referencia_id: 'o1',
  },
]

function renderizar(papel: 'gestao' | 'equipe' = 'gestao') {
  const router = createMemoryRouter([{ path: '*', element: <BuscaGlobal /> }], {
    initialEntries: ['/'],
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const consultoria: EstadoConsultoria = {
    atual: {
      membroId: 'm-1',
      consultoriaId: 'c-filtroville',
      consultoriaNome: 'Filtroville',
      fuso: 'America/Sao_Paulo',
      papel,
      situacao: 'ativo',
      desligadoEm: null,
    },
    suporte: null,
    abrirSuporte: () => Promise.resolve(),
    vinculos: [],
    trocar: () => undefined,
  }
  render(
    <QueryClientProvider client={queryClient}>
      <ContextoConsultoria.Provider value={consultoria}>
        <RouterProvider router={router} />
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
  return { router, usuario: userEvent.setup() }
}

const chamadasDaBusca = () =>
  falso.cliente.rpc.mock.calls.filter(([nome]) => nome === 'buscar_no_grama')

describe('busca global', () => {
  beforeEach(() => {
    falso.reiniciar({ rpc: { buscar_no_grama: { data: LINHAS } } })
  })

  it('Ctrl+K e Cmd+K abrem o diálogo com o campo focado', async () => {
    const { usuario } = renderizar()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await usuario.keyboard('{Control>}k{/Control}')
    const dialogo = await screen.findByRole('dialog', { name: 'Buscar no Grama' })
    expect(within(dialogo).getByRole('combobox', { name: 'Buscar no Grama' })).toHaveFocus()

    await usuario.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await usuario.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog', { name: 'Buscar no Grama' })).toBeInTheDocument()
  })

  it('no celular, o botão de lupa "Buscar" abre o diálogo', async () => {
    const { usuario } = renderizar()
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('dialog', { name: 'Buscar no Grama' })).toBeInTheDocument()
  })

  it('digitar chama a RPC com o termo e mostra os resultados agrupados', async () => {
    const { usuario } = renderizar()
    await usuario.keyboard('{Control>}k{/Control}')
    const campo = await screen.findByRole('combobox', { name: 'Buscar no Grama' })

    await usuario.type(campo, 'm')
    // Uma letra não busca no banco.
    await new Promise((resolver) => setTimeout(resolver, 300))
    expect(chamadasDaBusca()).toHaveLength(0)

    await usuario.type(campo, 'etal')
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('buscar_no_grama', {
        p_consultoria_id: 'c-filtroville',
        p_termo: 'metal',
      })
    })
    // Com espera ao digitar: uma chamada só para "metal", nenhuma para "me", "met", "meta".
    expect(chamadasDaBusca()).toHaveLength(1)

    const lista = screen.getByRole('listbox', { name: 'Resultados da busca' })
    const empreendimentos = await within(lista).findByRole('group', { name: 'Empreendimentos' })
    expect(
      within(empreendimentos).getByRole('option', { name: /Metalúrgica São João/ }),
    ).toBeInTheDocument()
    expect(
      within(within(lista).getByRole('group', { name: 'Licenças' })).getByRole('option', {
        name: /LAO 4821\/2023/,
      }),
    ).toBeInTheDocument()
    expect(within(lista).getByRole('group', { name: 'Orçamentos' })).toBeInTheDocument()
  })

  it('setas movem a opção ativa e Enter navega para o destino', async () => {
    const { usuario, router } = renderizar()
    await usuario.keyboard('{Control>}k{/Control}')
    const campo = await screen.findByRole('combobox', { name: 'Buscar no Grama' })
    await usuario.type(campo, 'metal')
    const opcoes = await screen.findAllByRole('option')
    expect(opcoes).toHaveLength(3)

    const ativa = () => {
      const id = campo.getAttribute('aria-activedescendant')
      return id ? document.getElementById(id) : null
    }
    expect(ativa()).toHaveTextContent('Metalúrgica São João')
    expect(ativa()).toHaveAttribute('aria-selected', 'true')

    await usuario.keyboard('{ArrowDown}')
    expect(ativa()).toHaveTextContent('LAO 4821/2023')
    await usuario.keyboard('{ArrowUp}{ArrowUp}')
    expect(ativa()).toHaveTextContent('Licenciamento da Metalúrgica')
    expect(campo).toHaveFocus()

    await usuario.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/orcamentos/o1')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('licença abre o empreendimento dela', async () => {
    const { usuario, router } = renderizar()
    await usuario.keyboard('{Control>}k{/Control}')
    await usuario.type(await screen.findByRole('combobox'), 'lao')
    await usuario.click(await screen.findByRole('option', { name: /LAO 4821\/2023/ }))
    expect(router.state.location.pathname).toBe('/empreendimentos/e1')
  })

  it('Esc fecha e devolve o foco a quem abriu', async () => {
    const { usuario } = renderizar()
    const gatilho = screen.getByRole('button', { name: /Buscar licença, condicionante, orçamento/ })
    await usuario.click(gatilho)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(gatilho).toHaveFocus()
  })

  it('sem resultado, diz que nada foi encontrado', async () => {
    falso.reiniciar({ rpc: { buscar_no_grama: { data: [] } } })
    const { usuario } = renderizar()
    await usuario.keyboard('{Control>}k{/Control}')
    await usuario.type(await screen.findByRole('combobox'), 'xyz')
    expect(await screen.findByText('Nada encontrado para “xyz”')).toBeInTheDocument()
  })

  it('erro da RPC mostra mensagem', async () => {
    falso.reiniciar({ rpc: { buscar_no_grama: { error: { message: 'falha' } } } })
    const { usuario } = renderizar()
    await usuario.keyboard('{Control>}k{/Control}')
    await usuario.type(await screen.findByRole('combobox'), 'metal')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível buscar. Tente de novo.',
    )
  })

  it('"Ir para" leva aos destinos do menu; a Gestão vê Orçamentos', async () => {
    falso.reiniciar({ rpc: { buscar_no_grama: { data: [] } } })
    const { usuario, router } = renderizar('gestao')
    await usuario.keyboard('{Control>}k{/Control}')
    const irPara = await screen.findByRole('group', { name: 'Ir para' })
    expect(within(irPara).getByRole('option', { name: 'Orçamentos' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('combobox'), 'calend')
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    })
    await usuario.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/calendario')
  })

  it('Equipe não vê Orçamentos em "Ir para" nem orçamento nos resultados', async () => {
    const { usuario } = renderizar('equipe')
    await usuario.keyboard('{Control>}k{/Control}')
    const irPara = await screen.findByRole('group', { name: 'Ir para' })
    expect(within(irPara).queryByRole('option', { name: 'Orçamentos' })).not.toBeInTheDocument()
    expect(within(irPara).queryByRole('option', { name: 'Equipe' })).not.toBeInTheDocument()
    expect(within(irPara).getByRole('option', { name: 'Empreendimentos' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('combobox'), 'metal')
    expect(await screen.findByRole('group', { name: 'Licenças' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Orçamentos' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /Licenciamento da Metalúrgica/ }),
    ).not.toBeInTheDocument()
  })
})
