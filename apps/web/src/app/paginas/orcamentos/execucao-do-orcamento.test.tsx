// Execução do orçamento aprovado (P7, ADR-0053): horas orçadas e lançadas por serviço, lançar horas;
// quem tem a permissão financeira registra e estorna recebimentos; sem ela, o dinheiro não aparece.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

type Linha = Record<string, unknown>

const membros = [
  { id: 'm-Filtroville', nome: 'Eduardo Karnopp', papel: 'gestao', cargo: null, foto: null },
  { id: 'm-ana', nome: 'Ana Ribeiro', papel: 'equipe', cargo: null, foto: null },
]

function item(id: string, descricao: string, extra: Linha = {}): Linha {
  return {
    id,
    descricao,
    minutos: 0,
    preco_automatico: true,
    preco_centavos: 100_000,
    custo_direto_extra_centavos: 0,
    hora_venda_id: null,
    responsavel_id: null,
    mes_previsto: null,
    preco_fechado_centavos: 100_000,
    ...extra,
  }
}

function orcamento(situacao: string): Linha {
  return {
    id: 'o13',
    consultoria_id: 'c-Filtroville',
    ano: 2026,
    sequencia: 13,
    revisao: 1,
    situacao,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    prospecto: null,
    objeto: 'Renovação da LAO',
    destinatario: null,
    prazos: null,
    validade_dias: 30,
    premissas: [],
    exclusoes: [],
    moeda: 'BRL',
    margem_pb: null,
    forma_preco: 'margem',
    visitas: { quantidade: 0, km_por_visita: 0, outros_por_visita_centavos: 0 },
    preco_visitas_centavos: 0,
    base: null,
    atualizado_em: '2026-11-14T10:00:00Z',
    row_version: 3,
    historico_situacao: [],
    itens: [
      item('i1', 'Relatório de renovação', {
        minutos: 600,
        responsavel_id: 'm-ana',
        mes_previsto: '2026-12-01',
      }),
      item('i2', 'Protocolo no órgão'),
    ],
    despesas: [],
    parcelas: [],
  }
}

const execucao = {
  financeiro: true,
  itens: [
    { id: 'i1', descricao: 'Relatório de renovação', orcado_minutos: 600, lancado_minutos: 90 },
    { id: 'i2', descricao: 'Protocolo no órgão', orcado_minutos: 60, lancado_minutos: 120 },
  ],
  apontamentos: [
    {
      id: 'a1',
      data: '2026-11-18',
      minutos: 90,
      nota: 'Visita',
      membro_id: 'm-ana',
      membro_nome: 'Ana Ribeiro',
      item_id: 'i1',
    },
  ],
  parcelas: [
    {
      id: 'p1',
      descricao: 'Aceite',
      valor_centavos: 100_000,
      recebido_centavos: 100_000,
      vence_em: '2026-11-14',
      recebimentos: [
        {
          id: 'r1',
          valor_centavos: 100_000,
          recebido_em: '2026-11-15',
          nota: null,
          estornado: false,
          row_version: 1,
        },
      ],
    },
    {
      id: 'p2',
      descricao: 'Protocolo',
      valor_centavos: 100_000,
      recebido_centavos: 0,
      vence_em: '2026-11-20',
      recebimentos: [],
    },
  ],
}

function servidor(extra: Cenario['rpc'] = {}, dados: object = execucao): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      obter_identidade_da_consultoria: { data: null },
      carga_da_equipe: { data: { jornada: [], comprometido: [] } },
      obter_orcamento: { data: orcamento('aprovada') },
      listar_tarefas_servico: { data: [] },
      listar_aceites_do_orcamento: { data: [] },
      execucao_do_orcamento: { data: dados },
      ...extra,
    },
    tabelas: { membro: membros },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T12:00:00-03:00') })
  falso.reiniciar(servidor())
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
})

async function secao() {
  renderizarApp('/orcamentos/o13')
  return screen.findByRole('region', { name: 'Execução' })
}

describe('execução do orçamento aprovado', () => {
  it('mostra orçado, lançado e o estouro por serviço', async () => {
    const execucaoNaTela = await secao()
    const linha = within(execucaoNaTela).getByRole('row', { name: /Protocolo no órgão/ })
    expect(linha).toHaveTextContent('Estouro 1h')
    expect(within(execucaoNaTela).getByRole('row', { name: /Total/ })).toHaveTextContent('3h30')
    expect(within(execucaoNaTela).getByText(/Ana Ribeiro/)).toBeInTheDocument()
  })

  it('lança horas no serviço escolhido', async () => {
    falso.reiniciar(servidor({ lancar_horas: { data: null } }))
    const usuario = userEvent.setup()
    const execucaoNaTela = await secao()
    await usuario.click(within(execucaoNaTela).getByRole('button', { name: 'Lançar horas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Lançar horas' })
    await usuario.selectOptions(within(dialogo).getByRole('combobox', { name: 'Serviço' }), 'i2')
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Duração' }), '1h30')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'lancar_horas',
        expect.objectContaining({
          p_orcamento_id: 'o13',
          p_orcamento_item_id: 'i2',
          p_minutos: 90,
          p_data: '2026-11-21',
        }),
      )
    })
  })

  it('duração fora de 1 min a 24 h não é lançada', async () => {
    const usuario = userEvent.setup()
    const execucaoNaTela = await secao()
    await usuario.click(within(execucaoNaTela).getByRole('button', { name: 'Lançar horas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Lançar horas' })
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Duração' }), '25h')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    expect(within(dialogo).getByText('Informe de 1 min a 24 h.')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('lancar_horas', expect.anything())
  })

  it('parcelas com a situação em palavra; registra e estorna recebimento', async () => {
    falso.reiniciar(
      servidor({ registrar_recebimento: { data: null }, estornar_recebimento: { data: 2 } }),
    )
    const usuario = userEvent.setup()
    const execucaoNaTela = await secao()
    const parcelas = within(execucaoNaTela).getByRole('list', { name: 'Parcelas' })
    expect(within(parcelas).getByText('Recebida')).toBeInTheDocument()
    expect(within(parcelas).getByText('Vencida')).toBeInTheDocument()
    expect(execucaoNaTela).toHaveTextContent('Vencido R$ 1.000,00')

    await usuario.click(
      within(parcelas).getByRole('button', { name: 'Registrar recebimento: Protocolo' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Recebimento: Protocolo' })
    expect(within(dialogo).getByRole('textbox', { name: 'Valor recebido' })).toHaveValue(
      'R$ 1.000,00',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'registrar_recebimento',
        expect.objectContaining({ p_parcela_id: 'p2', p_valor_centavos: 100_000 }),
      )
    })

    await usuario.click(
      within(parcelas).getByRole('button', { name: 'Estornar R$ 1.000,00 de 15/11/2026' }),
    )
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('estornar_recebimento', {
        p_id: 'r1',
        p_row_version: 1,
      })
    })
  })

  it('sem a permissão financeira, a parte de dinheiro não aparece', async () => {
    falso.reiniciar(servidor({}, { ...execucao, financeiro: false, parcelas: null }))
    const execucaoNaTela = await secao()
    expect(within(execucaoNaTela).queryByRole('list', { name: 'Parcelas' })).toBeNull()
    expect(within(execucaoNaTela).queryByText(/A receber/)).toBeNull()
  })

  it('erro ao carregar aparece', async () => {
    falso.reiniciar(servidor({ execucao_do_orcamento: { error: { message: 'sem_permissao' } } }))
    renderizarApp('/orcamentos/o13')
    expect(await screen.findByText('Não foi possível carregar a execução.')).toBeInTheDocument()
  })
})
