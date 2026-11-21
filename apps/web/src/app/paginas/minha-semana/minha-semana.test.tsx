import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextoConsultoria, type EstadoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { falso } from '@/test/supabase-falso'

import { PaginaMinhaSemana } from './PaginaMinhaSemana'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const trocar = vi.fn<(consultoriaId: string, destino?: string) => void>()

const consultoria: EstadoConsultoria = {
  atual: {
    membroId: 'm-1',
    consultoriaId: 'c-filtroville',
    consultoriaNome: 'Filtroville',
    fuso: 'America/Sao_Paulo',
    papel: 'equipe',
    situacao: 'ativo',
    desligadoEm: null,
  },
  suporte: null,
  abrirSuporte: () => Promise.resolve(),
  vinculos: [],
  trocar,
}

function linha(extra: Record<string, unknown>) {
  return {
    consultoria_id: 'c-filtroville',
    consultoria_nome: 'Filtroville',
    somente_leitura: false,
    situacao_consultoria: 'ativa',
    tipo_evento: 'prazo',
    tipo_linha: 'ocorrencia',
    data: '2026-11-23',
    id: 'o-1',
    instrumento_id: 'i-1',
    empreendimento_id: 'e-1',
    codigo: '1.1',
    titulo: 'Relatório de efluentes',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    licenca: 'LAO 100/2025',
    dias: 2,
    em_conferencia: false,
    total: 3,
    ...extra,
  }
}

const tresItens = [
  linha({ data: '2026-11-19', dias: -2, id: 'o-0', titulo: 'Inventário de resíduos' }),
  linha({}),
  linha({
    consultoria_id: 'c-verdesul',
    consultoria_nome: 'Verde Sul',
    somente_leitura: true,
    tipo_evento: 'exigencia',
    tipo_linha: 'exigencia',
    id: 'x-1',
    codigo: null,
    titulo: 'Responder ofício 12/2026',
    empreendimento_nome: 'Cerâmica Vale',
    licenca: null,
  }),
]

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContextoConsultoria.Provider value={consultoria}>
        <MemoryRouter initialEntries={['/minha-semana']}>
          <Routes>
            <Route path="/minha-semana" element={<PaginaMinhaSemana />} />
            <Route path="/ocorrencias/:id" element={<p>Página da ocorrência</p>} />
          </Routes>
        </MemoryRouter>
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
}

function chamadas() {
  return falso.cliente.rpc.mock.calls
    .filter(([nome]) => nome === 'minha_semana')
    .map(([, args]) => args)
}

describe('Minha semana', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T15:00:00Z')) // sábado, 21/11/2026 em São Paulo
    trocar.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('agrupa por dia, com o nome da consultoria e a situação escritos', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: tresItens } } })
    renderizar()

    expect(await screen.findByRole('heading', { name: /quinta-feira, 19\/11\/2026/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: /prazo passado/ })).toBeVisible()

    const segunda = screen.getByRole('list', { name: 'segunda-feira, 23/11/2026' })
    const itens = within(segunda).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('Filtroville')
    expect(itens[0]).toHaveTextContent('Condicionante')
    expect(itens[0]).toHaveTextContent('1.1 Relatório de efluentes')
    expect(itens[0]).toHaveTextContent('Em 2 dias')
    expect(itens[1]).toHaveTextContent('Verde Sul')
    expect(itens[1]).toHaveTextContent('Só leitura')
    expect(itens[1]).toHaveTextContent('Exigência')

    expect(screen.getByText('Atrasada 2 dias')).toBeInTheDocument()
    expect(screen.getByText('1–3 de 3')).toBeVisible()
  })

  it('pede a semana atual sem início (traz os atrasados) e sem consultoria', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: tresItens } } })
    renderizar()
    await screen.findByText('1–3 de 3')

    const args = chamadas()[0] ?? {}
    expect(args).toEqual({ p_ate: '2026-11-27', p_limite: 50, p_deslocamento: 0 })
    expect(args).not.toHaveProperty('p_consultoria_id')
  })

  it('a próxima semana pede o período seguinte', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: tresItens } } })
    const usuario = userEvent.setup()
    renderizar()
    await screen.findByText('1–3 de 3')

    await usuario.click(screen.getByRole('button', { name: 'Próxima semana' }))

    await vi.waitFor(() => {
      expect(chamadas().at(-1)).toEqual({
        p_de: '2026-11-28',
        p_ate: '2026-12-04',
        p_limite: 50,
        p_deslocamento: 0,
      })
    })
  })

  it('item de outra consultoria troca para ela e abre o item', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: tresItens } } })
    const usuario = userEvent.setup()
    renderizar()

    await usuario.click(await screen.findByRole('button', { name: /Responder ofício/ }))

    expect(trocar).toHaveBeenCalledWith('c-verdesul', '/exigencias/x-1')
  })

  it('item da consultoria atual abre sem trocar', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: tresItens } } })
    const usuario = userEvent.setup()
    renderizar()

    await usuario.click(await screen.findByRole('button', { name: /Relatório de efluentes/ }))

    expect(await screen.findByText('Página da ocorrência')).toBeVisible()
    expect(trocar).not.toHaveBeenCalled()
  })

  it('pagina de 50 em 50', async () => {
    falso.reiniciar({
      rpc: { minha_semana: { data: tresItens.map((l) => ({ ...l, total: 120 })) } },
    })
    const usuario = userEvent.setup()
    renderizar()
    await screen.findByText('1–3 de 120')

    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }))

    await vi.waitFor(() => {
      expect(chamadas().at(-1)).toMatchObject({ p_deslocamento: 50 })
    })
  })

  it('vazio', async () => {
    falso.reiniciar({ rpc: { minha_semana: { data: [] } } })
    renderizar()

    expect(
      await screen.findByRole('heading', { name: 'Nada com você até o fim da semana' }),
    ).toBeVisible()
  })

  it('erro mostra a mensagem e tenta de novo', async () => {
    let tentativas = 0
    falso.reiniciar({
      rpc: {
        minha_semana: () => {
          tentativas += 1
          return tentativas === 1
            ? { error: { code: '08006', message: 'falha de rede' } }
            : { data: tresItens }
        },
      },
    })
    const usuario = userEvent.setup()
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar sua semana',
    )
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('1–3 de 3')).toBeVisible()
  })

  it('sem permissão', async () => {
    falso.reiniciar({
      rpc: { minha_semana: { error: { code: '42501', message: 'sem_permissao' } } },
    })
    renderizar()

    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeVisible()
  })
})
