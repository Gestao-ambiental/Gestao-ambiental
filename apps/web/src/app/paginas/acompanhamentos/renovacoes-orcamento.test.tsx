// Renovação vira orçamento (ADR-0044): horizonte do radar, coluna "Orçamento" e "Gerar orçamento"
// no "…" do plano de renovação.
import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function renovacao(extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    instrumento_id: 'i1',
    licenca: 'LAO 4821/2023',
    orgao: 'IMA',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    validade: adicionarDias(hoje, 126),
    dias_limite_protocolo: 120,
    antecedencia_dias: 30,
    protocolado_em: null,
    protocolo_numero: null,
    acompanhamento_dias: null,
    hoje,
    total: 2,
    orcamento_id: null,
    orcamento_ano: null,
    orcamento_sequencia: null,
    orcamento_revisao: null,
    orcamento_situacao: null,
    ...extra,
  }
}

const COM_ORCAMENTO = renovacao({
  id: 'p2',
  instrumento_id: 'i2',
  licenca: 'LAO 2207/2023',
  empreendimento_nome: 'Laticínios Serra Azul',
  validade: adicionarDias(hoje, 147),
  orcamento_id: 'o9',
  orcamento_ano: 2026,
  orcamento_sequencia: 9,
  orcamento_revisao: 1,
  orcamento_situacao: 'rascunho',
})

function plano(): Record<string, unknown> {
  return {
    ...renovacao({ instrumento_id: 'i2', licenca: 'LAO 2207/2023' }),
    consultoria_id: 'c-Filtroville',
    comprovante_caminho: null,
    comprovante_nome: null,
    comprovante_tamanho: null,
    registrado_por_nome: null,
    registrado_em: null,
    row_version: 1,
  }
}

function cenario(
  papel: 'gestao' | 'equipe' = 'gestao',
  {
    orcamentosNoPlano = true,
    rpc = {},
  }: { orcamentosNoPlano?: boolean; rpc?: Cenario['rpc'] } = {},
): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_aguardando_conferencia: { data: [] },
      listar_renovacoes: { data: [renovacao(), COM_ORCAMENTO] },
      obter_plano_renovacao: { data: [plano()] },
      recurso_liberado: (a) => ({ data: a.p_recurso === 'orcamentos' ? orcamentosNoPlano : false }),
      ...rpc,
    },
  }
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
}

async function radar() {
  const painel = await screen.findByRole('tabpanel', { name: /Renovações no radar/ })
  await within(painel).findAllByText('LAO 2207/2023')
  return painel
}

