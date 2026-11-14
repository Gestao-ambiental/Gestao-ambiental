import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextoConsultoria, type EstadoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { falso } from '@/test/supabase-falso'

import { PaginaMtrs, SecaoResiduosDoEmpreendimento } from '.'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const contexto: EstadoConsultoria = {
  atual: {
    membroId: 'm-1',
    consultoriaId: 'c1',
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

const empreendimento = { id: 'e1', nome: 'Metalúrgica Rio Cubatão', cnpj: null, cliente: null }

const linhaDoMtr = {
  id: 'm1',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  numero: '2610001',
  emitido_em: '2026-10-05',
  situacao: 'recebido',
  transportador_nome: 'Transportes Itapocu',
  transportador_cnpj: null,
  destinador_nome: 'Aterro Norte',
  destinador_cnpj: null,
  observacao: null,
  pdf_caminho: null,
  pdf_nome: null,
  itens: [
    {
      id: 'i1',
      posicao: 1,
      residuo_codigo: '200301',
      residuo_descricao: 'Resíduos urbanos misturados',
      classe: 'II A',
      quantidade: 1.5,
      unidade: 't',
    },
  ],
  cdfs: [],
  tem_cdf: false,
  row_version: 1,
  criado_em: '2026-10-05T12:00:00Z',
  total: 1,
}

function renderizar(elemento: ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/empreendimentos/:id/residuos', element: elemento },
      { path: '/empreendimentos/:id', element: elemento },
    ],
    { initialEntries: ['/empreendimentos/e1/residuos'] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ContextoConsultoria.Provider value={contexto}>
        <RouterProvider router={router} />
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
  return router
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome).map(([, args]) => args ?? {})
}

describe('Registro de MTR e CDF', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T13:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lista os MTRs do empreendimento e filtra os sem CDF', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [empreendimento] },
      rpc: { listar_mtrs: { data: [linhaDoMtr] } },
    })
    const usuario = userEvent.setup()
    renderizar(<PaginaMtrs />)

    const tabela = await screen.findByRole('table')
    const linha = within(tabela).getAllByRole('row')[1]
    if (!linha) throw new Error('sem linha')
    expect(within(linha).getByText('2610001')).toBeInTheDocument()
    expect(within(linha).getByText('05/10/2026')).toBeInTheDocument()
    expect(within(linha).getByText('Recebido')).toBeInTheDocument()
    expect(within(linha).getByText('200301 · 1,5 t')).toBeInTheDocument()
    expect(within(linha).getByText('Sem CDF')).toBeInTheDocument()

    await usuario.click(screen.getByLabelText('Só sem CDF'))
    await waitFor(() => {
      expect(chamadas('listar_mtrs').at(-1)).toMatchObject({
        p_consultoria_id: 'c1',
        p_empreendimento_id: 'e1',
        p_sem_cdf: true,
      })
    })
  })

  it('mostra "sem permissão" quando o banco recusa a leitura', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [empreendimento] },
      rpc: { listar_mtrs: { error: { code: '42501', message: 'sem_permissao' } } },
    })
    renderizar(<PaginaMtrs />)

    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
  })

  it('registra o MTR com o resíduo e anexa o PDF', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [empreendimento] },
      rpc: {
        listar_mtrs: { data: [] },
        registrar_mtr: (args) => ({ data: args.p_id }),
        anexar_pdf_residuo: (args) => ({ data: args.p_versao_id }),
      },
    })
    const usuario = userEvent.setup()
    renderizar(<PaginaMtrs />)

    await screen.findByText('Nenhum MTR registrado')
    const [abrir] = screen.getAllByRole('button', { name: 'Registrar MTR' })
    if (!abrir) throw new Error('sem botão')
    await usuario.click(abrir)
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar MTR' })

    await usuario.type(within(dialogo).getByLabelText('Número do MTR *'), '2611002')
    await usuario.type(within(dialogo).getByLabelText('Emissão *'), '10112026')
    await usuario.type(within(dialogo).getByLabelText('Transportador *'), 'Transportes Itapocu')
    await usuario.type(within(dialogo).getByLabelText('Destinador *'), 'Aterro Norte')
    await usuario.type(within(dialogo).getByLabelText('Código do resíduo 1 *'), '200301')
    await usuario.type(
      within(dialogo).getByLabelText('Descrição do resíduo 1 *'),
      'Resíduos urbanos misturados',
    )
    await usuario.type(within(dialogo).getByLabelText('Quantidade do resíduo 1 *'), '1.234,5')
    await usuario.selectOptions(within(dialogo).getByLabelText('Unidade do resíduo 1 *'), 'kg')
    await usuario.upload(
      screen.getByTestId('arquivo-PDF do MTR'),
      new File(['%PDF-1.4 mtr'], 'mtr.pdf', { type: 'application/pdf' }),
    )
    await within(dialogo).findByText(/mtr\.pdf/)

    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar MTR' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    const [registro] = chamadas('registrar_mtr')
    expect(registro).toMatchObject({
      p_empreendimento_id: 'e1',
      p_numero: '2611002',
      p_emitido_em: '2026-11-10',
      p_situacao: 'salvo',
      p_transportador_cnpj: null,
      p_itens: [
        {
          residuo_codigo: '200301',
          residuo_descricao: 'Resíduos urbanos misturados',
          classe: null,
          quantidade: 1234.5,
          unidade: 'kg',
        },
      ],
    })
    expect(chamadas('anexar_pdf_residuo')[0]).toMatchObject({
      p_entidade: 'mtr',
      p_registro_id: registro?.p_id,
      p_nome_original: 'mtr.pdf',
    })
  })

  it('mostra o erro do banco ao registrar o MTR', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [empreendimento] },
      rpc: {
        listar_mtrs: { data: [linhaDoMtr] },
        registrar_mtr: { error: { message: 'numero_existente' } },
      },
    })
    const usuario = userEvent.setup()
    renderizar(<PaginaMtrs />)

    await screen.findByRole('table')
    await usuario.click(screen.getByRole('button', { name: 'Registrar MTR' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar MTR' })
    await usuario.type(within(dialogo).getByLabelText('Número do MTR *'), '2610001')
    await usuario.type(within(dialogo).getByLabelText('Emissão *'), '10112026')
    await usuario.type(within(dialogo).getByLabelText('Transportador *'), 'Transportes Itapocu')
    await usuario.type(within(dialogo).getByLabelText('Destinador *'), 'Aterro Norte')
    await usuario.type(within(dialogo).getByLabelText('Código do resíduo 1 *'), '200301')
    await usuario.type(within(dialogo).getByLabelText('Descrição do resíduo 1 *'), 'Resíduos')
    await usuario.type(within(dialogo).getByLabelText('Quantidade do resíduo 1 *'), '2')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar MTR' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Já existe um MTR com este número.',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('registra o CDF cobrindo o MTR com a quantidade recebida', async () => {
    falso.reiniciar({
      tabelas: { empreendimento: [empreendimento] },
      rpc: {
        listar_mtrs: { data: [linhaDoMtr] },
        registrar_cdf: (args) => ({ data: args.p_id }),
      },
    })
    const usuario = userEvent.setup()
    renderizar(<PaginaMtrs />)

    await screen.findByRole('table')
    await usuario.click(screen.getByRole('button', { name: 'Registrar CDF' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar CDF' })

    await usuario.type(within(dialogo).getByLabelText('Número do CDF *'), 'CDF-77')
    await usuario.type(within(dialogo).getByLabelText('Emissão *'), '04112026')
    await usuario.type(within(dialogo).getByLabelText('Destinador *'), 'Aterro Norte')
    await usuario.type(within(dialogo).getByLabelText('Início do período *'), '01102026')
    await usuario.type(within(dialogo).getByLabelText('Fim do período *'), '31102026')
    await usuario.click(await within(dialogo).findByLabelText('MTR 2610001 · 05/10/2026'))
    await usuario.type(
      within(dialogo).getByLabelText('Recebido no CDF: 200301 Resíduos urbanos misturados'),
      '1,4',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar CDF' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(chamadas('listar_mtrs').some((a) => a.p_sem_cdf === true)).toBe(true)
    expect(chamadas('registrar_cdf')[0]).toMatchObject({
      p_empreendimento_id: 'e1',
      p_numero: 'CDF-77',
      p_emitido_em: '2026-11-04',
      p_periodo_inicio: '2026-10-01',
      p_periodo_fim: '2026-10-31',
      p_mtrs: [{ mtr_id: 'm1', itens: [{ mtr_item_id: 'i1', quantidade: 1.4, unidade: 't' }] }],
    })
  })

  it('mostra os últimos MTRs na seção do empreendimento, com link para a lista', async () => {
    falso.reiniciar({ rpc: { listar_mtrs: { data: [linhaDoMtr] } } })
    renderizar(<SecaoResiduosDoEmpreendimento empreendimentoId="e1" />)

    const secao = await screen.findByRole('region', { name: 'Resíduos' })
    expect(await within(secao).findByText('MTR 2610001')).toBeInTheDocument()
    expect(within(secao).getByRole('link', { name: 'Ver MTRs e CDFs' })).toHaveAttribute(
      'href',
      '/empreendimentos/e1/residuos',
    )
  })
})
