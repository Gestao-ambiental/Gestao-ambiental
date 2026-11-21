// Aba Normas de Acompanhamentos (LEG-05; ADR-0050): cartões das mudanças que afetam a carteira,
// contagem das não vistas na aba, filtro "Só novas", vazio e erro.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function mudanca(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mudanca_id: 'm1',
    norma_id: 'n1',
    norma_titulo: 'Instrução Normativa 02 do IMA',
    tipo_mudanca: 'alterada',
    publicada_em: '2026-11-20T15:00:00Z',
    resumo: 'Muda o prazo de entrega do relatório de automonitoramento.',
    empreendimentos: 3,
    licencas: 2,
    clientes: 1,
    nao_vista: true,
    total: 2,
    ...extra,
  }
}

const vista = mudanca({
  mudanca_id: 'm2',
  norma_id: 'n2',
  norma_titulo: 'Resolução CONSEMA 98',
  tipo_mudanca: 'revogada',
  publicada_em: '2026-11-10T12:00:00Z',
  resumo: null,
  empreendimentos: 1,
  licencas: 1,
  clientes: 1,
  nao_vista: false,
})

function cenario(rpc: NonNullable<Cenario['rpc']> = {}) {
  falso.reiniciar({
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      contar_mudancas_de_norma_nao_vistas: { data: 1 },
      ...rpc,
    },
  })
}

describe('aba Normas', () => {
  it('mostra os cartões, a marca Nova e a contagem das não vistas na aba', async () => {
    cenario({
      listar_mudancas_de_norma_da_consultoria: { data: [mudanca(), vista] },
    })
    renderizarApp('/acompanhamentos?aba=normas')

    expect(await screen.findByRole('tab', { name: 'Normas 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const lista = await screen.findByRole('list', { name: 'Mudanças de norma' })
    expect(within(lista).getAllByRole('heading', { level: 3 })).toHaveLength(2)
    const primeiro = screen
      .getByRole('link', { name: 'Instrução Normativa 02 do IMA' })
      .closest('li') as HTMLElement
    expect(screen.getByRole('link', { name: 'Instrução Normativa 02 do IMA' })).toHaveAttribute(
      'href',
      '/normas/n1?mudanca=m1',
    )
    expect(within(primeiro).getByText('Nova')).toBeInTheDocument()
    expect(
      within(primeiro).getByText(/Texto alterado · publicada em 20\/11\/2026/),
    ).toBeInTheDocument()
    expect(within(primeiro).getByText(/relatório de automonitoramento/)).toBeInTheDocument()
    expect(within(primeiro).getByText('2 licenças')).toBeInTheDocument()
    expect(within(primeiro).getByText('1 cliente')).toBeInTheDocument()
    expect(within(primeiro).getByText('3 empreendimentos')).toBeInTheDocument()

    const segundo = screen
      .getByRole('link', { name: 'Resolução CONSEMA 98' })
      .closest('li') as HTMLElement
    expect(within(segundo).queryByText('Nova')).not.toBeInTheDocument()
    expect(within(segundo).getByText(/Revogada · publicada em 10\/11\/2026/)).toBeInTheDocument()
    expect(within(segundo).getByText('1 licença')).toBeInTheDocument()
    expect(screen.getByText('1–2 de 2')).toBeInTheDocument()
  })

  it('"Só novas" pede só as não vistas ao banco', async () => {
    const usuario = userEvent.setup()
    cenario({
      listar_mudancas_de_norma_da_consultoria: (args) => ({
        data: args.p_so_nao_vistas === true ? [mudanca({ total: 1 })] : [mudanca(), vista],
      }),
    })
    renderizarApp('/acompanhamentos?aba=normas')
    await screen.findByRole('link', { name: 'Resolução CONSEMA 98' })

    const filtro = screen.getByRole('group', { name: 'Filtrar mudanças de norma' })
    await usuario.click(within(filtro).getByRole('button', { name: 'Só novas' }))

    expect(within(filtro).getByRole('button', { name: 'Só novas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByText('1–1 de 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Resolução CONSEMA 98' })).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_mudancas_de_norma_da_consultoria', {
      p_consultoria_id: 'c-Filtroville',
      p_so_nao_vistas: true,
      p_limite: 25,
      p_deslocamento: 0,
    })
  })

  it('sem mudança, só o título curto do vazio', async () => {
    cenario({
      listar_mudancas_de_norma_da_consultoria: { data: [] },
      contar_mudancas_de_norma_nao_vistas: { data: 0 },
    })
    renderizarApp('/acompanhamentos?aba=normas')
    const vazio = await screen.findByRole('region', {
      name: 'Nenhuma mudança que afete a carteira',
    })
    expect(vazio.querySelector('p')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Normas' })).toBeInTheDocument()
  })

  it('erro ao carregar mostra o aviso com "Tentar de novo"', async () => {
    cenario({
      listar_mudancas_de_norma_da_consultoria: { error: { message: 'falhou' } },
    })
    renderizarApp('/acompanhamentos?aba=normas')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar as mudanças de norma.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem permissão no banco mostra o estado de acesso negado', async () => {
    cenario({
      listar_mudancas_de_norma_da_consultoria: {
        error: { code: '42501', message: 'sem_permissao' },
      },
    })
    renderizarApp('/acompanhamentos?aba=normas')
    expect(
      await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })
})
