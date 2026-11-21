// Rascunho do orçamento da renovação de uma LAO (ADR-0044): /orcamentos/novo?renovacao=<licença>,
// sem diálogo. Taxa do órgão sugerida (fase LAO, só no IMA) e editável antes de criar.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reiniciarTempoAtivo, terminarTarefa } from '@/app/consultoria/tempo-ativo'
import { CHAVE_DO_NOVO_ORCAMENTO } from '@/app/paginas/orcamentos/criar-rascunho'
import { digitarReais } from '@/test/digitar'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const LICENCA = '7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a'
const ENDERECO = `/orcamentos/novo?renovacao=${LICENCA}`

function plano(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    consultoria_id: 'c-Filtroville',
    instrumento_id: LICENCA,
    licenca: 'LAO 4821/2023',
    orgao: 'IMA',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    validade: '2027-03-26',
    dias_limite_protocolo: 120,
    antecedencia_dias: 30,
    protocolado_em: null,
    protocolo_numero: null,
    acompanhamento_dias: null,
    comprovante_caminho: null,
    comprovante_nome: null,
    comprovante_tamanho: null,
    registrado_por_nome: null,
    registrado_em: null,
    hoje: '2026-11-20',
    row_version: 1,
    ...extra,
  }
}

const USINAGEM = {
  id: 'a1',
  codigo: '12.80.10',
  descricao: 'Serviço industrial de usinagem com pintura',
  porte: 'medio',
  potencial: 'M',
  medidas: { 'AU(3)': 0.5 },
  fonte: 'Resolução CONSEMA 250/2024, consolidada até a Resolução CONSEMA 314/2026',
  registrado_em: '2026-11-19T12:00:00Z',
  row_version: 1,
}

function cenario({
  papel = 'gestao',
  orgao = 'IMA',
  existente = null,
  rpc = {},
}: {
  papel?: 'gestao' | 'equipe'
  orgao?: string | null
  existente?: Record<string, unknown> | null
  rpc?: Cenario['rpc']
} = {}): Cenario {
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      obter_plano_renovacao: { data: [plano({ orgao })] },
      criar_orcamento_de_renovacao: { data: 'o-renovacao' },
      ...rpc,
    },
    tabelas: {
      orcamento: existente ? [existente] : [],
      atividade_licenciada: [USINAGEM],
    },
  }
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
}

async function campoDaTaxa() {
  return screen.findByRole('textbox', { name: 'Taxa do órgão (R$)' })
}

beforeEach(() => {
  reiniciarTempoAtivo()
  falso.reiniciar(cenario())
})

