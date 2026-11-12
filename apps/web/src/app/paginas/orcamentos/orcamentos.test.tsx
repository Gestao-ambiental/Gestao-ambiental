import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  horas_venda: [],
  custo_hora_profissao: [],
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
        descricao: 'Visita técnica e diagnóstico',
        minutos: 480,
        preco_automatico: false,
        preco_centavos: 170_000,
        custo_direto_extra_centavos: 24_000,
      },
      {
        id: 'i2',
        descricao: 'RCA/PCA e PGRS',
        minutos: 1_440,
        preco_automatico: false,
        preco_centavos: 510_000,
        custo_direto_extra_centavos: 26_000,
      },
      {
        id: 'i3',
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
  custosFixosMensaisCentavos: 960_000,
  custosFixosEquipeCentavos: 0,
  contas: [
    { descricao: 'Aluguel e condomínio', valorCentavos: 800_000 },
    { descricao: 'Energia elétrica', valorCentavos: 100_000 },
    { descricao: 'Internet e telefone', valorCentavos: 60_000 },
  ],
  horasVenda: [],
  custoHoraPorProfissao: [],
}

const semVisitas = { quantidade: 0, kmPorVisita: 0, outrosPorVisitaCentavos: 0 }
const tresItens = [
  { minutos: 480, custoDiretoExtraCentavos: 24_000 }, // 760 + 240 + 240 = 1.240
  { minutos: 1_440, custoDiretoExtraCentavos: 26_000 }, // 2.280 + 260 + 720 = 3.260
  { minutos: 600, custoDiretoExtraCentavos: 0 }, // 950 + 300 = 1.250
]

