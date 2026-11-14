import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ContextoConsultoria, type EstadoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { falso } from '@/test/supabase-falso'

import { PaginaConferenciaResiduos, PaginaPainelResiduos } from '.'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const consultoria: EstadoConsultoria = {
  atual: {
    membroId: 'm-1',
    consultoriaId: 'c-1',
    consultoriaNome: 'Filtroville',
    fuso: 'America/Sao_Paulo',
    papel: 'equipe',
    situacao: 'ativo',
    desligadoEm: null,
  },
  suporte: null,
  abrirSuporte: () => Promise.resolve(),
  vinculos: [],
  trocar: () => undefined,
}

function renderizar(pagina: ReactNode, caminho = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContextoConsultoria.Provider value={consultoria}>
        <MemoryRouter initialEntries={[caminho]}>{pagina}</MemoryRouter>
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
}

function linhaDa(linhas: HTMLElement[], indice: number): HTMLElement {
  const encontrada = linhas[indice]
  if (!encontrada) throw new Error(`sem a linha ${String(indice)}`)
  return encontrada
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome).map(([, args]) => args)
}

const empreendimentos = {
  data: [
    {
      id: 'e-1',
      nome: 'Fábrica Norte',
      cliente_nome: null,
      cnpj: null,
      unidades: 1,
      licencas: [],
      total: 2,
    },
    {
      id: 'e-2',
      nome: 'Pátio Sul',
      cliente_nome: null,
      cnpj: null,
      unidades: 1,
      licencas: [],
      total: 2,
    },
  ],
}

const pendencia = (extra: Record<string, unknown>) => ({
  tipo: 'mtr_sem_cdf',
  mtr_id: 'mtr-1',
  numero: '240001',
  emitido_em: '2026-09-01',
  empreendimento_id: 'e-1',
  empreendimento_nome: 'Fábrica Norte',
  dias: null,
  mtr_item_id: null,
  residuo_codigo: null,
  residuo_descricao: null,
  unidade: null,
  quantidade_mtr: null,
  quantidade_cdf: null,
  diferenca: null,
  cdfs: [],
  unidades_cdf: [],
  ...extra,
})

describe('Conferência CDF x MTR', () => {
  it('mostra MTR sem CDF e quantidade diferente, e filtra por empreendimento', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      rpc: {
        listar_empreendimentos: empreendimentos,
        conferencia_residuos: (args) => ({
          data:
            args.p_empreendimento_id === 'e-2'
              ? []
              : [
                  pendencia({ dias: 74 }),
                  pendencia({
                    tipo: 'quantidade_diferente',
                    mtr_id: 'mtr-2',
                    numero: '240002',
                    emitido_em: '2026-10-05',
                    mtr_item_id: 'item-2',
                    residuo_codigo: '150110',
                    residuo_descricao: 'Embalagens contaminadas',
                    unidade: 't',
                    quantidade_mtr: 10,
                    quantidade_cdf: 9.5,
                    diferenca: -0.5,
                    cdfs: [{ id: 'cdf-1', numero: 'CDF-77' }],
                  }),
                ],
        }),
      },
    })
    renderizar(<PaginaConferenciaResiduos />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Conferência CDF x MTR' }),
    ).toBeInTheDocument()
    const tabela = await screen.findByRole('table')
    const linhas = within(tabela).getAllByRole('row')
    expect(within(linhaDa(linhas, 1)).getByText('MTR sem CDF')).toBeInTheDocument()
    expect(within(linhaDa(linhas, 1)).getByText('74 dias sem CDF')).toBeInTheDocument()
    expect(within(linhaDa(linhas, 1)).getByText('01/09/2026')).toBeInTheDocument()
    expect(within(linhaDa(linhas, 2)).getByText('Quantidade diferente')).toBeInTheDocument()
    expect(
      within(linhaDa(linhas, 2)).getByText('MTR 10 t · CDF 9,5 t (−0,5 t)'),
    ).toBeInTheDocument()
    expect(within(linhaDa(linhas, 2)).getByText('CDF-77')).toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('Pendência'), 'quantidade_diferente')
    expect(screen.queryByText('74 dias sem CDF')).not.toBeInTheDocument()

    await screen.findByRole('option', { name: 'Pátio Sul' })
    await usuario.selectOptions(screen.getByLabelText('Empreendimento'), 'e-2')
    expect(
      await screen.findByRole('heading', { name: 'Nenhuma pendência com estes filtros' }),
    ).toBeInTheDocument()
    expect(chamadas('conferencia_residuos').at(-1)).toEqual({
      p_consultoria_id: 'c-1',
      p_empreendimento_id: 'e-2',
    })
  })

  it('erro ao carregar mostra o aviso e tenta de novo', async () => {
    const usuario = userEvent.setup()
    let falhar = true
    falso.reiniciar({
      rpc: {
        listar_empreendimentos: empreendimentos,
        conferencia_residuos: () =>
          falhar ? { error: { message: 'falha de rede', code: '08000' } } : { data: [] },
      },
    })
    renderizar(<PaginaConferenciaResiduos />)
    const alerta = await screen.findByRole('alert')
    expect(within(alerta).getByText('Não foi possível carregar a conferência.')).toBeInTheDocument()
    falhar = false
    await usuario.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Nenhuma pendência' })).toBeInTheDocument()
  })
})

