// Aprovação do orçamento com tarefas (ADR-0029; Protótipo 22): o aceite é obrigatório, o roteiro
// vem dos serviços (responsável, horas e fim do mês previsto) e é editável; a falha do banco
// aparece sem fechar o diálogo; depois de aprovado, as tarefas aparecem no orçamento.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const tarefaGravada = {
  id: 't1',
  orcamento_id: 'o13',
  orcamento_item_id: 'i1',
  orcamento_ano: 2026,
  orcamento_sequencia: 13,
  orcamento_revisao: 1,
  empreendimento_nome: 'Indústria Horizonte',
  titulo: 'Relatório de renovação',
  responsavel_id: 'm-ana',
  responsavel_nome: 'Ana Ribeiro',
  minutos_estimados: 600,
  prazo_interno: '2026-12-31',
  dias: 47,
  situacao: 'a_fazer',
  fora_da_revisao: false,
  ordem: 1,
  row_version: 1,
}

function servidor(opcoes: { erroAoAprovar?: string } = {}): Cenario {
  let aprovado = false
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      obter_identidade_da_consultoria: { data: null },
      carga_da_equipe: { data: { jornada: [], comprometido: [] } },
      obter_orcamento: () => ({ data: orcamento(aprovado ? 'aprovada' : 'enviada') }),
      listar_tarefas_servico: () => ({ data: aprovado ? [tarefaGravada] : [] }),
      listar_aceites_do_orcamento: () => ({
        data: aprovado
          ? [
              {
                revisao: 1,
                aprovado_por: 'Sr. Horizonte',
                data_aceite: '2026-11-14',
                referencia: 'e-mail de hoje',
                metodo: 'email',
                conteudo_sha256: 'a'.repeat(64),
                registrado_por_nome: 'Eduardo Karnopp',
                registrado_em: '2026-11-14T12:00:00Z',
              },
            ]
          : [],
      }),
      aprovar_orcamento: () => {
        if (opcoes.erroAoAprovar) return { error: { message: opcoes.erroAoAprovar } }
        aprovado = true
        return { data: 4 }
      },
    },
    tabelas: { membro: membros },
  }
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
}

beforeEach(() => {
  falso.reiniciar(servidor())
  window.history.pushState({}, '', '/')
})

async function abrirAprovacao() {
  const usuario = userEvent.setup()
  renderizarApp('/orcamentos/o13')
  await usuario.click(await screen.findByRole('button', { name: 'Registrar aprovação' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Registrar aprovação' })
  await within(dialogo).findByRole('list', { name: 'Roteiro de tarefas' })
  return { usuario, dialogo }
}

describe('aprovação do orçamento com tarefas', () => {
  it('monta o roteiro pelos serviços, exige o aceite e grava tudo de uma vez', async () => {
    const { usuario, dialogo } = await abrirAprovacao()

    // Roteiro: uma tarefa por serviço, com o responsável, as horas e o fim do mês previsto.
    expect(within(dialogo).getByLabelText('Tarefa 1')).toHaveValue('Relatório de renovação')
    expect(within(dialogo).getByLabelText('Tarefa 2')).toHaveValue('Protocolo no órgão')
    const [responsavel1] = within(dialogo).getAllByLabelText('Responsável')
    expect(responsavel1).toHaveValue('m-ana')
    const [horas1, horas2] = within(dialogo).getAllByLabelText('Horas')
    expect(horas1).toHaveValue('10')
    expect(horas2).toHaveValue('')
    expect(within(dialogo).getAllByLabelText('Prazo interno')[0]).toHaveValue('31/12/2026')
    expect(within(dialogo).getByText(/2 tarefas · 10h estimadas · 1 sem horas/)).toBeInTheDocument()

    // Sem aceite, nada é enviado.
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }))
    expect(within(dialogo).getByText('Informe quem aprovou')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe a referência')).toBeInTheDocument()
    expect(chamadas('aprovar_orcamento')).toHaveLength(0)

    // Uma tarefa a mais, à mão; a do protocolo sai.
    await usuario.type(within(dialogo).getByLabelText('Quem aprovou'), 'Sr. Horizonte')
    await usuario.type(within(dialogo).getByLabelText('Referência'), 'e-mail de hoje')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Remover a tarefa 2' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Adicionar tarefa' }))
    await usuario.type(within(dialogo).getByLabelText('Tarefa 2'), 'Visitar o empreendimento')
    const [, horasDaNova] = within(dialogo).getAllByLabelText('Horas')
    if (!horasDaNova) throw new Error('campo de horas da tarefa nova não encontrado')
    await usuario.type(horasDaNova, '4')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }))

    await waitFor(() => {
      expect(chamadas('aprovar_orcamento')).toHaveLength(1)
    })
    const [args] = chamadas('aprovar_orcamento')
    expect(args).toMatchObject({
      p_id: 'o13',
      p_row_version: 3,
      p_aprovado_por: 'Sr. Horizonte',
      p_referencia: 'e-mail de hoje',
      p_metodo: null,
      p_gerar_tarefas: true,
      p_tarefas: [
        {
          item_id: 'i1',
          titulo: 'Relatório de renovação',
          responsavel_id: 'm-ana',
          minutos: 600,
          prazo_interno: '2026-12-31',
        },
        {
          item_id: null,
          titulo: 'Visitar o empreendimento',
          responsavel_id: null,
          minutos: 240,
          prazo_interno: null,
        },
      ],
    })

    // Depois de aprovar: as tarefas e o aceite aparecem no orçamento.
    const secao = await screen.findByRole('region', { name: 'Tarefas da execução' })
    expect(await within(secao).findByText('Relatório de renovação')).toBeInTheDocument()
    expect(within(secao).getByText(/Ana Ribeiro · Prazo 31\/12\/2026/)).toBeInTheDocument()
    expect(
      await within(secao).findByText(/Aceite: Sr. Horizonte em 14\/11\/2026/),
    ).toBeInTheDocument()
  })

  it('mostra a falha do banco sem fechar o diálogo', async () => {
    falso.reiniciar(servidor({ erroAoAprovar: 'conflito_de_versao' }))
    const { usuario, dialogo } = await abrirAprovacao()
    await usuario.type(within(dialogo).getByLabelText('Quem aprovou'), 'Sr. Horizonte')
    await usuario.type(within(dialogo).getByLabelText('Referência'), 'WhatsApp')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }))

    expect(await within(dialogo).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Registrar aprovação' })).toBeInTheDocument()
    expect(chamadas('aprovar_orcamento')).toHaveLength(1)
  })

  it('aprova sem gerar tarefas quando a caixa é desmarcada', async () => {
    const { usuario, dialogo } = await abrirAprovacao()
    await usuario.type(within(dialogo).getByLabelText('Quem aprovou'), 'Sr. Horizonte')
    await usuario.type(within(dialogo).getByLabelText('Referência'), 'Reunião')
    await usuario.click(within(dialogo).getByLabelText('Gerar tarefas com a aprovação'))
    expect(
      within(dialogo).queryByRole('list', { name: 'Roteiro de tarefas' }),
    ).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }))
    await waitFor(() => {
      expect(chamadas('aprovar_orcamento')).toHaveLength(1)
    })
    expect(chamadas('aprovar_orcamento')[0]).toMatchObject({
      p_gerar_tarefas: false,
      p_tarefas: [],
    })
  })
})
