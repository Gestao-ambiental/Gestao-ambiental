import { hojeNoFuso, inicioDoMes, rotuloDoMes } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { digitarReais } from '@/test/digitar'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import {
  calcularOrcamento,
  lerDias,
  lerEstimativa,
  lerHoras,
  lerPercentual,
  textoDoPercentual,
} from './calculo'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

/** Membros ativos (tabela membro), para a equipe de Custos e taxas e o responsável do serviço. */
const membros = [
  {
    id: 'm-eduardo',
    nome: 'Eduardo Karnopp',
    papel: 'gestao',
    cargo: null,
    profissao: 'eng_ambiental_sanitarista',
    foto: null,
  },
  {
    id: 'm-helena',
    nome: 'Helena Costa',
    papel: 'equipe',
    cargo: null,
    profissao: 'biologo',
    foto: null,
  },
]

// Exemplo da auditoria de 10/11/2026: hora R$ 95, custo fixo R$ 30/h (9.600 ÷ 320), margem 30%,
// mínima 25%, tributos 6%, Pix R$ 1,99 por parcela e R$ 4,00 por documento assinado. Visita
// técnica R$ 150 e R$ 1,20 por km (fatia 2).
const base = {
  hora_tecnica_centavos: 9_500,
  custo_fixo_hora_centavos: 3_000,
  margem_desejada_pb: 3_000,
  margem_minima_pb: 2_500,
  tributos_pb: 600,
  taxas_pb: 0,
  taxa_por_cobranca_centavos: 199,
  taxa_por_assinatura_centavos: 400,
  valor_visita_centavos: 15_000,
  custo_km_centavos: 120,
  custos_fixos_mensais_centavos: 960_000,
  custos_fixos_equipe_centavos: 0,
  custos_fixos_detalhe: [
    { descricao: 'Aluguel e condomínio', valor_centavos: 800_000 },
    { descricao: 'Energia elétrica', valor_centavos: 100_000 },
    { descricao: 'Internet e telefone', valor_centavos: 60_000 },
  ],
  horas_venda: [
    { id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valor_centavos: 9_500 },
  ],
  custo_hora_profissao: [],
  custo_hora_membro: [],
  registrada_em: '2026-11-06T19:00:00Z',
}

function orcamento(extra: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    consultoria_id: 'c-Filtroville',
    ano: 2026,
    sequencia: 41,
    revisao: 1,
    situacao: 'rascunho',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    objeto: 'Licenciamento (LO)',
    destinatario: 'Marina Couto',
    prazos: null,
    validade_dias: 30,
    premissas: ['Uma visita técnica'],
    exclusoes: [],
    moeda: 'BRL',
    margem_pb: null,
    forma_preco: 'margem',
    visitas: { quantidade: 0, km_por_visita: 0, outros_por_visita_centavos: 0 },
    preco_visitas_centavos: 0,
    base,
    atualizado_em: '2026-11-06T19:42:00Z',
    row_version: 3,
    itens: [
      {
        id: 'i1',
        hora_venda_id: 'venda',
        descricao: 'Visita técnica e diagnóstico',
        minutos: 480,
        preco_automatico: false,
        preco_centavos: 170_000,
        custo_direto_extra_centavos: 24_000,
      },
      {
        id: 'i2',
        hora_venda_id: 'venda',
        descricao: 'RCA/PCA e PGRS',
        minutos: 1_440,
        preco_automatico: false,
        preco_centavos: 510_000,
        custo_direto_extra_centavos: 26_000,
      },
      {
        id: 'i3',
        hora_venda_id: 'venda',
        descricao: 'Protocolo e acompanhamento',
        minutos: 600,
        preco_automatico: false,
        preco_centavos: 210_000,
        custo_direto_extra_centavos: 0,
      },
    ],
    despesas: [
      {
        id: 'd1',
        descricao: 'Taxa do órgão ambiental',
        estimativa_centavos: 341_200,
        tratamento: 'cliente_direto',
      },
    ],
    parcelas: [
      { id: 'p1', descricao: 'Assinatura do contrato', dias: 3, percentual_pb: 4_000 },
      { id: 'p2', descricao: 'Protocolo no órgão', dias: 5, percentual_pb: 3_000 },
      { id: 'p3', descricao: 'Emissão da licença', dias: 0, percentual_pb: 3_000 },
    ],
    ...extra,
  }
}

function cenario(papel: 'gestao' | 'equipe' = 'gestao', extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_orcamentos: {
        data: [
          {
            id: 'o1',
            ano: 2026,
            sequencia: 41,
            revisao: 1,
            situacao: 'rascunho',
            empreendimento_id: 'e1',
            empreendimento_nome: 'Indústria Horizonte',
            objeto: 'Licenciamento (LO)',
            total_centavos: 890_000,
            atualizado_em: '2026-11-06T19:42:00Z',
            total: 1,
          },
        ],
      },
      obter_orcamento: { data: orcamento() },
      salvar_orcamento: { data: 4 },
      obter_base_de_custos: { data: null },
      ...extra.rpc,
    },
    tabelas: { ...extra.tabelas },
  }
}

const baseDoCalculo = {
  horaTecnicaCentavos: 9_500,
  custoFixoHoraCentavos: 3_000,
  margemDesejadaPb: 3_000,
  margemMinimaPb: 2_500,
  tributosPb: 600,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 199,
  taxaPorAssinaturaCentavos: 400,
  valorVisitaCentavos: 15_000,
  custoKmCentavos: 120,
  // Orçamento antigo, sem modo: soma visita e km, como na época.
  deslocamentoModo: null,
  custosFixosMensaisCentavos: 960_000,
  custosFixosEquipeCentavos: 0,
  contas: [
    { descricao: 'Aluguel e condomínio', valorCentavos: 800_000 },
    { descricao: 'Energia elétrica', valorCentavos: 100_000 },
    { descricao: 'Internet e telefone', valorCentavos: 60_000 },
  ],
  horasVenda: [
    {
      id: 'venda',
      profissao: 'Engenheiro',
      atividade: 'Venda',
      valorCentavos: 9_500,
      fonte: null,
      unidade: 'hora' as const,
      minutosPorUnidade: null,
      faixas: [],
      minimoCentavos: null,
    },
  ],
  custoHoraPorProfissao: [],
  custoHoraPorMembro: [],
}