describe('Painel de resíduos', () => {
  const linha = (extra: Record<string, unknown>) => ({
    mes: '2026-10-01',
    empreendimento_id: 'e-1',
    empreendimento_nome: 'Fábrica Norte',
    residuo_codigo: '150110',
    residuo_descricao: 'Embalagens contaminadas',
    destinador_nome: 'Aterro Joinville',
    unidade: 't',
    quantidade: 2.5,
    mtrs: 1,
    ...extra,
  })

  it('soma por resíduo, destinador e mês sem misturar unidades, com gráfico por mês', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      rpc: {
        listar_empreendimentos: empreendimentos,
        painel_residuos: {
          data: [
            linha({}),
            linha({ mes: '2026-09-01', quantidade: 1.25, destinador_nome: 'ATERRO JOINVILLE' }),
            linha({
              residuo_codigo: '200301',
              residuo_descricao: 'Lodo',
              destinador_nome: 'Estação Sul',
              unidade: 'm3',
              quantidade: 4,
              mtrs: 2,
            }),
          ],
        },
      },
    })
    renderizar(<PaginaPainelResiduos />, '/?empreendimento=e-1')

    const tabela = await screen.findByRole('table', { name: 'Quantidade por resíduo' })
    const linhas = within(tabela).getAllByRole('row')
    expect(
      within(linhaDa(linhas, 1)).getByText('150110 · Embalagens contaminadas'),
    ).toBeInTheDocument()
    expect(within(linhaDa(linhas, 1)).getByText('3,75 t')).toBeInTheDocument()
    expect(within(linhaDa(linhas, 1)).getByText('2')).toBeInTheDocument()
    expect(within(linhaDa(linhas, 2)).getByText('4 m³')).toBeInTheDocument()

    const args = chamadas('painel_residuos')[0]
    expect(args).toMatchObject({ p_consultoria_id: 'c-1', p_empreendimento_id: 'e-1' })

    const grafico = screen.getByRole('list', { name: 'Quantidade por mês (t)' })
    expect(within(grafico).getByText('out/2026: 2,5 t')).toBeInTheDocument()
    expect(within(grafico).getByText('set/2026: 1,25 t')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByLabelText('Unidade do gráfico'), 'm3')
    expect(
      within(screen.getByRole('list', { name: 'Quantidade por mês (m³)' })).getByText(
        'out/2026: 4 m³',
      ),
    ).toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('Somar por'), 'destinador')
    const porDestinador = screen.getByRole('table', { name: 'Quantidade por destinador' })
    expect(within(porDestinador).getAllByRole('row')).toHaveLength(3)
    expect(within(porDestinador).getByText('3,75 t')).toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('Somar por'), 'mes')
    const porMes = screen.getByRole('table', { name: 'Quantidade por mês' })
    const meses = within(porMes)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.textContent)
    expect(meses).toEqual(['set/20261,25 t', 'out/20264 m³', 'out/20262,5 t'])
  })
})
