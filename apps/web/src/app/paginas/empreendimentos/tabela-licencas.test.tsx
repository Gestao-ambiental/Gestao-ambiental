// Selo "Norma mudou" na tabela de licenças (ADR-0050, item 25): aparece só na licença com aviso
// não visto, leva à aba Normas de Acompanhamentos e, se a leitura falhar, a tabela segue sem selo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'
import type { LicencaNaLista } from '@/lib/api/licencas'

import { ContextoConsultoria, type EstadoConsultoria } from '../../consultoria/contexto-consultoria'
import { TabelaLicencas } from './TabelaLicencas'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function licenca(id: string, numero: string): LicencaNaLista {
  return {
    id,
    numero,
    sigla: 'LAO',
    situacao: 'ativo',
    validade: '2028-03-14',
    orgao: 'IMA',
    tipoNome: 'Licença Ambiental de Operação',
    unidadeId: 'u1',
    unidadeNome: 'Matriz',
    condicionantes: 3,
    criadoEm: '2026-10-01T12:00:00Z',
    passoCadastro: null,
    somenteValidade: false,
  }
}

const ITENS = [licenca('i1', '4821/2023'), licenca('i2', '100/2024')]

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
    trocar: () => undefined,
  }
  render(
    <QueryClientProvider client={queryClient}>
      <ContextoConsultoria.Provider value={consultoria}>
        <MemoryRouter>
          <TabelaLicencas
            empreendimentoId="e1"
            itens={ITENS}
            totalSemFiltro={ITENS.length}
            hoje="2026-11-20"
            fuso="America/Sao_Paulo"
            podeEditar={false}
            aoLimparFiltros={() => undefined}
            ordemDecrescente
            aoInverterOrdem={() => undefined}
          />
        </MemoryRouter>
      </ContextoConsultoria.Provider>
    </QueryClientProvider>,
  )
}

const linhaDe = (texto: string) => {
  const linha = screen.getByText(texto).closest('tr')
  if (!linha) throw new Error(`linha de ${texto} não encontrada`)
  return linha
}

describe('TabelaLicencas: selo "Norma mudou"', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra o selo só na licença com aviso não visto, com link para a aba Normas', async () => {
    falso.reiniciar({
      rpc: { licencas_com_mudanca_de_norma: { data: [{ instrumento_id: 'i1', mudancas: 2 }] } },
    })
    renderizar()

    const selo = await screen.findByRole('link', {
      name: 'Norma mudou: 2 mudanças para LAO 4821/2023',
    })
    expect(selo).toHaveAttribute('href', '/acompanhamentos?aba=normas')
    // Palavra visível e ícone com nome: a informação não depende da cor.
    expect(selo).toHaveTextContent('Norma mudou')
    expect(within(linhaDe('LAO 4821/2023')).getByRole('link')).toBe(selo)
    expect(within(linhaDe('LAO 100/2024')).queryByText('Norma mudou')).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('licencas_com_mudanca_de_norma', {
      p_consultoria_id: 'c-filtroville',
      p_empreendimento_id: 'e1',
    })
  })

  it('sem aviso, nenhuma licença tem selo', async () => {
    falso.reiniciar({ rpc: { licencas_com_mudanca_de_norma: { data: [] } } })
    renderizar()
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'licencas_com_mudanca_de_norma',
        expect.anything(),
      )
    })
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('Norma mudou')).not.toBeInTheDocument()
  })

  it('erro da RPC não quebra a tabela: só não mostra o selo', async () => {
    falso.reiniciar({
      rpc: {
        licencas_com_mudanca_de_norma: { error: { message: 'sem_permissao', code: '42501' } },
      },
    })
    renderizar()
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'licencas_com_mudanca_de_norma',
        expect.anything(),
      )
    })
    expect(screen.getByText('LAO 4821/2023')).toBeInTheDocument()
    expect(screen.getByText('LAO 100/2024')).toBeInTheDocument()
    expect(screen.queryByText('Norma mudou')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('no celular o selo aparece na lista, com uma mudança no singular', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    falso.reiniciar({
      rpc: { licencas_com_mudanca_de_norma: { data: [{ instrumento_id: 'i2', mudancas: 1 }] } },
    })
    renderizar()
    const lista = screen.getByRole('list', { name: 'Licenças do empreendimento' })
    expect(
      await within(lista).findByRole('link', { name: 'Norma mudou: 1 mudança para LAO 100/2024' }),
    ).toHaveAttribute('href', '/acompanhamentos?aba=normas')
  })
})
