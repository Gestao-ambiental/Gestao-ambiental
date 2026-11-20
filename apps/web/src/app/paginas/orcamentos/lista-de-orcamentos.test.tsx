// Lista de orçamentos com filtros (Protótipo 19): abas por situação com contagem e na URL, limpar
// filtros, busca pelo número e indicadores do topo vindos do banco.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function linha(id: string, sequencia: number, situacao: string, totalCentavos: number | null) {
  return {
    id,
    ano: 2026,
    sequencia,
    revisao: 1,
    situacao,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    objeto: `Objeto ${String(sequencia)}`,
    total_centavos: totalCentavos,
    atualizado_em: '2026-11-06T19:42:00Z',
    excluido_em: null,
    row_version: 1,
  }
}

const todas = [
  linha('o1', 14, 'rascunho', null),
  linha('o2', 13, 'enviada', 160_000),
  linha('o3', 12, 'negociacao', null),
  linha('o4', 11, 'aprovada', null),
]

/** Imita a RPC: filtra pela situação e devolve o total da consulta em cada linha. */
function listar(args: Record<string, unknown>) {
  const filtradas = todas.filter((l) => !args.p_situacao || l.situacao === args.p_situacao)
  return { data: filtradas.map((l) => ({ ...l, total: filtradas.length })) }
}

const resumo = {
  rascunhos: 1,
  aguardando: 2,
  aguardando_centavos: 160_000,
  aguardando_sem_preco: 1,
  aprovados: 1,
  aprovados_centavos: 0,
  aprovados_sem_preco: 1,
}

function cenario(papel: 'gestao' | 'equipe' = 'gestao', rpc: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_orcamentos: listar,
      contar_orcamentos_por_situacao: {
        data: [
          { situacao: 'rascunho', quantidade: 1 },
          { situacao: 'enviada', quantidade: 1 },
          { situacao: 'negociacao', quantidade: 1 },
          { situacao: 'aprovada', quantidade: 1 },
        ],
      },
      resumo_dos_orcamentos: { data: [resumo] },
      ...rpc,
    },
  }
}

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args)
}