describe('radar de renovações: coluna "Orçamento"', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('a Gestão vê o número e a situação do orçamento, com link para o editor', async () => {
    renderizarApp('/acompanhamentos')
    const painel = await radar()
    expect(within(painel).getByRole('columnheader', { name: 'Orçamento' })).toBeInTheDocument()
    const [numero] = within(painel).getAllByRole('link', { name: 'ORC-2026-009' })
    expect(numero).toHaveAttribute('href', '/orcamentos/o9')
    expect(within(painel).getAllByText('Rascunho').length).toBeGreaterThan(0)
  })

  it('sem orçamento, a Gestão gera: leva à tela do rascunho da renovação', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/acompanhamentos')
    const painel = await radar()
    const [gerar] = await within(painel).findAllByRole('link', {
      name: 'Gerar orçamento da LAO 4821/2023',
    })
    expect(gerar).toHaveTextContent('Gerar orçamento')
    expect(within(painel).queryByRole('link', { name: /Gerar orçamento da LAO 2207/ })).toBeNull()
    if (!gerar) throw new Error('ação ausente')
    await usuario.click(gerar)
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/novo')
    })
    expect(router.state.location.search).toBe('?renovacao=i1')
  })

  it('sem orçamentos no plano, a Gestão não vê a ação', async () => {
    falso.reiniciar(cenario('gestao', { orcamentosNoPlano: false }))
    renderizarApp('/acompanhamentos')
    const painel = await radar()
    expect(within(painel).getAllByText('Sem orçamento').length).toBeGreaterThan(0)
    expect(within(painel).queryByRole('link', { name: /Gerar orçamento/ })).toBeNull()
  })

  it('a Equipe vê só a situação, sem número, link nem ação', async () => {
    falso.reiniciar(
      cenario('equipe', {
        rpc: {
          listar_renovacoes: {
            data: [
              renovacao(),
              {
                ...COM_ORCAMENTO,
                orcamento_id: null,
                orcamento_ano: null,
                orcamento_sequencia: null,
                orcamento_revisao: null,
                orcamento_situacao: 'enviada',
              },
            ],
          },
        },
      }),
    )
    renderizarApp('/acompanhamentos')
    const painel = await radar()
    expect(within(painel).getAllByText('Enviada').length).toBeGreaterThan(0)
    expect(within(painel).getAllByText('Sem orçamento').length).toBeGreaterThan(0)
    expect(within(painel).queryByText(/ORC-/)).toBeNull()
    expect(within(painel).queryByRole('link', { name: /Gerar orçamento/ })).toBeNull()
    expect(
      within(painel)
        .queryAllByRole('link')
        .filter((l) => l.getAttribute('href')?.startsWith('/orcamentos')),
    ).toEqual([])
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/acompanhamentos')
    await radar()
    await screen.findAllByRole('link', { name: /Gerar orçamento/ })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('radar de renovações: horizonte', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('abre em 6 meses e troca para 12 e 3; a URL guarda a escolha (6 não aparece)', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/acompanhamentos')
    await radar()
    expect(chamadas('listar_renovacoes').at(-1)).toMatchObject({ p_horizonte_meses: 6 })
    const horizonte = screen.getByRole('group', { name: 'Vencem nos próximos' })
    expect(within(horizonte).getByRole('button', { name: '6 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await usuario.click(within(horizonte).getByRole('button', { name: '12 meses' }))
    expect(router.state.location.search).toBe('?horizonte=12')
    await vi.waitFor(() => {
      expect(chamadas('listar_renovacoes').at(-1)).toMatchObject({ p_horizonte_meses: 12 })
    })

    await usuario.click(within(horizonte).getByRole('button', { name: '3 meses' }))
    expect(router.state.location.search).toBe('?horizonte=3')
    await vi.waitFor(() => {
      expect(chamadas('listar_renovacoes').at(-1)).toMatchObject({ p_horizonte_meses: 3 })
    })

    await usuario.click(within(horizonte).getByRole('button', { name: '6 meses' }))
    expect(router.state.location.search).toBe('')
  })

  it('o horizonte vem do endereço; valor inválido vale 6', async () => {
    renderizarApp('/acompanhamentos?horizonte=12')
    await radar()
    expect(chamadas('listar_renovacoes').at(-1)).toMatchObject({ p_horizonte_meses: 12 })
    expect(screen.getByRole('button', { name: '12 meses' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('valor inválido no endereço vale 6', async () => {
    renderizarApp('/acompanhamentos?horizonte=7')
    await radar()
    expect(chamadas('listar_renovacoes').at(-1)).toMatchObject({ p_horizonte_meses: 6 })
  })
})

describe('plano de renovação: "Gerar orçamento" no "…"', () => {
  it('a Gestão com orçamentos no plano gera pelo "…"', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/renovacoes/i2')
    await screen.findByRole('heading', { level: 1, name: 'Renovação da LAO 2207/2023' })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Gerar orçamento' }))
    expect(router.state.location.pathname).toBe('/orcamentos/novo')
    expect(router.state.location.search).toBe('?renovacao=i2')
  })

  it('a Equipe e a Gestão sem orçamentos no plano não veem o item', async () => {
    for (const [papel, orcamentosNoPlano] of [
      ['equipe', true],
      ['gestao', false],
    ] as const) {
      falso.reiniciar(cenario(papel, { orcamentosNoPlano }))
      const usuario = userEvent.setup()
      const { unmount } = renderizarApp('/renovacoes/i2')
      await screen.findByRole('heading', { level: 1, name: 'Renovação da LAO 2207/2023' })
      await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
      expect(await screen.findByRole('menuitem', { name: 'Triar atividades' })).toBeVisible()
      expect(screen.queryByRole('menuitem', { name: 'Gerar orçamento' })).toBeNull()
      unmount()
    }
  })
})
