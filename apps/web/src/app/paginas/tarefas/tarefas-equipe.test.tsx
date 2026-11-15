// Visão da Equipe nas tarefas de serviço (ADR-0029): vê as tarefas abertas na visão da equipe e no
// calendário, mas só inicia e conclui as próprias; não cancela, não edita e não abre o orçamento
// (custo e margem são da Gestão). A Gestão abre o orçamento pelo calendário.
import { hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function tarefa(id: string, titulo: string, responsavel: string, nome: string) {
  return {
    id,
    orcamento_id: 'o13',
    orcamento_item_id: null,
    orcamento_ano: 2026,
    orcamento_sequencia: 13,
    orcamento_revisao: 1,
    empreendimento_nome: 'Indústria Horizonte',
    titulo,
    responsavel_id: responsavel,
    responsavel_nome: nome,
    minutos_estimados: 240,
    prazo_interno: hoje,
    dias: 0,
    situacao: 'a_fazer',
    fora_da_revisao: false,
    ordem: 1,
    row_version: 1,
  }
}

const tarefas = [
  tarefa('t-ana', 'Relatório de renovação', 'm-ana', 'Ana Ribeiro'),
  tarefa('t-bruno', 'Visitar o empreendimento', 'm-bruno', 'Bruno Kist'),
]

function cenario(papel: 'gestao' | 'equipe'): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel, { membro_id: 'm-ana' })] },
      listar_prazos: (args) => ({ data: args.p_limite === 1 ? [{ total: 0 }] : [] }),
      contar_prazos: {
        data: [{ atrasadas: 0, hoje: 0, proximos_7: 0, sem_responsavel: 0, total: 0 }],
      },
      listar_empreendimentos: { data: [] },
      listar_calendario: { data: [] },
      listar_tarefas_servico: (args) => ({
        data: args.p_responsavel_id
          ? tarefas.filter((t) => t.responsavel_id === args.p_responsavel_id)
          : tarefas,
      }),
      mudar_situacao_tarefa_servico: { data: 2 },
    },
    tabelas: {
      membro: [
        { id: 'm-ana', nome: 'Ana Ribeiro' },
        { id: 'm-bruno', nome: 'Bruno Kist' },
      ],
      instrumento: [],
      unidade: [],
    },
  }
}

function linhaDa(lista: HTMLElement, titulo: string): HTMLElement {
  const item = within(lista).getByText(titulo).closest('li')
  if (!item) throw new Error(`tarefa ${titulo} não encontrada`)
  return item
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

describe('tarefas de serviço na visão da Equipe', () => {
  it('vê as tarefas da equipe, mas só mexe nas próprias e não abre o orçamento', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    renderizarApp('/')

    const secao = await screen.findByRole('region', { name: 'Tarefas de serviço' })
    const lista = await within(secao).findByRole('list')
    const daAna = linhaDa(lista, 'Relatório de renovação')
    const doBruno = linhaDa(lista, 'Visitar o empreendimento')

    expect(within(daAna).getByRole('button', { name: /Iniciar/ })).toBeInTheDocument()
    expect(within(daAna).getByRole('button', { name: /Concluir/ })).toBeInTheDocument()
    expect(within(doBruno).queryByRole('button')).not.toBeInTheDocument()
    expect(within(secao).queryByRole('button', { name: /Cancelar tarefa/ })).not.toBeInTheDocument()
    expect(within(secao).queryByRole('link', { name: /ORC-2026-013/ })).not.toBeInTheDocument()
    expect(within(daAna).getByText(/ORC-2026-013/)).toBeInTheDocument()

    await usuario.click(within(daAna).getByRole('button', { name: /Concluir/ }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('mudar_situacao_tarefa_servico', {
        p_id: 't-ana',
        p_row_version: 1,
        p_para: 'concluida',
      })
    })
  })

  it('"Minhas ações" pede só as tarefas da pessoa', async () => {
    falso.reiniciar(cenario('equipe'))
    const usuario = userEvent.setup()
    renderizarApp('/')
    await screen.findByRole('region', { name: 'Tarefas de serviço' })
    await usuario.click(screen.getByRole('tab', { name: /Minhas ações/ }))

    const secao = await screen.findByRole('region', { name: 'Minhas tarefas de serviço' })
    expect(await within(secao).findByText('Relatório de renovação')).toBeInTheDocument()
    expect(within(secao).queryByText('Visitar o empreendimento')).not.toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_tarefas_servico',
      expect.objectContaining({ p_responsavel_id: 'm-ana', p_abertas: true }) as unknown,
    )
  })

  it('a Gestão vê os botões de cancelar e o link do orçamento', async () => {
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/')
    const secao = await screen.findByRole('region', { name: 'Tarefas de serviço' })
    const lista = await within(secao).findByRole('list')
    const doBruno = linhaDa(lista, 'Visitar o empreendimento')
    expect(within(doBruno).getByRole('button', { name: /Cancelar tarefa/ })).toBeInTheDocument()
    expect(within(doBruno).getByRole('link', { name: 'ORC-2026-013' })).toHaveAttribute(
      'href',
      '/orcamentos/o13',
    )
  })
})

describe('tarefas de serviço no calendário', () => {
  it('Equipe vê a tarefa pelo prazo interno, sem link para o orçamento', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/calendario')
    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    const evento = (await within(tabela).findByText('Relatório de renovação')).parentElement
    if (!evento) throw new Error('evento da tarefa não encontrado')
    expect(within(evento).getByText('Serviço')).toBeInTheDocument()
    expect(evento.closest('a')).toBeNull()
  })

  it('Gestão abre o orçamento pela tarefa no calendário', async () => {
    falso.reiniciar(cenario('gestao'))
    renderizarApp('/calendario')
    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    const texto = await within(tabela).findByText('Relatório de renovação')
    expect(texto.closest('a')).toHaveAttribute('href', '/orcamentos/o13')
  })
})

describe('orçamento para a Equipe', () => {
  it('a Equipe não abre o orçamento (custo e margem são da Gestão)', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/orcamentos/o13')
    expect(
      await screen.findByText('Orçamentos têm custo e margem: por enquanto, só a gestão acessa.'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('obter_orcamento', expect.anything())
  })
})