describe('Lista de orçamentos: filtros e indicadores', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra os indicadores do banco; orçamento sem preço não vira zero', async () => {
    const { container } = renderizarApp('/orcamentos')
    const indicadores = await screen.findByLabelText('Indicadores')
    expect(within(indicadores).getByText('Em elaboração')).toBeInTheDocument()
    // Sem sublinha decorativa ("rascunho", "2 propostas"): só o que falta aparece embaixo.
    expect(within(indicadores).queryByText(/rascunho|propostas?$/)).toBeNull()
    // Aguardando decisão: soma só a enviada com preço; a em negociação sem preço é contada à parte.
    expect(within(indicadores).getByText('R$ 1.600,00')).toBeInTheDocument()
    expect(within(indicadores).getByText('1 sem preço')).toBeInTheDocument()
    // Aprovados: o único está sem preço; não aparece R$ 0,00.
    expect(within(indicadores).getByText('Sem preço')).toBeInTheDocument()
    expect(within(indicadores).queryByText('R$ 0,00')).toBeNull()
    expect(chamadas('resumo_dos_orcamentos')).toEqual([{ p_consultoria_id: 'c-Filtroville' }])

    await screen.findByRole('button', { name: 'Rascunho: 1 orçamento' })
    const acessibilidade = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(acessibilidade.violations.map((v) => v.id)).toEqual([])
  })

  it('cada aba mostra a contagem lida pelo leitor de tela; a situação vazia fica sem número', async () => {
    renderizarApp('/orcamentos')
    const abas = await screen.findByRole('group', { name: 'Situação' })
    expect(
      await within(abas).findByRole('button', { name: 'Todas: 4 orçamentos' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(within(abas).getByRole('button', { name: 'Enviada: 1 orçamento' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      within(abas).getByRole('button', { name: 'Em negociação: 1 orçamento' }),
    ).toBeInTheDocument()
    expect(within(abas).getByRole('button', { name: 'Recusada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('"Novo orçamento" no Ctrl+K abre o diálogo mesmo já estando na lista', async () => {
    falso.reiniciar(
      cenario('gestao', { recurso_liberado: { data: true }, buscar_no_grama: { data: [] } }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos')
    await screen.findByRole('group', { name: 'Situação' })
    expect(screen.queryByRole('dialog', { name: 'Novo orçamento' })).toBeNull()

    await usuario.keyboard('{Control>}k{/Control}')
    await usuario.click(await screen.findByRole('option', { name: 'Novo orçamento' }))
    expect(await screen.findByRole('dialog', { name: 'Novo orçamento' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?novo=1')

    // Fechar tira o ?novo=1 e não reabre.
    await usuario.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Novo orçamento' })).toBeNull()
    })
    expect(router.state.location.search).toBe('')
  })

  it('a aba filtra a lista pelo banco e fica na URL; limpar volta para todas', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos')
    const abas = await screen.findByRole('group', { name: 'Situação' })
    await usuario.click(await within(abas).findByRole('button', { name: /^Enviada/ }))

    expect(router.state.location.search).toBe('?situacao=enviada')
    expect(within(abas).getByRole('button', { name: /^Enviada/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => {
      expect(chamadas('listar_orcamentos')).toContainEqual(
        expect.objectContaining({ p_situacao: 'enviada' }),
      )
    })
    const tabela = await screen.findByRole('table')
    await waitFor(() => {
      expect(within(tabela).queryByText('ORC-2026-014')).toBeNull()
    })
    expect(within(tabela).getByText('ORC-2026-013')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Buscar orçamentos' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    expect(await within(tabela).findByText('ORC-2026-014')).toBeInTheDocument()
  })

  it('abre já filtrado pela URL e ignora situação desconhecida', async () => {
    renderizarApp('/orcamentos?situacao=aprovada')
    expect(
      await screen.findByRole('button', { name: /^Aprovada/, pressed: true }),
    ).toBeInTheDocument()
    expect(chamadas('listar_orcamentos')[0]).toMatchObject({ p_situacao: 'aprovada' })

    falso.reiniciar(cenario())
    renderizarApp('/orcamentos?situacao=qualquer')
    await screen.findAllByRole('button', { name: 'Todas: 4 orçamentos', pressed: true })
    expect(chamadas('listar_orcamentos')[0]).not.toHaveProperty('p_situacao')
  })

  it('busca pelo número na lista e na contagem; limpar zera a busca', async () => {
    falso.reiniciar(
      cenario('gestao', {
        listar_orcamentos: (args) => (args.p_busca === '2026-099' ? { data: [] } : listar(args)),
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')
    const busca = await screen.findByRole('searchbox', { name: 'Buscar orçamentos' })
    expect(busca).toHaveAttribute('placeholder', 'Buscar nome, objeto ou número')
    await usuario.type(busca, '2026-099')

    expect(await screen.findByText('Nenhum orçamento encontrado')).toBeInTheDocument()
    expect(
      screen.getByText('Nada com “2026-099”. Busque pelo empreendimento, objeto ou número.'),
    ).toBeInTheDocument()
    expect(chamadas('contar_orcamentos_por_situacao')).toContainEqual({
      p_consultoria_id: 'c-Filtroville',
      p_busca: '2026-099',
      p_lixeira: false,
    })

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(busca).toHaveValue('')
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('aba sem orçamento mostra o vazio da aba', async () => {
    falso.reiniciar(cenario('gestao', { listar_orcamentos: { data: [] } }))
    renderizarApp('/orcamentos?situacao=recusada')
    expect(await screen.findByText('Nenhum orçamento em “Recusada”.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument()
  })

  it('falha nos indicadores não derruba a lista e permite tentar de novo', async () => {
    let falhar = true
    falso.reiniciar(
      cenario('gestao', {
        resumo_dos_orcamentos: () =>
          falhar ? { error: { message: 'falhou', code: 'XX000' } } : { data: [resumo] },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')
    expect(await screen.findByText('Não foi possível carregar os indicadores.')).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    falhar = false
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('R$ 1.600,00')).toBeInTheDocument()
  })

  it('na lixeira não há abas nem indicadores', async () => {
    renderizarApp('/orcamentos?lixeira=1&situacao=enviada')
    expect(
      await screen.findByRole('heading', { name: 'Lixeira de orçamentos' }),
    ).toBeInTheDocument()
    await screen.findByRole('table')
    expect(screen.queryByRole('group', { name: 'Situação' })).toBeNull()
    expect(screen.queryByText('Aguardando decisão')).toBeNull()
    expect(chamadas('resumo_dos_orcamentos')).toEqual([])
    expect(chamadas('listar_orcamentos')[0]).not.toHaveProperty('p_situacao')
  })

  it('sem nenhum orçamento, só o estado vazio', async () => {
    falso.reiniciar(cenario('gestao', { listar_orcamentos: { data: [] } }))
    renderizarApp('/orcamentos')
    expect(await screen.findByText('Nenhum orçamento ainda')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Situação' })).toBeNull()
    expect(screen.queryByText('Aguardando decisão')).toBeNull()
  })

  it('a Equipe vê sem permissão e nada é pedido ao banco', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/orcamentos')
    expect(await screen.findByText(/só a gestão acessa/)).toBeInTheDocument()
    expect(chamadas('resumo_dos_orcamentos')).toEqual([])
    expect(chamadas('contar_orcamentos_por_situacao')).toEqual([])
    expect(chamadas('listar_orcamentos')).toEqual([])
  })
})