describe('cálculo da tela de orçamento (margem única no fim)', () => {
  it('reproduz o exemplo conferido: R$ 8.999,95 repartido pelo custo de cada serviço', () => {
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
    // (5.750 + 9,97) ÷ (1 − 30% − 6%) = 8.999,95
    expect(c.precoTotalCentavos).toBe(899_995)
    expect(c.precosDosItens).toEqual([194_086, 510_258, 195_651])
    expect(c.situacaoDaMargem).toBe('adequada')
    expect(c.parcelasCentavos).toEqual([359_998, 269_999, 269_998])
  })

  it('a margem escolhida no fim muda o preço; abaixo da mínima avisa', () => {
    const c = calcularOrcamento(tresItens, semVisitas, [], [10_000], 2_000, baseDoCalculo)
    // (5.750 + 1,99 + 4) ÷ 0,74 = 7.778,36
    expect(c.precoTotalCentavos).toBe(777_836)
    expect(c.situacaoDaMargem).toBe('abaixo_da_minima')
  })

  it('visitas têm preço fixo, sem margem, numa linha própria', () => {
    const c = calcularOrcamento(
      [{ minutos: 60, custoDiretoExtraCentavos: 0 }],
      { quantidade: 2, kmPorVisita: 50, outrosPorVisitaCentavos: 1_000 },
      [],
      [10_000],
      2_000,
      baseDoCalculo,
    )
    // Serviços: (125 + 5,99) ÷ 0,74 = 177,01; visitas: 2 × (150 + 50 × 1,20 + 10) = 440, sem
    // margem (o mesmo do pgTAP).
    expect(c.valorVisitasCentavos).toBe(44_000)
    expect(c.precoTotalCentavos).toBe(61_701)
    expect(c.precosDosItens).toEqual([17_701])
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
    expect(screen.queryByLabelText('Margem de lucro (%)')).not.toBeInTheDocument()

    // Etapa 2: margem e preço; o foco vai para o conteúdo da etapa.
    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByRole('group', { name: /Etapa 2 de 3/ })).toHaveFocus()
    expect(screen.getByLabelText('Margem de lucro (%)')).toHaveValue('30')
    expect(screen.getAllByText('R$ 8.999,95').length).toBeGreaterThan(0)
    const contas = screen.getByRole('region', { name: 'Contas da consultoria neste orçamento' })
    expect(within(contas).getByText('Energia elétrica')).toBeInTheDocument()
    expect(within(contas).getByText('131,25')).toBeInTheDocument()
    expect(screen.queryByLabelText('Percentual da parcela 1')).not.toBeInTheDocument()

    // Etapa 3: parcelas sobre o preço.
    await usuario.click(screen.getByRole('button', { name: 'Continuar para parcelas' }))
    expect(screen.getByText('3.599,98')).toBeInTheDocument()
    expect(screen.getByText('Somam 100% do preço.')).toBeInTheDocument()
    expect(
      within(trilha).getByRole('button', { name: 'Serviços, concluída, 3 serviços' }),
    ).toBeInTheDocument()
    await usuario.click(within(trilha).getByRole('button', { name: /Preço e margem/ }))
    expect(screen.getByLabelText('Margem de lucro (%)')).toBeInTheDocument()
  })

  it('a margem tem atalhos de 5 em 5 e aceita outro valor', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1?etapa=preco')
    const margem = await screen.findByLabelText('Margem de lucro (%)')
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
    // Sem fechar 100%, cada parcela mostra o próprio percentual do preço (25% de R$ 8.999,95).
    expect(screen.getByText('2.249,99')).toBeInTheDocument()

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
    const margem = screen.getByLabelText('Margem de lucro (%)')
    await usuario.clear(margem)
    await usuario.type(margem, '20')
    // (5.937,50 + 9,97) ÷ (1 − 20% − 6%) = 8.037,12, abaixo da mínima de 25%.
    expect(screen.getAllByText('R$ 8.037,12').length).toBeGreaterThan(0)
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
      hora_venda_id: null,
    })
  })

  it('visitas técnicas têm preço fixo e viram uma linha da proposta', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await usuario.type(await screen.findByLabelText('Quantidade de visitas'), '2')
    await usuario.type(screen.getByLabelText('Km por visita, ida e volta'), '50')
    // 2 × (150 + 50 km × 1,20) = 420
    expect(screen.getByText('Valor das visitas: R$ 420,00')).toBeInTheDocument()
    // Sem margem: o preço sobe exatamente R$ 420 (8.999,95 → 9.419,95).
    expect(screen.getAllByText('R$ 9.419,95').length).toBeGreaterThan(0)
    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByText('Visitas técnicas (2) e deslocamento')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_dados: { visitas: { quantidade: 2, km_por_visita: 50, outros_por_visita_centavos: 0 } },
    })
  })

  it('o catálogo de Joinville aplica etapas e despesas como itens editáveis', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Escolher modelo' }))
    await usuario.type(await screen.findByLabelText('Buscar serviço'), 'DANC')
    await usuario.click(screen.getByRole('button', { name: /DANC — declaração/ }))
    expect(screen.getByRole('link', { name: /Carta de serviços/ })).toHaveAttribute(
      'href',
      'https://www.joinville.sc.gov.br/servicos/requerer-declaracao-de-atividade-nao-constante-danc/',
    )
    // Condicionais começam desmarcadas.
    expect(screen.getByLabelText(/Vistoria ou estudo complementar/)).not.toBeChecked()
    await usuario.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Modelo "DANC — declaração de atividade não constante" aplicado: 3 etapas e 1 despesas.',
    )
    expect(screen.getByLabelText('Serviço do item 4')).toHaveValue(
      'Verificação da atividade e enquadramento',
    )
    expect(screen.getByLabelText('Horas do item 4')).toHaveValue('1h')
    expect(screen.getByLabelText('Despesa 2')).toHaveValue(
      'Preço público municipal — conforme guia vigente',
    )
    expect(screen.getByLabelText('Estimativa da despesa 2')).toHaveValue('')
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
    expect(screen.queryByText('R$ 8.999,95')).not.toBeInTheDocument()

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
    expect(screen.getByLabelText('Margem de lucro (%)')).toBeDisabled()
    expect(screen.getByRole('button', { name: '25%' })).toBeDisabled()
  })

  it('cria orçamento para prospecto, sem empreendimento cadastrado', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: { listar_empreendimentos: { data: [] }, criar_orcamento: { data: 'o2' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')
    await usuario.click(await screen.findByRole('button', { name: 'Novo orçamento' }))
    await usuario.click(screen.getByRole('radio', { name: 'Prospecto, ainda não cadastrado' }))
    await usuario.type(screen.getByLabelText(/Nome da empresa ou do cliente/), 'Padaria Pão Quente')
    await usuario.type(screen.getByLabelText(/^CNPJ/), '11222333')
    await usuario.type(screen.getByLabelText(/O que será orçado/), 'AUA da padaria')
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    expect(screen.getByText('CNPJ incompleto: são 14 caracteres')).toBeInTheDocument()
    expect(falso.cliente.rpc.mock.calls.some(([nome]) => nome === 'criar_orcamento')).toBe(false)

    await usuario.type(screen.getByLabelText(/^CNPJ/), '000181')
    expect(screen.getByLabelText(/^CNPJ/)).toHaveValue('11.222.333/0001-81')
    await usuario.type(screen.getByLabelText(/^E-mail/), 'compras@padaria.test')
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'criar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_empreendimento_id: null,
      p_objeto: 'AUA da padaria',
      p_prospecto: {
        nome: 'Padaria Pão Quente',
        cnpj: '11222333000181',
        contato: null,
        email: 'compras@padaria.test',
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
    const hora1 = screen.getByLabelText('Hora de venda do item 1')
    expect(hora1).toHaveValue('h-jr')
    // A lista é agrupada por profissão.
    expect(within(hora1).getByRole('group', { name: 'Biólogo' })).toBeInTheDocument()
    // 8h × 214,19 + 240 = 1.953,52; 24h × 214,19 + 260 = 5.400,56; 10h × 214,19 = 2.141,90
    expect(screen.getByText('1.953,52')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 9.495,98').length).toBeGreaterThan(0)

    await usuario.selectOptions(screen.getByLabelText('Hora de venda do item 3'), 'h-sr')
    // 10h × 356,98 = 3.569,80
    expect(screen.getByText('3.569,80')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    expect(screen.getByRole('radio', { name: /Pela tabela/ })).toBeChecked()
    expect(screen.queryByLabelText('Margem de lucro (%)')).not.toBeInTheDocument()
    expect(screen.getByText(/Margem que sobra/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (
      chamada?.[1] as { p_dados: { forma_preco: string; itens: { hora_venda_id: string }[] } }
    ).p_dados
    expect(dados.forma_preco).toBe('tabela')
    expect(dados.itens.map((i) => i.hora_venda_id)).toEqual(['h-jr', 'h-jr', 'h-sr'])
  })

  it('cadastra a tabela de horas (ACEAMB e outras profissões), o piso e a equipe com profissão', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText(/Ainda não configurado/)
    await usuario.click(
      screen.getByRole('button', { name: 'Usar tabela ACEAMB corrigida (ago/2026)' }),
    )
    expect(screen.getByLabelText('Profissão da hora 1')).toHaveValue('Eng. ambiental e sanitarista')
    expect(screen.getByLabelText('Atividade ou nível da hora 1')).toHaveValue('Júnior')
    expect(screen.getByLabelText('Hora de venda da linha 1')).toHaveValue('214,19')
    expect(screen.getByLabelText('Atividade ou nível da hora 4')).toHaveValue(
      'Avaliação e perícia ambiental',
    )
    expect(screen.getByLabelText('Hora de venda da linha 4')).toHaveValue('356,98')
    // Outra profissão, com o valor que a consultoria informar.
    await usuario.click(screen.getByRole('button', { name: 'Adicionar hora' }))
    await usuario.type(screen.getByLabelText('Profissão da hora 5'), 'Biólogo')
    await usuario.type(screen.getByLabelText('Atividade ou nível da hora 5'), 'Sênior')
    await usuario.type(screen.getByLabelText('Hora de venda da linha 5'), '300,00')

    await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '250,00')
    await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
    await usuario.type(screen.getByLabelText('Piso por hora (R$)'), '79,49')
    await usuario.type(screen.getByLabelText('Pessoa ou perfil 1'), 'Sócio')
    await usuario.type(
      screen.getByLabelText('Profissão da linha 1'),
      'Eng. ambiental e sanitarista',
    )
    await usuario.click(screen.getByLabelText('Remuneração pelo piso na linha 1'))
    await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '173')
    await usuario.type(screen.getByLabelText('Aproveitamento da linha 1'), '100')
    // 173 h × 79,49 = 13.751,77
    expect(screen.getByText('13.751,77')).toBeInTheDocument()
    expect(screen.queryByLabelText('Custo mensal da linha 1')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Adicionar pessoa ou perfil' }))
    await usuario.type(screen.getByLabelText('Pessoa ou perfil 2'), 'Sócia')
    await usuario.type(screen.getByLabelText('Profissão da linha 2'), 'Biólogo')
    await usuario.type(screen.getByLabelText('Custo mensal da linha 2'), '5.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 2'), '87')
    await usuario.type(screen.getByLabelText('Aproveitamento da linha 2'), '100')
    // Hora técnica por profissão: 13.751,77 ÷ 173 h = 79,49; 5.000 ÷ 87 h = 57,47
    const resultado = screen.getByLabelText('Resultado da equipe')
    expect(within(resultado).getByText('Hora técnica de Biólogo')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 57,47')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 79,49')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_piso_hora_centavos: 7_949,
      p_horas_venda: [
        { profissao: 'Eng. ambiental e sanitarista', atividade: 'Júnior', valor_centavos: 21_419 },
        { profissao: 'Eng. ambiental e sanitarista', atividade: 'Sênior', valor_centavos: 35_698 },
        { profissao: 'Eng. ambiental e sanitarista', atividade: 'Máster', valor_centavos: 44_622 },
        {
          profissao: 'Eng. ambiental e sanitarista',
          atividade: 'Avaliação e perícia ambiental',
          valor_centavos: 35_698,
        },
        { profissao: 'Biólogo', atividade: 'Sênior', valor_centavos: 30_000, fonte: null },
      ],
      p_equipe: [
        {
          descricao: 'Sócio',
          pelo_piso: true,
          profissao: 'Eng. ambiental e sanitarista',
          custo_mensal_centavos: 1_375_177,
        },
        {
          descricao: 'Sócia',
          pelo_piso: false,
          profissao: 'Biólogo',
          custo_mensal_centavos: 500_000,
        },
      ],
    })
  })

  it('custos e taxas mostram o rateio por hora e salvam', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    expect(await screen.findByText(/Ainda não configurado/)).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '9.600,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '6')
    expect(screen.getByText('R$ 30,00 por hora')).toBeInTheDocument()
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
    await screen.findByText(/Ainda não configurado/)
    await usuario.type(screen.getByLabelText('Hora técnica (R$)'), '95,00')
    await usuario.type(screen.getByLabelText('Horas faturáveis por mês'), '320')
    await usuario.click(screen.getByRole('button', { name: 'Detalhar contas do mês' }))
    // Sugestões só com o nome: nenhum valor inventado.
    expect(screen.getByLabelText('Conta 2')).toHaveValue('Energia elétrica')
    expect(screen.getByLabelText('Valor por mês da conta 2')).toHaveValue('')
    await usuario.type(screen.getByLabelText('Valor por mês da conta 1'), '8.000,00')
    await usuario.type(screen.getByLabelText('Valor por mês da conta 2'), '1.000,00')
    await usuario.type(screen.getByLabelText('Valor por mês da conta 4'), '600,00')
    expect(screen.getByText('9.600,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 30,00 por hora')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Valor de uma visita técnica (R$)'), '150,00')
    await usuario.type(screen.getByLabelText('Valor por km rodado (R$)'), '1,20')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_custos_fixos_mensais_centavos: 960_000,
      p_valor_visita_centavos: 15_000,
      p_custo_km_centavos: 120,
    })
    const contas = (chamada?.[1] as { p_custos_fixos: { descricao: string }[] }).p_custos_fixos
    expect(contas[0]).toEqual({ descricao: 'Aluguel e condomínio', valor_centavos: 800_000 })
    expect(contas[2]).toEqual({ descricao: 'Água e esgoto', valor_centavos: 0 })
  })

  it('calcula hora técnica e horas pela equipe, com o pró-labore entrando uma vez', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/custos')
    await screen.findByText(/Ainda não configurado/)
    await usuario.type(screen.getByLabelText('Custos fixos por mês (R$)'), '9.600,00')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '6')
    await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
    expect(screen.getByLabelText('Outros custos fixos por mês (R$)')).toHaveValue('9.600,00')
    expect(screen.queryByLabelText('Hora técnica (R$)')).not.toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Pessoa ou perfil 1'), 'Sócio técnico')
    await usuario.click(screen.getByLabelText('Sócio, com pró-labore, na linha 1'))
    await usuario.type(screen.getByLabelText('Custo mensal da linha 1'), '10.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '160')
    await usuario.type(screen.getByLabelText('Aproveitamento da linha 1'), '40')
    const parte = screen.getByLabelText('Parte técnica da linha 1')
    await usuario.clear(parte)
    await usuario.type(parte, '60')

    await usuario.click(screen.getByRole('button', { name: 'Adicionar pessoa ou perfil' }))
    await usuario.type(screen.getByLabelText('Pessoa ou perfil 2'), 'Analista')
    await usuario.type(screen.getByLabelText('Custo mensal da linha 2'), '5.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 2'), '168')
    await usuario.type(screen.getByLabelText('Aproveitamento da linha 2'), '75')

    // Técnico 6.000 + 5.000 = 11.000 ÷ (64 + 126 = 190 h) = 57,89; os 4.000 restantes do sócio
    // vão para o rateio: (9.600 + 4.000) ÷ 190 = 71,58 por hora.
    const resultado = screen.getByLabelText('Resultado da equipe')
    expect(within(resultado).getByText('R$ 57,89')).toBeInTheDocument()
    expect(within(resultado).getByText('190 h')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 4.000,00')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 10.000,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 71,58 por hora')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_base_de_custos')
    expect(chamada?.[1]).toMatchObject({
      p_hora_tecnica_centavos: 5_789,
      p_horas_faturaveis_mes: 190,
      p_custos_fixos_mensais_centavos: 960_000,
      p_equipe: [
        {
          descricao: 'Sócio técnico',
          socio: true,
          custo_mensal_centavos: 1_000_000,
          horas_disponiveis_mes: 160,
          aproveitamento_pb: 4_000,
          parte_tecnica_pb: 6_000,
        },
        { descricao: 'Analista', socio: false, aproveitamento_pb: 7_500, parte_tecnica_pb: 10_000 },
      ],
    })
  })

  it('a tela de custos não tem violações de acessibilidade com a equipe aberta', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/configuracoes/custos')
    await screen.findByText(/Ainda não configurado/)
    await usuario.click(screen.getByRole('button', { name: 'Calcular pela equipe' }))
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => v.id)).toEqual([])
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