const semVisitas = { quantidade: 0, kmPorVisita: 0, outrosPorVisitaCentavos: 0 }
const tresItens = [
  { minutos: 480, custoDiretoExtraCentavos: 24_000, horaVendaId: 'venda' }, // 760 + 240 + 240 = 1.240
  { minutos: 1_440, custoDiretoExtraCentavos: 26_000, horaVendaId: 'venda' }, // 2.280 + 260 + 720 = 3.260
  { minutos: 600, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' }, // 950 + 300 = 1.250
]

/**
 * Base nova (ADR-0019, P3): tributos digitados (vazio não vira zero) e margens pré-preenchidas
 * confirmadas antes de salvar.
 */
async function confirmarBaseNova(usuario: ReturnType<typeof userEvent.setup>) {
  const tributos = screen.getByLabelText('Tributos sobre o faturamento (%)')
  if ((tributos as HTMLInputElement).value === '') await usuario.type(tributos, '0')
  const confirmar = screen.getByLabelText('Confirmo que estas margens são da minha consultoria')
  if (!(confirmar as HTMLInputElement).checked) await usuario.click(confirmar)
}

describe('cálculo da tela de orçamento (margem única no fim)', () => {
  it('reproduz o exemplo conferido: R$ 7.803,16 repartido pelo custo de cada serviço', () => {
    const c = calcularOrcamento(
      tresItens,
      semVisitas,
      [],
      [4_000, 3_000, 3_000],
      3_000,
      baseDoCalculo,
    )
    expect(c.custoTotalCentavos).toBe(575_000)
    expect(c.fixosPorCobrancaCentavos).toBe(997)
    // Acréscimo de 30% sobre trabalho e contas, com tributos e taxas separados.
    expect(c.precoTotalCentavos).toBe(780_316)
    expect(c.precosDosItens).toEqual([168_277, 442_405, 169_634])
    expect(c.situacaoDaMargem).toBe('adequada')
    expect(c.parcelasCentavos).toEqual([312_126, 234_095, 234_095])
  })

  it('a margem escolhida no fim muda o preço; abaixo da mínima avisa', () => {
    const c = calcularOrcamento(tresItens, semVisitas, [], [10_000], 2_000, baseDoCalculo)
    // Acréscimo de 20% sobre trabalho e contas, com tributos e taxas separados.
    expect(c.precoTotalCentavos).toBe(724_041)
    expect(c.situacaoDaMargem).toBe('abaixo_da_minima')
  })

  it('visitas têm preço fixo, sem margem, numa linha própria', () => {
    const c = calcularOrcamento(
      [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' }],
      { quantidade: 2, kmPorVisita: 50, outrosPorVisitaCentavos: 1_000 },
      [],
      [10_000],
      2_000,
      baseDoCalculo,
    )
    // Visitas por R$ 440 fixos; os tributos sobre elas são cobertos nos serviços.
    expect(c.valorVisitasCentavos).toBe(44_000)
    expect(c.precoTotalCentavos).toBe(63_403)
    expect(c.precosDosItens).toEqual([19_403])
    expect(c.precoVisitasCentavos).toBe(44_000)
  })

  it('mostra quanto o orçamento cobre de cada conta do mês', () => {
    const c = calcularOrcamento(tresItens, semVisitas, [], [10_000], 3_000, baseDoCalculo)
    // Rateio: 42h × 30 = 1.260, repartido 8.000 : 1.000 : 600
    expect(c.contas).toEqual([
      { descricao: 'Aluguel e condomínio', valorCentavos: 105_000 },
      { descricao: 'Energia elétrica', valorCentavos: 13_125 },
      { descricao: 'Internet e telefone', valorCentavos: 7_875 },
    ])
    expect(c.divisao?.contasDaConsultoriaCentavos).toBe(126_000)
  })

  it('despesa incluída a cotar deixa o preço pendente', () => {
    const c = calcularOrcamento(tresItens, semVisitas, [null], [10_000], 3_000, baseDoCalculo)
    expect(c.pendencia).toBe('despesa_a_cotar')
    expect(c.precoTotalCentavos).toBeNull()
    expect(c.parcelasCentavos).toEqual([])
    expect(c.situacaoDaMargem).toBe('pendente')
  })

  it('sem base de custos ou sem itens, não há preço', () => {
    expect(calcularOrcamento(tresItens, semVisitas, [], [10_000], 3_000, null).pendencia).toBe(
      'sem_base',
    )
    expect(calcularOrcamento([], semVisitas, [], [], 3_000, baseDoCalculo).pendencia).toBe(
      'sem_itens',
    )
  })

  it('lê horas e percentuais digitados', () => {
    expect(lerHoras('8,5')).toBe(8.5)
    expect(lerHoras('')).toBe(0)
    expect(lerHoras('abc')).toBeNull()
    expect(lerPercentual('33,33')).toBe(3_333)
    expect(lerPercentual('101')).toBeNull()
    expect(textoDoPercentual(3_333)).toBe('33,33')
    expect(textoDoPercentual(4_000)).toBe('40')
    expect(lerDias('')).toBe(0)
    expect(lerDias('366')).toBeNull()
    expect(lerEstimativa('')).toBeNull()
    expect(lerEstimativa('1.180,00')).toBe(118_000)
    expect(lerEstimativa('abc')).toBeUndefined()
  })
})

describe('orçamentos (onda 5)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('a Equipe vê "sem permissão" e não chama o banco', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/orcamentos')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('a Gestão vê a lista com número, valor e situação', async () => {
    renderizarApp('/orcamentos')
    const tabela = await screen.findByRole('table')
    const linha = within(tabela).getByRole('row', { name: /Indústria Horizonte/ })
    expect(within(linha).getByText('ORC-2026-041')).toBeInTheDocument()
    expect(within(linha).getByText('8.900,00')).toBeInTheDocument()
    expect(within(linha).getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByText('1 orçamento')).toBeInTheDocument()
  })

  it('exclui com confirmação (menos aprovado) e restaura pela lixeira', async () => {
    const linha = (id: string, sequencia: number, situacao: string, objeto: string) => ({
      id,
      ano: 2026,
      sequencia,
      revisao: 1,
      situacao,
      empreendimento_id: 'e1',
      empreendimento_nome: 'Indústria Horizonte',
      objeto,
      total_centavos: 890_000,
      atualizado_em: '2026-11-06T19:42:00Z',
      excluido_em: null,
      row_version: 3,
      total: 2,
    })
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_orcamentos: (args: { p_lixeira?: boolean }) =>
            args.p_lixeira
              ? {
                  data: [
                    {
                      ...linha('o1', 41, 'rascunho', 'Licenciamento (LO)'),
                      excluido_em: '2026-11-12T15:00:00Z',
                      row_version: 4,
                      total: 1,
                    },
                  ],
                }
              : {
                  data: [
                    linha('o1', 41, 'rascunho', 'Licenciamento (LO)'),
                    linha('o2', 40, 'aprovada', 'Laudo de ruído'),
                  ],
                },
          excluir_orcamento: { data: 4 },
          restaurar_orcamento: { data: 5 },
        },
      }),
    )
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/orcamentos')
    const tabela = await screen.findByRole('table')
    const acessibilidade = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(acessibilidade.violations.map((v) => v.id)).toEqual([])
    // Aprovado não vai para a lixeira: não tem o botão.
    expect(
      within(tabela).queryByRole('button', { name: 'Excluir orçamento ORC-2026-040' }),
    ).toBeNull()
    await usuario.click(
      within(tabela).getByRole('button', { name: 'Excluir orçamento ORC-2026-041' }),
    )
    const dialogo = screen.getByRole('dialog', { name: 'Excluir orçamento?' })
    expect(dialogo).toHaveTextContent('vai para a lixeira. Dá para restaurar depois.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('excluir_orcamento', {
      p_id: 'o1',
      p_row_version: 3,
    })
    expect(await screen.findByText('ORC-2026-041 foi para a lixeira.')).toBeInTheDocument()

    // Lixeira e configurações ficam no menu "…" do cabeçalho (uma ação principal por tela).
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Lixeira' }))
    expect(
      await screen.findByRole('heading', { name: 'Lixeira de orçamentos' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_orcamentos',
      expect.objectContaining({ p_lixeira: true }),
    )
    // Tabela (desktop) e cartões (celular) estão no DOM: usa o primeiro.
    const [restaurar] = await screen.findAllByRole('button', { name: 'Restaurar ORC-2026-041' })
    if (!restaurar) throw new Error('sem botão Restaurar')
    await usuario.click(restaurar)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('restaurar_orcamento', {
      p_id: 'o1',
      p_row_version: 4,
    })
    expect(
      await screen.findByText('ORC-2026-041 voltou para a lista de orçamentos.'),
    ).toBeInTheDocument()
  })

  it('a proposta pronta mostra preço, parcelas e o que é do cliente, sem custo nem margem', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/orcamentos/o1/proposta')
    const proposta = await screen.findByRole('article', { name: 'Proposta ORC-2026-041' })
    const acessibilidade = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(acessibilidade.violations.map((v) => v.id)).toEqual([])
    expect(within(proposta).getByText('Indústria Horizonte')).toBeInTheDocument()
    expect(within(proposta).getByText('A/C Marina Couto')).toBeInTheDocument()
    // O serviço aparece no escopo e na composição do investimento (modelo da Envora).
    expect(within(proposta).getAllByText('RCA/PCA e PGRS')).toHaveLength(2)
    // Por hora: "1 serviço", valor unitário = total (horas são internas).
    expect(within(proposta).getAllByText('R$ 5.100,00')).toHaveLength(2)
    // Total logo de cara e na linha final da tabela.
    expect(within(proposta).getAllByText('R$ 8.900,00')).toHaveLength(2)
    // Parcelas por maior resto: 40% de 8.900,00 = 3.560,00
    expect(within(proposta).getByText('40,0% · R$ 3.560,00')).toBeInTheDocument()
    // Honorário ≠ taxa do órgão: a taxa fica por conta do cliente.
    expect(within(proposta).getByText('Taxa do órgão ambiental')).toBeInTheDocument()
    expect(within(proposta).getByText('Uma visita técnica')).toBeInTheDocument()
    // Nada interno: sem custo, margem, horas nem responsável.
    expect(within(proposta).queryByText(/custo|margem|responsável/i)).toBeNull()
    expect(within(proposta).queryByText('8h')).toBeNull()

    await usuario.click(screen.getByRole('button', { name: 'Imprimir ou salvar PDF' }))
    expect(imprimir).toHaveBeenCalled()
    imprimir.mockRestore()
  })

  it('muda a situação à mão, com observação, e mostra o histórico', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          mudar_situacao_orcamento: { data: 4 },
          obter_orcamento: {
            data: orcamento({
              historico_situacao: [
                {
                  de: 'enviada',
                  para: 'rascunho',
                  revisao: 1,
                  membro_nome: 'Eduardo Karnopp',
                  em: '2026-11-10T14:00:00Z',
                  observacao: 'Cliente pediu ajuste',
                },
              ],
            }),
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    const painel = await screen.findByRole('region', { name: 'Situação do orçamento' })
    // Do rascunho só se vai para enviada ou aprovada.
    expect(within(painel).queryByRole('button', { name: 'Marcar como recusada' })).toBeNull()
    expect(within(painel).getByText(/Eduardo Karnopp: Enviada para Rascunho/)).toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Marcar como enviada' }))
    expect(screen.getByText(/deixa de ser editada no lugar/)).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Observação (opcional)'), 'Enviada por e-mail')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('mudar_situacao_orcamento', {
      p_id: 'o1',
      p_row_version: 3,
      p_para: 'enviada',
      p_observacao: 'Enviada por e-mail',
    })
    expect(await screen.findByText('Situação: Enviada.')).toBeInTheDocument()
  })

  it('sem horas em todos os serviços, a situação não muda e a tela explica', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: { aprovar_orcamento: { error: { message: 'horas_pendentes' } } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    // Aprovar passa pelo registro do aceite (ADR-0029); a regra das horas continua no banco.
    await usuario.click(await screen.findByRole('button', { name: 'Registrar aprovação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar aprovação' })
    await usuario.type(await within(dialogo).findByLabelText('Quem aprovou'), 'Marina')
    await usuario.type(within(dialogo).getByLabelText('Referência'), 'e-mail')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Informe as horas de todos os serviços antes de enviar ou aprovar.',
    )
  })

  it('enviada: reabrir vira nova revisão; com mudanças pendentes, a situação espera o salvar', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { obter_orcamento: { data: orcamento({ situacao: 'enviada' }) } } }),
    )
    renderizarApp('/orcamentos/o1')
    const painel = await screen.findByRole('region', { name: 'Situação do orçamento' })
    expect(within(painel).getByRole('button', { name: 'Reabrir como revisão 2' })).toBeEnabled()
    expect(within(painel).getByRole('button', { name: 'Marcar como recusada' })).toBeEnabled()
  })

  it('ART e outros custos já gravados seguem no salvar sem campo na tela; o texto de apresentação vai junto', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    // Pedido do Eduardo (23/11/2026): o serviço não tem mais "Detalhes" (outros custos e ART/RRT).
    await screen.findByLabelText('Serviço do item 1')
    expect(screen.queryByLabelText('ART ou RRT do item 2')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Outros custos do item 1')).not.toBeInTheDocument()
    expect(screen.queryByText(/Detalhes/)).not.toBeInTheDocument()
    // Uma mudança qualquer, para o Salvar aparecer.
    await usuario.type(screen.getByLabelText('Serviço do item 1'), '.')
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeDisabled()
    await usuario.click(
      within(screen.getByRole('navigation', { name: 'Etapas do orçamento' })).getByRole('button', {
        name: /Parcelas/,
      }),
    )
    await usuario.click(screen.getByText('Apresentação da proposta'))
    await usuario.type(
      screen.getByLabelText(/Texto no início da proposta/),
      'Prezada Marina, segue a proposta.',
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (
      chamada?.[1] as {
        p_dados: {
          apresentacao: string
          itens: { responsabilidade_tecnica: string | null; custo_direto_extra_centavos: number }[]
        }
      }
    ).p_dados
    expect(dados.apresentacao).toBe('Prezada Marina, segue a proposta.')
    expect(dados.itens.map((i) => i.responsabilidade_tecnica)).toEqual([null, null, null])
    // Os outros custos gravados (240,00 no item 1) não se perdem por não aparecerem.
    expect(dados.itens.map((i) => i.custo_direto_extra_centavos)).toEqual([24_000, 26_000, 0])
  })

  it('o responsável do serviço pode ser um terceirizado, sem login (ADR-0031)', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.selectOptions(
      await screen.findByLabelText('Responsável pelo item 1'),
      'Terceirizado',
    )
    // Sem nome, o salvar não vai ao banco e a tela diz o que falta.
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Item 1: informe o nome do terceirizado.')).toBeInTheDocument()
    expect(falso.cliente.rpc.mock.calls.some(([nome]) => nome === 'salvar_orcamento')).toBe(false)

    await usuario.type(screen.getByLabelText('Nome do terceirizado do item 1'), 'João Topógrafo')
    await usuario.selectOptions(
      screen.getByLabelText('Profissão do terceirizado do item 1'),
      'eng_cartografo_agrimensor',
    )
    await usuario.selectOptions(
      screen.getByLabelText('Cobrança do terceirizado do item 1'),
      'Valor fechado',
    )
    await digitarReais(
      usuario,
      screen.getByLabelText('Valor do terceirizado do item 1'),
      '1.800,00',
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const item = (chamada?.[1] as { p_dados: { itens: Record<string, unknown>[] } }).p_dados
      .itens[0]
    expect(item).toMatchObject({
      responsavel_id: null,
      terceiro_nome: 'João Topógrafo',
      terceiro_profissao: 'eng_cartografo_agrimensor',
      terceiro_cobranca: 'fechado',
      terceiro_valor_centavos: 180_000,
    })
  })

  it('a proposta leva a identidade da consultoria, a apresentação e a ART do serviço', async () => {
    const base = orcamento()
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_identidade_da_consultoria: {
            data: {
              razao_social: 'Filtroville Consultoria Ambiental Ltda.',
              cnpj: '11222333000181',
              telefone: '(47) 3000-0000',
              email: 'contato@filtroville.test',
              site: null,
              endereco: null,
              texto_apresentacao: 'Agradecemos a oportunidade.',
              logo_caminho: null,
              row_version: 1,
            },
          },
          obter_orcamento: {
            data: {
              ...base,
              itens: base.itens.map((i, indice) =>
                indice === 1 ? { ...i, responsabilidade_tecnica: 'art' } : i,
              ),
            },
          },
        },
      }),
    )
    renderizarApp('/orcamentos/o1/proposta')
    const proposta = await screen.findByRole('article', { name: 'Proposta ORC-2026-041' })
    // Razão social no cabeçalho, nas duas linhas do aceite e no rodapé.
    expect(
      await within(proposta).findAllByText('Filtroville Consultoria Ambiental Ltda.'),
    ).toHaveLength(4)
    // CNPJ e contatos da consultoria no rodapé da proposta.
    expect(within(proposta).getByText('CNPJ 11.222.333/0001-81')).toBeInTheDocument()
    expect(
      within(proposta).getByText('E-mail: contato@filtroville.test | Telefone: (47) 3000-0000'),
    ).toBeInTheDocument()
    // Sem texto próprio no orçamento, vale o padrão da identidade.
    expect(within(proposta).getByText('Agradecemos a oportunidade.')).toBeInTheDocument()
    expect(within(proposta).getByText('Inclui ART')).toBeInTheDocument()
  })

  it('cadastra os dados da proposta; a logo espera os dados salvos', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { salvar_identidade_da_consultoria: { data: 1 } } }))
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/configuracoes/proposta')
    // Dados da proposta é a segunda seção da aba Orçamentos de Configurações (ADR-0041).
    await screen.findByRole('heading', { level: 1, name: 'Configurações' })
    expect(screen.getByRole('button', { name: 'Dados da proposta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const acessibilidade = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(acessibilidade.violations.map((v) => v.id)).toEqual([])
    expect(screen.getByRole('button', { name: 'Enviar logo' })).toBeDisabled()
    await usuario.type(screen.getByLabelText('Razão social'), 'Filtroville Ltda.')
    await usuario.type(screen.getByLabelText('CNPJ'), '11.222.333/0001-81')
    await usuario.type(screen.getByLabelText('Texto de apresentação padrão'), 'Agradecemos.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('salvar_identidade_da_consultoria', {
      p_consultoria_id: expect.any(String) as unknown,
      p_row_version: 0,
      p_dados: expect.objectContaining({
        razao_social: 'Filtroville Ltda.',
        cnpj: '11.222.333/0001-81',
        texto_apresentacao: 'Agradecemos.',
      }) as unknown,
    })
    expect(await screen.findByText('Dados da proposta salvos.')).toBeInTheDocument()
  })

  it('o editor vai por etapas: serviços, preço e margem, parcelas', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByRole('heading', { name: 'Indústria Horizonte' })).toBeInTheDocument()
    const trilha = screen.getByRole('navigation', { name: 'Etapas do orçamento' })
    expect(within(trilha).getByRole('button', { name: /Serviços/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    // Etapa 1: custo de cada serviço, sem margem.
    expect(screen.getByText('R$ 5.750,00')).toBeInTheDocument()
    // Custo do item 1: 8h × 95 + 240 + 8h × 30 = 1.240,00
    expect(screen.getByText('1.240,00')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Acréscimo sobre horas de venda e contas (%)'),
    ).not.toBeInTheDocument()

    // Etapa 2: margem e preço; o foco vai para o conteúdo da etapa.
    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByRole('group', { name: /Etapa 2 de 3/ })).toHaveFocus()
    expect(screen.getByLabelText('Acréscimo sobre horas de venda e contas (%)')).toHaveValue('30')
    expect(screen.getAllByText('R$ 7.803,16').length).toBeGreaterThan(0)
    const contas = screen.getByRole('region', { name: 'Contas da consultoria neste orçamento' })
    expect(within(contas).getByText('Energia elétrica')).toBeInTheDocument()
    expect(within(contas).getByText('131,25')).toBeInTheDocument()
    expect(screen.queryByLabelText('Percentual da parcela 1')).not.toBeInTheDocument()

    // Etapa 3: parcelas sobre o preço.
    await usuario.click(screen.getByRole('button', { name: 'Continuar para parcelas' }))
    expect(screen.getByText('3.121,26')).toBeInTheDocument()
    expect(screen.getByText('Somam 100% do preço.')).toBeInTheDocument()
    expect(
      within(trilha).getByRole('button', { name: 'Serviços, concluída, 3 serviços' }),
    ).toBeInTheDocument()
    await usuario.click(within(trilha).getByRole('button', { name: /Preço e margem/ }))
    expect(screen.getByLabelText('Acréscimo sobre horas de venda e contas (%)')).toBeInTheDocument()
  })

  it('a margem tem atalhos de 5 em 5 e aceita outro valor', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1?etapa=preco')
    const margem = await screen.findByLabelText('Acréscimo sobre horas de venda e contas (%)')
    const atalhos = screen.getByRole('group', { name: 'Margens mais usadas' })
    expect(
      within(atalhos)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['10%', '15%', '20%', '25%', '30%'])
    expect(within(atalhos).getByRole('button', { name: '30%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await usuario.click(within(atalhos).getByRole('button', { name: '25%' }))
    expect(margem).toHaveValue('25')
    expect(within(atalhos).getByRole('button', { name: '25%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await usuario.clear(margem)
    await usuario.type(margem, '27,5')
    expect(within(atalhos).getByRole('button', { name: '25%' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('avisa quando as parcelas não fecham 100% e salva com a versão atual', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1?etapa=parcelas')
    const percentual = await screen.findByLabelText('Percentual da parcela 3')
    await usuario.clear(percentual)
    await usuario.type(percentual, '25')
    expect(screen.getByText('Faltam 5,0% para fechar 100%.')).toBeInTheDocument()
    // Sem fechar 100%, cada parcela mostra o próprio percentual do preço (25% de R$ 7.803,16).
    expect(screen.getByText('1.950,79')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_id: 'o1',
      p_row_version: 3,
      p_dados: {
        objeto: 'Licenciamento (LO)',
        margem_pb: 3_000,
        visitas: { quantidade: 0, km_por_visita: 0, outros_por_visita_centavos: 0 },
        parcelas: [
          { id: 'p1', descricao: 'Assinatura do contrato', dias: 3, percentual_pb: 4_000 },
          { id: 'p2', dias: 5, percentual_pb: 3_000 },
          { id: 'p3', dias: 0, percentual_pb: 2_500 },
        ],
      },
    })
  })

  it('sair do editor com alteração não salva pede confirmação', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1?etapa=parcelas')
    const percentual = await screen.findByLabelText('Percentual da parcela 3')
    await usuario.clear(percentual)
    await usuario.type(percentual, '25')

    await usuario.click(screen.getByRole('link', { name: 'Calendário' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Sair sem salvar?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar aqui' }))
    expect(screen.queryByRole('dialog', { name: 'Sair sem salvar?' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Percentual da parcela 3')).toHaveValue('25')

    await usuario.click(screen.getByRole('link', { name: 'Calendário' }))
    await usuario.click(
      within(await screen.findByRole('dialog', { name: 'Sair sem salvar?' })).getByRole('button', {
        name: 'Sair sem salvar',
      }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
  })

  it('versão nova do servidor: sem mudanças adota; com mudanças pendentes, mantém e avisa', async () => {
    let versao = 3
    const parcelasDaVersao = (terceira: number) => [
      { id: 'p1', descricao: 'Assinatura do contrato', dias: 3, percentual_pb: 4_000 },
      { id: 'p2', descricao: 'Protocolo no órgão', dias: 5, percentual_pb: 3_000 },
      { id: 'p3', descricao: 'Emissão da licença', dias: 0, percentual_pb: terceira },
    ]
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: () => ({
            data: orcamento({
              row_version: versao,
              parcelas: parcelasDaVersao(versao === 3 ? 3_000 : versao === 4 ? 2_000 : 1_000),
            }),
          }),
          salvar_orcamento: { error: { code: 'P0001', message: 'conflito_de_versao' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    const { queryClient } = renderizarApp('/orcamentos/o1?etapa=parcelas')
    const percentual = await screen.findByLabelText('Percentual da parcela 3')
    expect(percentual).toHaveValue('30')

    // Sem nada pendente, a versão nova entra no lugar.
    versao = 4
    await queryClient.invalidateQueries({ queryKey: ['orcamento', 'o1'] })
    await waitFor(() => {
      expect(screen.getByLabelText('Percentual da parcela 3')).toHaveValue('20')
    })

    // Com mudança pendente, a versão nova não apaga o que foi digitado.
    await usuario.clear(screen.getByLabelText('Percentual da parcela 3'))
    await usuario.type(screen.getByLabelText('Percentual da parcela 3'), '25')
    versao = 5
    await queryClient.invalidateQueries({ queryKey: ['orcamento', 'o1'] })
    expect(
      await screen.findByText(/Este orçamento foi alterado em outro lugar/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Percentual da parcela 3')).toHaveValue('25')
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()

    // Salvar vai com a versão de onde o rascunho partiu e esbarra no conflito.
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'salvar_orcamento',
      expect.objectContaining({ p_id: 'o1', p_row_version: 4 }),
    )
    expect(
      await screen.findByText(
        'Isto foi alterado em outro lugar depois que você abriu. Recarregue para ver a versão atual.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Percentual da parcela 3')).toHaveValue('25')

    // Recarregar descarta o rascunho e mostra a versão nova.
    await usuario.click(screen.getByRole('button', { name: 'Recarregar' }))
    expect(screen.getByLabelText('Percentual da parcela 3')).toHaveValue('10')
    expect(screen.queryByText(/Este orçamento foi alterado em outro lugar/)).not.toBeInTheDocument()
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument()
  })

  it('o que é digitado enquanto o salvar corre fica no rascunho, sem aviso de "outro lugar"', async () => {
    let versao = 3
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: () => ({
            data: orcamento({
              row_version: versao,
              parcelas: [
                { id: 'p1', descricao: 'Assinatura do contrato', dias: 3, percentual_pb: 4_000 },
                { id: 'p2', descricao: 'Protocolo no órgão', dias: 5, percentual_pb: 3_000 },
                { id: 'p3', descricao: 'Emissão da licença', dias: 0, percentual_pb: 3_000 },
              ],
            }),
          }),
        },
      }),
    )
    // O salvar e a releitura seguinte ficam presos até o teste soltar cada um.
    const padrao = falso.cliente.rpc.getMockImplementation()
    if (!padrao) throw new Error('rpc falso sem implementação')
    onTestFinished(() => {
      falso.cliente.rpc.mockImplementation(padrao)
    })
    const soltar: { salvar?: () => void; releitura?: () => void } = {}
    let prenderReleitura = false
    falso.cliente.rpc.mockImplementation((nome: string, args?: Record<string, unknown>) => {
      if (nome === 'salvar_orcamento') {
        return new Promise((resolver) => {
          soltar.salvar = () => {
            versao += 1
            resolver({ data: versao, error: null })
          }
        })
      }
      const resposta = padrao(nome, args)
      if (nome === 'obter_orcamento' && prenderReleitura) {
        return new Promise((resolver) => {
          soltar.releitura = () => {
            resolver(resposta)
          }
        })
      }
      return resposta
    })
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1?etapa=parcelas')
    const terceira = await screen.findByLabelText('Percentual da parcela 3')

    // (a) Digita durante a gravação: a versão nova não apaga o que veio depois do clique.
    await usuario.clear(terceira)
    await usuario.type(terceira, '25')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await usuario.clear(screen.getByLabelText('Percentual da parcela 2'))
    await usuario.type(screen.getByLabelText('Percentual da parcela 2'), '35')
    soltar.salvar?.()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    })
    await waitFor(() => {
      expect(falso.cliente.rpc.mock.calls.filter(([n]) => n === 'obter_orcamento')).toHaveLength(2)
    })
    expect(screen.getByLabelText('Percentual da parcela 2')).toHaveValue('35')
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()
    expect(screen.queryByText(/Este orçamento foi alterado em outro lugar/)).not.toBeInTheDocument()

    // (b) Digita depois da gravação e antes da releitura: também sem aviso falso.
    prenderReleitura = true
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenLastCalledWith(
      'salvar_orcamento',
      expect.objectContaining({ p_row_version: 4 }),
    )
    soltar.salvar?.()
    await waitFor(() => {
      expect(soltar.releitura).toBeDefined()
    })
    await usuario.clear(screen.getByLabelText('Percentual da parcela 1'))
    await usuario.type(screen.getByLabelText('Percentual da parcela 1'), '45')
    soltar.releitura?.()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    })
    expect(screen.getByLabelText('Percentual da parcela 1')).toHaveValue('45')
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()
    expect(screen.queryByText(/Este orçamento foi alterado em outro lugar/)).not.toBeInTheDocument()
    prenderReleitura = false
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenLastCalledWith(
      'salvar_orcamento',
      expect.objectContaining({ p_row_version: 5 }),
    )
  })

  it('horas aceitam 1h30, o item mostra o custo e a margem do fim muda o preço', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
    await usuario.type(screen.getByLabelText('Serviço do item 4'), 'Revisão técnica')
    const horas = screen.getByLabelText('Horas do item 4')
    await usuario.type(horas, '1:30')
    await usuario.tab()
    expect(horas).toHaveValue('1h30')
    // 1h30 custa 142,50 + 45,00 de rateio = 187,50.
    expect(screen.getByText('187,50')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    const margem = screen.getByLabelText('Acréscimo sobre horas de venda e contas (%)')
    await usuario.clear(margem)
    await usuario.type(margem, '20')
    // Acréscimo de 20% sobre trabalho e contas, abaixo da referência mínima de 25%.
    expect(screen.getAllByText('R$ 7.484,01').length).toBeGreaterThan(0)
    expect(screen.getByText(/A margem está abaixo da mínima/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (chamada?.[1] as { p_dados: { itens: unknown[]; margem_pb: number } }).p_dados
    expect(dados.margem_pb).toBe(2_000)
    expect(dados.itens[3]).toEqual({
      id: expect.any(String) as string,
      descricao: 'Revisão técnica',
      minutos: 90,
      custo_direto_extra_centavos: 0,
      hora_venda_id: 'venda',
      responsavel_id: null,
      mes_previsto: null,
      quantidade: null,
      preco_fechado_centavos: null,
      responsabilidade_tecnica: null,
    })
  })

  it('serviço por hectare e pacote: quantidade sugere as horas, pacote vem com o preço fechado', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              forma_preco: 'tabela',
              base: {
                ...base,
                horas_venda: [
                  {
                    id: 'h',
                    profissao: 'Eng.',
                    atividade: 'Hora',
                    valor_centavos: 16_000,
                    fonte: null,
                  },
                  {
                    id: 'ha',
                    profissao: 'Bio.',
                    atividade: 'Levantamento',
                    valor_centavos: 8_000,
                    fonte: null,
                    unidade: 'ha',
                    minutos_por_unidade: 96,
                  },
                  {
                    id: 'pac',
                    profissao: 'Eng.',
                    atividade: 'PGRSS',
                    valor_centavos: 120_000,
                    fonte: null,
                    unidade: 'pacote',
                  },
                ],
              },
              itens: [
                {
                  id: 'i1',
                  descricao: 'Levantamento de fauna',
                  minutos: 0,
                  preco_centavos: 0,
                  custo_direto_extra_centavos: 0,
                  hora_venda_id: 'ha',
                  quantidade: null,
                },
                {
                  id: 'i2',
                  descricao: 'PGRSS',
                  minutos: 600,
                  preco_centavos: 0,
                  custo_direto_extra_centavos: 0,
                  hora_venda_id: 'h',
                },
              ],
            }),
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    // Sem quantidade, o preço fica pendente e o campo avisa.
    expect(screen.getByLabelText('Quantidade do item 1')).toHaveAttribute('aria-invalid', 'true')

    // 12,5 ha × 96 min = 20h sugeridas; 12,5 ha × 80,00 = 1.000,00
    await usuario.type(screen.getByLabelText('Quantidade do item 1'), '12,5')
    expect(screen.getByLabelText('Horas do item 1')).toHaveValue('20h')
    expect(screen.getByText('1.000,00')).toBeInTheDocument()

    // Ao escolher o pacote, o preço fechado vem da tabela e dá para mudar.
    await usuario.selectOptions(screen.getByLabelText('Preço do item 2'), 'pac')
    expect(screen.getByLabelText('Preço fechado do item 2')).toHaveValue('1.200,00')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const itens = (
      chamada?.[1] as {
        p_dados: {
          itens: {
            quantidade: string | null
            preco_fechado_centavos: number | null
            minutos: number
          }[]
        }
      }
    ).p_dados.itens
    expect(itens[0]).toMatchObject({ quantidade: '12.5000', minutos: 1_200 })
    expect(itens[1]).toMatchObject({ quantidade: null, preco_fechado_centavos: 120_000 })
  })

  it('faixas progressivas e preço mínimo entram no preço do serviço', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              forma_preco: 'tabela',
              base: {
                ...base,
                horas_venda: [
                  {
                    id: 'm2',
                    profissao: 'Arq.',
                    atividade: 'Projeto',
                    valor_centavos: 200,
                    fonte: null,
                    unidade: 'm2',
                    faixas: [
                      { ate: 500, valor_centavos: 200 },
                      { ate: null, valor_centavos: 150 },
                    ],
                  },
                  {
                    id: 'h',
                    profissao: 'Eng.',
                    atividade: 'Consulta',
                    valor_centavos: 16_000,
                    fonte: null,
                    minimo_centavos: 50_000,
                  },
                ],
              },
              itens: [
                {
                  id: 'i1',
                  descricao: 'Projeto do loteamento',
                  minutos: 1_800,
                  preco_centavos: 0,
                  custo_direto_extra_centavos: 0,
                  hora_venda_id: 'm2',
                  quantidade: null,
                },
                {
                  id: 'i2',
                  descricao: 'Consulta',
                  minutos: 60,
                  preco_centavos: 0,
                  custo_direto_extra_centavos: 0,
                  hora_venda_id: 'h',
                },
              ],
            }),
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    const preco1 = screen.getByLabelText('Preço do item 1')
    expect(
      within(preco1).getByRole('option', { name: /Projeto · preço por faixas\/m²/ }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Preço do item 2')).getByRole('option', {
        name: /Consulta · 160,00\/h · mínimo 500,00/,
      }),
    ).toBeInTheDocument()
    // 1.250 m²: 500 × 2,00 + 750 × 1,50 = 2.125,00 (progressivo, não 1.250 × 1,50)
    await usuario.type(screen.getByLabelText('Quantidade do item 1'), '1250')
    expect(screen.getByText('2.125,00')).toBeInTheDocument()
    // 1 h × 160,00 fica abaixo do mínimo: vale 500,00.
    expect(screen.getByText('500,00')).toBeInTheDocument()
  })

  it('visitas técnicas têm preço fixo e viram uma linha da proposta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.type(await screen.findByLabelText('Quantidade de visitas'), '2')
    await usuario.type(screen.getByLabelText('Km por visita, ida e volta'), '50')
    // 2 × (150 + 50 km × 1,20) = 420
    expect(screen.getByText('Valor das visitas: R$ 420,00')).toBeInTheDocument()
    // Visitas de R$ 420, com seus tributos cobertos nos serviços.
    expect(screen.getAllByText('R$ 8.249,97').length).toBeGreaterThan(0)
    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByText('Visitas técnicas (2) e deslocamento')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_dados: { visitas: { quantidade: 2, km_por_visita: 50, outros_por_visita_centavos: 0 } },
    })
  })

  it('por visita, o km some e não entra; por km, o valor fixo da visita não entra', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              base: { ...base, deslocamento_modo: 'visita', custo_km_centavos: 0 },
            }),
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.type(await screen.findByLabelText('Quantidade de visitas'), '2')
    expect(screen.queryByLabelText('Km por visita, ida e volta')).not.toBeInTheDocument()
    // 2 × 150 = 300
    expect(screen.getByText('Valor das visitas: R$ 300,00')).toBeInTheDocument()
  })

  it('por km rodado, a visita custa km × valor do km, sem o valor fixo', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              base: {
                ...base,
                deslocamento_modo: 'km',
                valor_visita_centavos: 0,
                custo_km_centavos: 50,
              },
            }),
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.type(await screen.findByLabelText('Quantidade de visitas'), '2')
    await usuario.type(screen.getByLabelText('Km por visita, ida e volta'), '80')
    // 2 × 80 km × 0,50 = 80
    expect(screen.getByText('Valor das visitas: R$ 80,00')).toBeInTheDocument()
  })

  it('na escolha do preço, serviços sem "Quem faz" ficam no grupo Serviços', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              forma_preco: 'tabela',
              base: {
                ...base,
                horas_venda: [
                  { id: 'h', profissao: 'Eng.', atividade: 'Júnior', valor_centavos: 16_000 },
                  {
                    id: 'fauna',
                    profissao: '',
                    atividade: 'Inventário de fauna',
                    valor_centavos: 10_000,
                    unidade: 'ha',
                  },
                ],
              },
            }),
          },
        },
      }),
    )
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    const preco = screen.getByLabelText('Preço do item 1')
    const grupos = within(preco).getAllByRole('group')
    expect(grupos.map((g) => g.getAttribute('label'))).toEqual(['Eng.', 'Serviços'])
    const servicos = grupos[1]
    if (!servicos) throw new Error('grupo Serviços não encontrado')
    expect(
      within(servicos).getByRole('option', {
        name: /Inventário de fauna · 100,00\/ha/,
      }),
    ).toBeInTheDocument()
  })

  it('o catálogo de Joinville aplica etapas e despesas como itens editáveis', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Escolher modelo' }))
    await usuario.type(await screen.findByLabelText('Buscar serviço'), 'DANC')
    await usuario.click(screen.getByRole('button', { name: /DANC: declaração/ }))
    expect(screen.getByRole('link', { name: /Carta de serviços/ })).toHaveAttribute(
      'href',
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-atividade-nao-constante-danc/',
    )
    // Condicionais começam desmarcadas.
    expect(screen.getByLabelText(/Vistoria ou estudo complementar/)).not.toBeChecked()
    await usuario.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Modelo "DANC: declaração de atividade não constante" aplicado: 3 etapas e 1 despesas.',
    )
    expect(screen.getByLabelText('Serviço do item 4')).toHaveValue(
      'Verificação da atividade e enquadramento',
    )
    expect(screen.getByLabelText('Horas do item 4')).toHaveValue('1h')
    expect(screen.getByLabelText('Despesa 2')).toHaveValue(
      'Preço público municipal, conforme guia vigente',
    )
    expect(screen.getByLabelText('Estimativa da despesa 2')).toHaveValue('')
  })

  it('aplica um modelo da consultoria: escopo, linha da tabela, despesa a cotar e premissas', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_modelos_de_orcamento: {
            data: {
              total: 1,
              itens: [
                {
                  id: 'm1',
                  nome: 'LAO rural',
                  objeto: 'Licença de operação',
                  itens: [
                    {
                      descricao: 'Diagnóstico de campo',
                      minutos: 90,
                      hora_venda_id: 'venda',
                      unidade: 'hora',
                    },
                    {
                      descricao: 'Item de linha apagada',
                      minutos: 0,
                      hora_venda_id: 'sumiu',
                      unidade: 'm2',
                    },
                  ],
                  despesas: [{ descricao: 'Laboratório', tratamento: 'incluida' }],
                  premissas: ['Cliente fornece as plantas'],
                  exclusoes: [],
                  row_version: 1,
                },
              ],
            },
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Escolher modelo' }))
    const proprios = await screen.findByRole('region', { name: 'Modelos da consultoria' })
    await usuario.click(within(proprios).getByRole('button', { name: /^LAO rural/ }))
    expect(screen.getByText(/Os preços vêm da tabela de preços atual/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }))

    expect(screen.getByLabelText('Serviço do item 4')).toHaveValue('Diagnóstico de campo')
    expect(screen.getByLabelText('Horas do item 4')).toHaveValue('1h30')
    expect(screen.getByLabelText('Preço do item 4')).toHaveValue('venda')
    expect(screen.getByLabelText('Despesa 2')).toHaveValue('Laboratório')
    expect(screen.getByLabelText('Estimativa da despesa 2')).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_dados: {
        premissas: expect.arrayContaining(['Cliente fornece as plantas']) as unknown,
        despesas: expect.arrayContaining([
          expect.objectContaining({ descricao: 'Laboratório', tratamento: 'incluida' }),
        ]) as unknown,
      },
    })
  })

  it('salva o orçamento como modelo, sem cliente nem preço', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { salvar_modelo_de_orcamento: { data: 'm9' } } }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    // Duplicar e Salvar como modelo ficam no menu "…" do cabeçalho.
    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Salvar como modelo' }))
    const nome = screen.getByLabelText('Nome do modelo')
    expect(nome).toHaveValue('Licenciamento (LO)')
    expect(screen.getByText(/Sem cliente, responsáveis nem meses/)).toBeInTheDocument()
    await usuario.clear(nome)
    await usuario.type(nome, 'LO industrial')
    await usuario.click(screen.getByRole('button', { name: 'Salvar modelo' }))
    const chamada = falso.cliente.rpc.mock.calls.find(
      ([nomeRpc]) => nomeRpc === 'salvar_modelo_de_orcamento',
    )
    expect(chamada?.[1]).toMatchObject({ p_orcamento_id: 'o1', p_nome: 'LO industrial' })
    expect(await screen.findByText(/Modelo "LO industrial" salvo/)).toBeInTheDocument()
  })

  it('duplica pedindo se os preços vão junto; com mudanças pendentes, pede para salvar antes', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { duplicar_orcamento: { data: 'o9' } } }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.type(await screen.findByLabelText('Horas do item 1'), '0')
    const mais = screen.getByRole('button', { name: 'Mais ações' })
    await usuario.click(mais)
    expect(await screen.findByRole('menuitem', { name: 'Duplicar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await usuario.keyboard('{Escape}')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      // Sem alteração, o Salvar vira a confirmação "Salvo" (um primário por vez).
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
      expect(screen.getByText('Salvo')).toBeInTheDocument()
    })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    const duplicar = await screen.findByRole('menuitem', { name: 'Duplicar' })
    expect(duplicar).not.toHaveAttribute('aria-disabled')
    await usuario.click(duplicar)
    expect(screen.getByText(/as despesas voltam a cotar/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Duplicar sem os preços' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'duplicar_orcamento')
    expect(chamada?.[1]).toMatchObject({ p_id: 'o1', p_copiar_precos: false })
    // A cópia abre no lugar (nova rota) e o aviso continua na tela.
    await waitFor(() => {
      expect(
        falso.cliente.rpc.mock.calls.some(
          ([nome, args]) => nome === 'obter_orcamento' && (args as { p_id: string }).p_id === 'o9',
        ),
      ).toBe(true)
    })
    expect(await screen.findByRole('heading', { name: 'Indústria Horizonte' })).toBeInTheDocument()
    expect(screen.getByText(/Cópia criada como rascunho/)).toBeInTheDocument()
  })

  it('no celular (375 px), os serviços viram cartões que abrem para editar', async () => {
    // Simula a tela estreita: só a consulta do celular casa.
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    const simulado = vi.fn((consulta: string) => ({
      matches: consulta.includes('max-width: 639px'),
      media: consulta,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: simulado,
    })
    try {
      const usuario = userEvent.setup()
      const { container } = renderizarApp('/orcamentos/o1')
      const lista = await screen.findByRole('list', { name: 'Serviços' })
      expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
      // Fechado: nome, unidade, estado e preço; os campos só aparecem ao abrir.
      expect(within(lista).getByText('1. Visita técnica e diagnóstico')).toBeInTheDocument()
      expect(screen.queryByLabelText('Horas do item 1')).not.toBeInTheDocument()
      const editar = within(lista).getByRole('button', { name: 'Editar serviço 1' })
      expect(editar).toHaveAttribute('aria-expanded', 'false')
      await usuario.click(editar)
      expect(within(lista).getByRole('button', { name: 'Fechar serviço 1' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      const horas = screen.getByLabelText('Horas do item 1')
      await usuario.clear(horas)
      await usuario.type(horas, '10')
      expect(horas).toHaveValue('10')
      const acessibilidade = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(acessibilidade.violations.map((v) => v.id)).toEqual([])

      await usuario.click(within(lista).getByRole('button', { name: 'Remover serviço 3' }))
      expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
      // O serviço novo abre já com o foco no nome.
      await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
      expect(screen.getByLabelText('Serviço do item 3')).toHaveFocus()
    } finally {
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else Reflect.deleteProperty(window, 'matchMedia')
    }
  })

  it('horas fora do formato são marcadas e explicadas ao salvar', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    const horas = await screen.findByLabelText('Horas do item 1')
    await usuario.clear(horas)
    await usuario.type(horas, '1h90')
    expect(horas).toHaveAttribute('aria-invalid', 'true')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use 1h30, 1:30 ou 1,5')
  })

  it('despesa incluída sem valor fica a cotar e deixa o preço pendente', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    await usuario.type(screen.getByLabelText('Despesa 2'), 'Análises laboratoriais')
    await usuario.selectOptions(screen.getByLabelText('Como é paga a despesa 2'), 'incluida')
    expect(screen.getByLabelText('Estimativa da despesa 2')).toHaveAttribute(
      'placeholder',
      'A cotar',
    )
    expect(
      screen.getAllByText(/Há despesa incluída no preço ainda a cotar/).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('R$ 7.803,16')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (chamada?.[1] as { p_dados: { despesas: unknown[] } }).p_dados
    expect(dados.despesas[1]).toMatchObject({ estimativa_centavos: null, tratamento: 'incluida' })
  })

  it('sem base de custos, avisa e não inventa preço', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { obter_orcamento: { data: orcamento({ base: null }) } } }),
    )
    renderizarApp('/orcamentos/o1')
    expect(
      (await screen.findAllByText(/Custos e taxas ainda não configurados/)).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Configurar custos e taxas' })).toBeInTheDocument()
  })

  it('proposta enviada é só leitura', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { obter_orcamento: { data: orcamento({ situacao: 'enviada' }) } } }),
    )
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByText(/Mudanças viram uma nova revisão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Escolher modelo' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Horas do item 1')).toBeDisabled()
    await userEvent.setup().click(
      within(screen.getByRole('navigation', { name: 'Etapas do orçamento' })).getByRole('button', {
        name: /Preço e margem/,
      }),
    )
    expect(screen.getByLabelText('Acréscimo sobre horas de venda e contas (%)')).toBeDisabled()
    expect(screen.getByRole('button', { name: '25%' })).toBeDisabled()
  })

  it('cria orçamento para prospecto, sem empreendimento cadastrado nem diálogo', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: { listar_empreendimentos: { data: [] }, criar_orcamento: { data: 'o2' } },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos')
    await usuario.click(await screen.findByRole('button', { name: 'Novo orçamento' }))
    expect(await screen.findByRole('heading', { name: 'Novo orçamento' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/O que será orçado/)).not.toBeInTheDocument()
    await usuario.type(screen.getByRole('combobox', { name: 'Cliente' }), 'Padaria Pão Quente')
    await usuario.click(
      await screen.findByRole('option', { name: /^Cliente novo: Padaria Pão Quente/ }),
    )
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/o2')
    })
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'criar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_empreendimento_id: null,
      p_objeto: 'Serviços ambientais',
      p_prospecto: {
        nome: 'Padaria Pão Quente',
        cnpj: null,
        contato: null,
        email: null,
        telefone: null,
      },
    })
  })

  it('a lista marca o orçamento de prospecto', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_orcamentos: {
            data: [
              {
                id: 'o2',
                ano: 2026,
                sequencia: 42,
                revisao: 1,
                situacao: 'rascunho',
                empreendimento_id: null,
                empreendimento_nome: 'Padaria Pão Quente',
                objeto: 'AUA da padaria',
                total_centavos: null,
                atualizado_em: '2026-11-12T10:00:00Z',
                total: 1,
              },
            ],
          },
        },
      }),
    )
    renderizarApp('/orcamentos')
    const tabela = await screen.findByRole('table')
    const linha = within(tabela).getByRole('row', { name: /Padaria Pão Quente/ })
    expect(within(linha).getByText('Prospecto')).toBeInTheDocument()
    expect(within(linha).getByText('pendente')).toBeInTheDocument()
  })

  it('orçamento de prospecto edita os dados e cadastra como empreendimento', async () => {
    const deProspecto = orcamento({
      empreendimento_id: null,
      empreendimento_nome: 'Padaria Pão Quente',
      prospecto: {
        nome: 'Padaria Pão Quente',
        cnpj: '11222333000181',
        contato: 'Marina Couto',
        email: null,
        telefone: null,
      },
    })
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_orcamento: { data: deProspecto },
          cadastrar_empreendimento_do_prospecto: { data: 'e9' },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByRole('heading', { name: 'Padaria Pão Quente' })).toBeInTheDocument()
    const secao = screen.getByRole('region', { name: 'Prospecto' })
    expect(within(secao).getByLabelText(/^CNPJ/)).toHaveValue('11.222.333/0001-81')
    const cadastrar = within(secao).getByRole('button', { name: 'Cadastrar como empreendimento' })

    // Com alteração não salva, cadastrar espera o salvamento.
    await usuario.type(within(secao).getByLabelText(/^Telefone/), '(47) 3000-0000')
    expect(cadastrar).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const salvo = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(salvo?.[1]).toMatchObject({
      p_dados: {
        prospecto: {
          nome: 'Padaria Pão Quente',
          cnpj: '11222333000181',
          contato: 'Marina Couto',
          telefone: '(47) 3000-0000',
        },
      },
    })

    await usuario.click(
      await screen.findByRole('button', { name: 'Cadastrar como empreendimento' }),
    )
    const chamada = falso.cliente.rpc.mock.calls.find(
      ([nome]) => nome === 'cadastrar_empreendimento_do_prospecto',
    )
    expect(chamada?.[1]).toMatchObject({ p_orcamento_id: 'o1' })
    expect(await screen.findByText(/agora é um empreendimento cadastrado/)).toBeInTheDocument()
  })

  it('orçamento de empreendimento não mostra o bloco de prospecto', async () => {
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    expect(screen.queryByRole('region', { name: 'Prospecto' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cadastrar como empreendimento' }),
    ).not.toBeInTheDocument()
  })

  it('pela tabela: preço = horas × hora de venda escolhida, e a margem é o que sobra', async () => {
    const pelaTabela = orcamento({
      forma_preco: 'tabela',
      base: {
        ...base,
        horas_venda: [
          {
            id: 'h-jr',
            profissao: 'Eng. ambiental',
            atividade: 'Júnior',
            valor_centavos: 21_419,
            fonte: null,
          },
          {
            id: 'h-sr',
            profissao: 'Eng. ambiental',
            atividade: 'Sênior',
            valor_centavos: 35_698,
            fonte: null,
          },
          {
            id: 'h-bio',
            profissao: 'Biólogo',
            atividade: 'Sênior',
            valor_centavos: 30_000,
            fonte: null,
          },
        ],
      },
      itens: [
        {
          id: 'i1',
          descricao: 'Vistoria',
          minutos: 480,
          preco_centavos: 0,
          custo_direto_extra_centavos: 24_000,
          hora_venda_id: 'h-jr',
        },
        {
          id: 'i2',
          descricao: 'Relatório',
          minutos: 1_440,
          preco_centavos: 0,
          custo_direto_extra_centavos: 26_000,
          hora_venda_id: 'h-jr',
        },
        {
          id: 'i3',
          descricao: 'Protocolo',
          minutos: 600,
          preco_centavos: 0,
          custo_direto_extra_centavos: 0,
          hora_venda_id: 'h-jr',
        },
      ],
    })
    falso.reiniciar(cenario('gestao', { rpc: { obter_orcamento: { data: pelaTabela } } }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    const hora1 = screen.getByLabelText('Preço do item 1')
    expect(hora1).toHaveValue('h-jr')
    // A lista é agrupada por profissão.
    expect(within(hora1).getByRole('group', { name: 'Biólogo' })).toBeInTheDocument()
    // 8h × 214,19 + 240 = 1.953,52; 24h × 214,19 + 260 = 5.400,56; 10h × 214,19 = 2.141,90
    expect(screen.getByText('1.953,52')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 9.495,98').length).toBeGreaterThan(0)

    await usuario.selectOptions(screen.getByLabelText('Preço do item 3'), 'h-sr')
    // 10h × 356,98 = 3.569,80
    expect(screen.getByText('3.569,80')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByRole('radio', { name: /Pela tabela/ })).toBeChecked()
    expect(
      screen.queryByLabelText('Acréscimo sobre horas de venda e contas (%)'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Margem que sobra/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (
      chamada?.[1] as { p_dados: { forma_preco: string; itens: { hora_venda_id: string }[] } }
    ).p_dados
    expect(dados.forma_preco).toBe('tabela')
    expect(dados.itens.map((i) => i.hora_venda_id)).toEqual(['h-jr', 'h-jr', 'h-sr'])
  })

  it('cada serviço tem responsável e mês: o custo usa a hora dele e a carga aparece', async () => {
    const mes = inicioDoMes(hojeNoFuso(new Date(), 'America/Sao_Paulo'))
    falso.reiniciar({
      ...cenario('gestao', {
        rpc: {
          obter_orcamento: {
            data: orcamento({
              base: {
                ...base,
                custo_hora_membro: [{ membro_id: 'm-helena', hora_centavos: 5_747 }],
              },
            }),
          },
          carga_da_equipe: {
            data: {
              jornada: [{ membro_id: 'm-helena', horas_mes: 87 }],
              comprometido: [{ membro_id: 'm-helena', mes, minutos: 80 * 60 }],
            },
          },
        },
      }),
      tabelas: { membro: membros },
    })
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    const responsavel = screen.getByLabelText('Responsável pelo item 1')
    // Só quem está na equipe de Custos e taxas, com a hora de custo.
    await within(responsavel).findByRole('option', { name: 'Helena Costa · 57,47/h' })
    expect(within(responsavel).queryByRole('option', { name: /Eduardo/ })).toBeNull()
    // Sem responsável: 8h × (95,00 + 30,00) + 240 = 1.240,00
    expect(screen.getByText('1.240,00')).toBeInTheDocument()

    await usuario.selectOptions(responsavel, 'm-helena')
    // Com a Helena: 8h × (57,47 + 30,00) + 240 = 939,76
    expect(screen.getByText('939,76')).toBeInTheDocument()

    await usuario.selectOptions(screen.getByLabelText('Mês previsto do item 1'), mes)
    // 80 h aprovadas + 8 h deste orçamento passam das 87 h da jornada: avisa por texto.
    expect(
      screen.getByText(`${rotuloDoMes(mes)}: 88h de 87h, acima da jornada`),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const itens = (
      chamada?.[1] as {
        p_dados: { itens: { responsavel_id: string | null; mes_previsto: string | null }[] }
      }
    ).p_dados.itens
    expect(itens[0]).toMatchObject({ responsavel_id: 'm-helena', mes_previsto: mes })
    expect(itens[1]).toMatchObject({ responsavel_id: null, mes_previsto: null })
  })

  it(
    'cadastra a tabela de horas e a equipe dizendo como cada pessoa recebe (sem piso)',
    { timeout: 15_000 },
    async () => {
      falso.reiniciar({ ...cenario(), tabelas: { membro: membros } })
      const usuario = userEvent.setup()
      renderizarApp('/configuracoes/custos')
      await screen.findByText('Falta configurar para calcular o preço')
      await usuario.click(
        screen.getByRole('button', { name: 'Usar tabela ACEAMB corrigida (ago/2026)' }),
      )
      // Profissão escolhida da lista fixa do Grama (ADR-0021), sem digitar.
      expect(screen.getByLabelText('Profissão do profissional 1')).toHaveDisplayValue(
        'Engenheiro ambiental e sanitarista',
      )
      expect(screen.getByLabelText('Nível do profissional 1')).toHaveValue('Júnior')
      expect(screen.getByLabelText('Preço por hora do profissional 1')).toHaveValue('214,19')
      expect(screen.getByLabelText('Nível do profissional 4')).toHaveValue(
        'Avaliação e perícia ambiental',
      )
      expect(screen.getByLabelText('Preço por hora do profissional 4')).toHaveValue('356,98')
      // Outra profissão, com o valor que a consultoria informar.
      await usuario.click(screen.getByRole('button', { name: 'Adicionar profissional' }))
      await usuario.selectOptions(screen.getByLabelText('Profissão do profissional 5'), 'Biólogo')
      await usuario.type(screen.getByLabelText('Nível do profissional 5'), 'Sênior')
      await usuario.type(screen.getByLabelText('Preço por hora do profissional 5'), '300,00')

      await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '250,00')
      await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
      // Sem piso: cada pessoa diz como recebe; os percentuais saíram.
      expect(screen.queryByLabelText(/Piso/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Aproveitamento/)).not.toBeInTheDocument()
      await usuario.selectOptions(await screen.findByLabelText('Pessoa da linha 1'), 'm-eduardo')
      // A profissão vem do cadastro da pessoa, escolhida na lista; não se digita aqui.
      expect(screen.getByLabelText('Profissão da linha 1')).toHaveDisplayValue(
        'Engenheiro ambiental e sanitarista',
      )
      await usuario.selectOptions(screen.getByLabelText('Como recebe na linha 1'), 'pro_labore')
      await digitarReais(
        usuario,
        screen.getByLabelText('Pró-labore mensal da linha 1'),
        '13.751,77',
      )
      await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '173')
      // 13.751,77 ÷ 173 h = 79,49
      expect(screen.getByText('79,49')).toBeInTheDocument()
      // A conta fica à mão para conferir (Marcos).
      expect(screen.getByText('13.751,77 ÷ 173 h no mês = 79,49')).toBeInTheDocument()

      await usuario.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
      const pessoa2 = screen.getByLabelText('Pessoa da linha 2')
      // Quem já está numa linha não aparece de novo.
      expect(within(pessoa2).queryByRole('option', { name: 'Eduardo Karnopp' })).toBeNull()
      await usuario.selectOptions(pessoa2, 'm-helena')
      expect(screen.getByLabelText('Profissão da linha 2')).toHaveDisplayValue('Biólogo')
      await usuario.selectOptions(screen.getByLabelText('Como recebe na linha 2'), 'diaria')
      expect(screen.queryByLabelText('Salário mensal da linha 2')).not.toBeInTheDocument()
      await usuario.type(screen.getByLabelText('Valor da diária da linha 2'), '400,00')
      await usuario.type(screen.getByLabelText('Horas por diária da linha 2'), '8')
      // 400 ÷ 8 h = 50,00; sem os dias no mês, a capacidade fica desconhecida (nunca zero).
      expect(screen.getByText('50,00')).toBeInTheDocument()
      expect(screen.getByText('400,00 ÷ 8 h por diária = 50,00')).toBeInTheDocument()
      // O aviso cinza de capacidade não calculada saiu; o resultado diz quem entra na média.
      expect(screen.queryByText(/capacidade não calculada/)).not.toBeInTheDocument()
      const resultado = screen.getByLabelText('Resultado da equipe')
      // Só quem tem custo e horas do mês entra na média: por enquanto, só o Eduardo.
      expect(within(resultado).getByText('173 h')).toBeInTheDocument()
      await usuario.type(screen.getByLabelText('Dias no mês da linha 2'), '10')
      // (13.751,77 + 10 × 400) ÷ (173 + 80) h = 70,17
      expect(within(resultado).getByText('253 h')).toBeInTheDocument()
      expect(within(resultado).getByText('R$ 70,17')).toBeInTheDocument()
      expect(within(resultado).getByText('Custo por hora de Biólogo')).toBeInTheDocument()
      expect(within(resultado).getByText('R$ 50,00')).toBeInTheDocument()
      expect(within(resultado).getByText('R$ 79,49')).toBeInTheDocument()

      await confirmarBaseNova(usuario)
      await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
      const chamada = falso.cliente.rpc.mock.calls.find(
        ([nome]) => nome === 'salvar_base_de_custos',
      )
      expect(chamada?.[1]).not.toHaveProperty('p_piso_hora_centavos')
      expect(chamada?.[1]).toMatchObject({
        p_horas_venda: [
          {
            profissao: 'Engenheiro ambiental e sanitarista',
            atividade: 'Júnior',
            valor_centavos: 21_419,
          },
          {
            profissao: 'Engenheiro ambiental e sanitarista',
            atividade: 'Sênior',
            valor_centavos: 35_698,
          },
          {
            profissao: 'Engenheiro ambiental e sanitarista',
            atividade: 'Máster',
            valor_centavos: 44_622,
          },
          {
            profissao: 'Engenheiro ambiental e sanitarista',
            atividade: 'Avaliação e perícia ambiental',
            valor_centavos: 35_698,
          },
          { profissao: 'Biólogo', atividade: 'Sênior', valor_centavos: 30_000, fonte: null },
        ],
        p_equipe: [
          {
            membro_id: 'm-eduardo',
            tipo_recebimento: 'pro_labore',
            profissao: 'Engenheiro ambiental e sanitarista',
            custo_mensal_centavos: 1_375_177,
            horas_disponiveis_mes: 173,
          },
          {
            membro_id: 'm-helena',
            tipo_recebimento: 'diaria',
            profissao: 'Biólogo',
            custo_mensal_centavos: null,
            horas_disponiveis_mes: null,
            custo_diaria_centavos: 40_000,
            horas_por_diaria: 8,
            dias_no_mes: 10,
          },
        ],
      })
      const enviada = chamada?.[1] as { p_equipe: Record<string, unknown>[] } | undefined
      expect(enviada?.p_equipe[0]).not.toHaveProperty('pelo_piso')
    },
  )

  it('cadastra preço por faixas de quantidade e preço mínimo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar serviço' }))
    await usuario.type(screen.getByLabelText('Serviço 1'), 'Projeto')
    await usuario.selectOptions(
      screen.getByLabelText('Quem faz o serviço 1'),
      'Arquiteto e urbanista',
    )
    // O bloco de serviços não oferece a hora; pacote não tem faixas; m² tem.
    const unidade = screen.getByLabelText('Unidade do serviço 1')
    expect(within(unidade).queryByRole('option', { name: 'Hora' })).not.toBeInTheDocument()
    await usuario.selectOptions(unidade, 'pacote')
    expect(
      screen.queryByRole('button', { name: 'Usar faixas de quantidade no serviço 1' }),
    ).not.toBeInTheDocument()
    await usuario.selectOptions(unidade, 'm2')
    await usuario.type(screen.getByLabelText('Preço do serviço 1'), '2,00')
    await usuario.click(
      screen.getByRole('button', { name: 'Usar faixas de quantidade no serviço 1' }),
    )
    expect(screen.queryByLabelText('Preço do serviço 1')).not.toBeInTheDocument()
    // A primeira faixa começa com o preço que já estava na linha.
    expect(screen.getByLabelText('Valor por unidade da faixa 1 do serviço 1')).toHaveValue('2,00')
    await usuario.type(screen.getByLabelText('Até quanto vale a faixa 1 do serviço 1'), '500')
    expect(screen.getByText(/Acima de 500/)).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Valor por unidade da faixa 2 do serviço 1'), '1,50')
    // Uma faixa a mais, com limite que não cresce: a tela recusa.
    await usuario.click(screen.getByRole('button', { name: 'Adicionar faixa no serviço 1' }))
    await usuario.type(screen.getByLabelText('Até quanto vale a faixa 2 do serviço 1'), '300')
    await usuario.type(screen.getByLabelText('Valor por unidade da faixa 2 do serviço 1'), '1,80')
    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Serviços, linha 1: os limites das faixas precisam crescer',
    )
    await usuario.clear(screen.getByLabelText('Até quanto vale a faixa 2 do serviço 1'))
    await usuario.type(screen.getByLabelText('Até quanto vale a faixa 2 do serviço 1'), '1.000')
    await usuario.type(screen.getByLabelText('Preço mínimo do serviço 1'), '800,00')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_horas_venda: [
        {
          profissao: 'Arquiteto e urbanista',
          atividade: 'Projeto',
          unidade: 'm2',
          valor_centavos: 200,
          minimo_centavos: 80_000,
          faixas: [
            { ate: '500.0000', valor_centavos: 200 },
            { ate: '1000.0000', valor_centavos: 180 },
            { ate: null, valor_centavos: 150 },
          ],
        },
      ],
    })
  })

  it('avisa quando a margem desejada fica abaixo da mínima, sem bloquear', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    expect(screen.queryByText(/está abaixo da mínima/)).not.toBeInTheDocument()
    const desejada = screen.getByLabelText('Margem desejada (%)')
    await usuario.clear(desejada)
    await usuario.type(desejada, '20')
    expect(
      screen.getByText(/A margem desejada \(20,0%\) está abaixo da mínima \(25,0%\)/),
    ).toBeInTheDocument()
  })

  it('lista o que falta para calcular o preço; tributo vazio e margem sem confirmar não salvam', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    const lista = await screen.findByRole('region', {
      name: 'Falta configurar para calcular o preço',
    })
    expect(within(lista).getByText(/Faltam 6 itens/)).toBeInTheDocument()
    expect(
      within(lista).getByRole('link', {
        name: 'Tabela de preços (ao menos um profissional ou serviço)',
      }),
    ).toHaveAttribute('href', '#grupo-precos')

    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '0')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar profissional' }))
    await usuario.selectOptions(
      screen.getByLabelText('Profissão do profissional 1'),
      'Engenheiro ambiental',
    )
    await usuario.type(screen.getByLabelText('Nível do profissional 1'), 'Pleno')
    await usuario.type(screen.getByLabelText('Preço por hora do profissional 1'), '200,00')
    expect(within(lista).getByText(/Falta 2 itens|Faltam 2 itens/)).toBeInTheDocument()

    // Vazio não vira zero: tributos precisam ser digitados, mesmo que 0.
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Informe os tributos sobre o faturamento (se não paga, digite 0).',
    )
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '0')
    // As margens vêm preenchidas só para começar: precisam de confirmação.
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Confirme as margens desejada e mínima')
    await usuario.click(
      screen.getByLabelText('Confirmo que estas margens são da minha consultoria'),
    )
    expect(screen.getByText(/Tudo pronto para calcular o preço/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_tributos_pb: 0,
      p_margem_desejada_pb: 3_000,
      p_custos_fixos_mensais_centavos: 0,
    })
  })

  it('custos e taxas mostram o rateio por hora e salvam', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    expect(await screen.findByText('Falta configurar para calcular o preço')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await digitarReais(usuario, screen.getByLabelText('Custos fixos por mês (R$)'), '9.600,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '6')
    expect(screen.getByText('R$ 30,00 por hora')).toBeInTheDocument()
    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_hora_tecnica_centavos: 9_500,
      p_custos_fixos_mensais_centavos: 960_000,
      p_horas_faturaveis_mes: 320,
      p_margem_desejada_pb: 3_000,
      p_margem_minima_pb: 2_500,
      p_tributos_pb: 600,
    })
  })

  it('detalha as contas do mês, com a soma no lugar do total, e salva a visita', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.click(screen.getByRole('button', { name: 'Detalhar contas do mês' }))
    // Sugestões só com o nome: nenhum valor inventado.
    expect(screen.getByLabelText('Conta 2')).toHaveValue('Energia elétrica')
    expect(screen.getByLabelText('Valor por mês da conta 2')).toHaveValue('')
    await digitarReais(usuario, screen.getByLabelText('Valor por mês da conta 1'), '8.000,00')
    await digitarReais(usuario, screen.getByLabelText('Valor por mês da conta 2'), '1.000,00')
    await usuario.type(screen.getByLabelText('Valor por mês da conta 4'), '600,00')
    expect(screen.getByText('9.600,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 30,00 por hora')).toBeInTheDocument()
    // Base nova: cobra por visita; o km não aparece.
    expect(screen.getByRole('radio', { name: 'Cobramos por visita' })).toBeChecked()
    expect(screen.queryByLabelText('Consumo do carro (km/l)')).not.toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Valor de uma visita técnica (R$)'), '150,00')

    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_custos_fixos_mensais_centavos: 960_000,
      p_deslocamento_modo: 'visita',
      p_valor_visita_centavos: 15_000,
      p_custo_km_centavos: 0,
      p_consumo_km_por_litro: null,
      p_preco_combustivel_centavos: null,
      p_acrescimo_km_centavos: null,
    })
    const contas = (chamada?.[1] as { p_custos_fixos: { descricao: string }[] }).p_custos_fixos
    expect(contas[0]).toEqual({ descricao: 'Aluguel e condomínio', valor_centavos: 800_000 })
    expect(contas[2]).toEqual({ descricao: 'Água e esgoto', valor_centavos: 0 })
  })

  it('cobra por km rodado: combustível ÷ consumo, mais o acréscimo opcional', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '0')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '0')
    await usuario.type(screen.getByLabelText('Valor de uma visita técnica (R$)'), '150,00')

    await usuario.click(screen.getByRole('radio', { name: 'Cobramos por km rodado' }))
    // Só os campos do km: o valor fixo da visita some.
    expect(screen.queryByLabelText('Valor de uma visita técnica (R$)')).not.toBeInTheDocument()
    expect(screen.getByText(/Valor do km/)).toHaveTextContent('Valor do km: não cadastrado')
    await usuario.type(screen.getByLabelText('Consumo do carro (km/l)'), '12')
    expect(screen.getByText(/Valor do km/)).toHaveTextContent('Valor do km: pendente')
    await usuario.type(screen.getByLabelText('Preço do combustível (R$/l)'), '6,00')
    // R$ 6,00 ÷ 12 km/l = R$ 0,50 por km.
    expect(screen.getByText('R$ 0,50 por km')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Acréscimo por km (R$)'), '0,30')
    expect(screen.getByText('R$ 0,80 por km')).toBeInTheDocument()
    await usuario.clear(screen.getByLabelText('Acréscimo por km (R$)'))

    // Consumo sem preço não salva.
    await usuario.clear(screen.getByLabelText('Preço do combustível (R$/l)'))
    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Informe o consumo do carro e o preço do combustível',
    )
    await usuario.type(screen.getByLabelText('Preço do combustível (R$/l)'), '6,00')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_deslocamento_modo: 'km',
      p_valor_visita_centavos: 0,
      p_custo_km_centavos: 50,
      p_consumo_km_por_litro: 12,
      p_preco_combustivel_centavos: 600,
      p_acrescimo_km_centavos: null,
    })
  })

  it('base antiga só com km abre em "por km rodado", sem perder o valor do km', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          obter_base_de_custos: {
            data: {
              hora_tecnica_centavos: 9_500,
              custos_fixos_mensais_centavos: 0,
              custos_fixos_equipe_centavos: 0,
              custos_fixos_detalhe: [],
              horas_faturaveis_mes: 160,
              margem_desejada_pb: 3_000,
              margem_minima_pb: 2_500,
              tributos_pb: 0,
              taxas_pb: 0,
              taxa_por_cobranca_centavos: 0,
              taxa_por_assinatura_centavos: 0,
              valor_visita_centavos: 0,
              custo_km_centavos: 120,
              horas_venda: [],
              custo_hora_profissao: [],
              custo_hora_membro: [],
              equipe: [],
              row_version: 3,
            },
          },
        },
      }),
    )
    renderizarApp('/configuracoes/custos')
    expect(await screen.findByRole('radio', { name: 'Cobramos por km rodado' })).toBeChecked()
    expect(screen.getByLabelText('Acréscimo por km (R$)')).toHaveValue('1,20')
    expect(screen.getByText('R$ 1,20 por km')).toBeInTheDocument()
  })

  it('serviço sem "Quem faz" é salvo sem profissão; hora sem profissão não', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await usuario.type(screen.getByLabelText('Custo da hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '0')
    expect(screen.getByRole('heading', { name: 'Hora de profissional' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Serviços' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Adicionar serviço' }))
    await usuario.type(screen.getByLabelText('Serviço 1'), 'Inventário de fauna')
    await usuario.selectOptions(screen.getByLabelText('Unidade do serviço 1'), 'ha')
    await usuario.type(screen.getByLabelText('Preço do serviço 1'), '100,00')
    expect(screen.getByLabelText('Quem faz o serviço 1')).toHaveDisplayValue(
      'Qualquer pessoa da equipe',
    )

    await usuario.click(screen.getByRole('button', { name: 'Adicionar profissional' }))
    await usuario.type(screen.getByLabelText('Nível do profissional 1'), 'Júnior')
    await usuario.type(screen.getByLabelText('Preço por hora do profissional 1'), '200,00')
    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hora de profissional, linha 1: informe a profissão.',
    )
    await usuario.click(screen.getByRole('button', { name: 'Remover profissional 1' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_horas_venda: [
        { profissao: '', atividade: 'Inventário de fauna', unidade: 'ha', valor_centavos: 10_000 },
      ],
    })
  })

  it('calcula hora técnica e horas pela equipe, com o pró-labore entrando uma vez', async () => {
    falso.reiniciar({ ...cenario(), tabelas: { membro: membros } })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await digitarReais(usuario, screen.getByLabelText('Custos fixos por mês (R$)'), '9.600,00')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '6')
    await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
    expect(screen.getByLabelText('Outros custos fixos por mês (R$)')).toHaveValue('9.600,00')
    expect(screen.queryByLabelText('Custo da hora técnica (R$)')).not.toBeInTheDocument()

    await confirmarBaseNova(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Equipe, linha 1: escolha a pessoa.')
    await usuario.selectOptions(await screen.findByLabelText('Pessoa da linha 1'), 'm-eduardo')
    await digitarReais(usuario, screen.getByLabelText('Salário mensal da linha 1'), '10.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '160')
    // Hora de custo: 10.000 ÷ 160 h = 62,50
    expect(screen.getByText('62,50')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
    await usuario.selectOptions(screen.getByLabelText('Pessoa da linha 2'), 'm-helena')
    await digitarReais(usuario, screen.getByLabelText('Salário mensal da linha 2'), '5.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 2'), '168')

    // Média 15.000 ÷ 328 h = 45,73; rateio 9.600 ÷ 328 = 29,27 por hora.
    const resultado = screen.getByLabelText('Resultado da equipe')
    expect(within(resultado).getByText('R$ 45,73')).toBeInTheDocument()
    expect(within(resultado).getByText('328 h')).toBeInTheDocument()
    // A caixa "Sócio" e o cartão dos sócios saíram (ADR-0021).
    expect(screen.queryByLabelText(/Sócio/)).not.toBeInTheDocument()
    expect(within(resultado).queryByText(/Remuneração dos sócios/)).not.toBeInTheDocument()
    expect(screen.getByText('R$ 29,27 por hora')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_hora_tecnica_centavos: 4_573,
      p_horas_faturaveis_mes: 328,
      p_custos_fixos_mensais_centavos: 960_000,
      p_equipe: [
        {
          membro_id: 'm-eduardo',
          socio: false,
          custo_mensal_centavos: 1_000_000,
          horas_disponiveis_mes: 160,
        },
        {
          membro_id: 'm-helena',
          socio: false,
          custo_mensal_centavos: 500_000,
          horas_disponiveis_mes: 168,
        },
      ],
    })
  })

  it('a tela de custos não tem violações de acessibilidade com a equipe aberta', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/configuracoes/custos')
    await screen.findByText('Falta configurar para calcular o preço')
    await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => v.id)).toEqual([])
  })

  it('"Triagem de licenciamento" no "…" do orçamento abre a triagem do empreendimento', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Triagem de licenciamento' }))
    expect(router.state.location.pathname).toBe('/triagem')
    expect(router.state.location.search).toBe('?empreendimento=e1')
  })

  it('o editor não tem violações de acessibilidade detectáveis em nenhuma etapa', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    for (const proxima of ['Continuar para preço e margem', 'Continuar para parcelas', null]) {
      const resultado = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(resultado.violations.map((v) => v.id)).toEqual([])
      if (proxima) await usuario.click(screen.getByRole('button', { name: proxima }))
    }
  })
})