describe('Novo orçamento da renovação', () => {
  it('mostra licença, cliente e objeto, com a taxa do IMA (fase LAO) já preenchida', async () => {
    renderizarApp(ENDERECO)
    expect(await campoDaTaxa()).toHaveValue('5.620,79')
    expect(screen.getByRole('heading', { level: 1, name: 'Novo orçamento' })).toBeVisible()
    const resumo = screen.getByRole('region', { name: 'Renovação' })
    expect(within(resumo).getByRole('link', { name: 'LAO 4821/2023' })).toHaveAttribute(
      'href',
      `/renovacoes/${LICENCA}`,
    )
    expect(within(resumo).getByText('Metalúrgica Rio Cubatão')).toBeInTheDocument()
    expect(within(resumo).getByText('Renovação da LAO 4821/2023')).toBeInTheDocument()
    const atividades = within(resumo).getByRole('list', { name: 'Atividades da licença' })
    expect(atividades).toHaveTextContent('12.80.10')
    expect(atividades).toHaveTextContent('potencial M')
    expect(chamadas('criar_orcamento_de_renovacao')).toHaveLength(0)
  })

  it('para outro órgão, a taxa vem vazia', async () => {
    falso.reiniciar(cenario({ orgao: 'SAMA' }))
    renderizarApp(ENDERECO)
    expect(await campoDaTaxa()).toHaveValue('')
  })

  it('a Gestão edita a taxa e cria: o banco recebe a taxa e o editor abre', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp(ENDERECO)
    const campo = await campoDaTaxa()
    await usuario.clear(campo)
    await digitarReais(usuario, campo, '4500,5')
    expect(campo).toHaveValue('4.500,5')

    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/o-renovacao')
    })
    expect(chamadas('criar_orcamento_de_renovacao')).toEqual([
      {
        p_id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        p_consultoria_id: 'c-Filtroville',
        p_instrumento_id: LICENCA,
        p_taxa_centavos: 450050,
      },
    ])
    // Só a RPC da renovação: nada de criar_orcamento nem de enviar.
    expect(chamadas('criar_orcamento')).toHaveLength(0)
  })

  it('taxa vazia vai sem valor (despesa a cotar)', async () => {
    falso.reiniciar(cenario({ orgao: null }))
    const usuario = userEvent.setup()
    renderizarApp(ENDERECO)
    expect(await campoDaTaxa()).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    await vi.waitFor(() => {
      expect(chamadas('criar_orcamento_de_renovacao')).toHaveLength(1)
    })
    expect(chamadas('criar_orcamento_de_renovacao')[0]).not.toHaveProperty('p_taxa_centavos')
  })

  it('licença que já tem orçamento vivo abre direto o editor dele', async () => {
    falso.reiniciar(
      cenario({ existente: { id: 'o7', ano: 2026, sequencia: 7, situacao: 'enviada' } }),
    )
    const { router } = renderizarApp(ENDERECO)
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/o7')
    })
    expect(chamadas('criar_orcamento_de_renovacao')).toHaveLength(0)
    // Nenhum "Novo orçamento" fica contando tempo ativo para o próximo orçamento herdar.
    expect(terminarTarefa(CHAVE_DO_NOVO_ORCAMENTO)).toBeNull()
  })

  it('orçamento recusado ou na lixeira depois de aberto não volta pelo cache', async () => {
    falso.reiniciar(
      cenario({ existente: { id: 'o7', ano: 2026, sequencia: 7, situacao: 'rascunho' } }),
    )
    const { router } = renderizarApp(ENDERECO)
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/o7')
    })

    // No editor, o o7 foi recusado (ou foi para a lixeira): a licença ficou sem orçamento vivo.
    falso.reiniciar(cenario())
    await router.navigate(ENDERECO)

    expect(await campoDaTaxa()).toBeVisible()
    expect(router.state.location.pathname).toBe('/orcamentos/novo')
  })

  it('sem orçamento vivo, o tempo ativo de Novo orçamento começa', async () => {
    renderizarApp(ENDERECO)
    await campoDaTaxa()
    expect(terminarTarefa(CHAVE_DO_NOVO_ORCAMENTO)).toBe(0)
  })

  it('erro ao criar aparece na tela e o botão volta', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          criar_orcamento_de_renovacao: {
            error: { message: 'licenca_sem_renovacao', code: 'P0001' },
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp(ENDERECO)
    await campoDaTaxa()
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta licença não está no radar de renovação.',
    )
    expect(screen.getByRole('button', { name: 'Criar rascunho' })).toBeEnabled()
    expect(router.state.location.pathname).toBe('/orcamentos/novo')
  })

  it('licença sem plano de renovação', async () => {
    falso.reiniciar(cenario({ rpc: { obter_plano_renovacao: { data: [] } } }))
    renderizarApp(ENDERECO)
    expect(await screen.findByText('Licença fora do radar de renovação')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar rascunho' })).toBeNull()
  })

  it('erro ao carregar oferece tentar de novo', async () => {
    falso.reiniciar(
      cenario({ rpc: { obter_plano_renovacao: { error: { message: 'falhou', code: '500' } } } }),
    )
    renderizarApp(ENDERECO)
    expect(await screen.findByText('Não foi possível carregar a licença.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('a Equipe não acessa', async () => {
    falso.reiniciar(cenario({ papel: 'equipe' }))
    renderizarApp(ENDERECO)
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Taxa do órgão (R$)' })).toBeNull()
  })

  it('renovacao que não é uuid cai na tela de sempre', async () => {
    renderizarApp('/orcamentos/novo?renovacao=abc')
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Taxa do órgão (R$)' })).toBeNull()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp(ENDERECO)
    await campoDaTaxa()
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
