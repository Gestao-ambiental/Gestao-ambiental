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

// Exemplo da auditoria de 10/11/2026: hora R$ 95, custo fixo R$ 30/h, margem 30%, mínima 25%,
// tributos 6%, Pix R$ 1,99 por parcela e R$ 4,00 por documento assinado.
const base = {
  hora_tecnica_centavos: 9_500,
  custo_fixo_hora_centavos: 3_000,
  margem_desejada_pb: 3_000,
  margem_minima_pb: 2_500,
  tributos_pb: 600,
  taxas_pb: 0,
  taxa_por_cobranca_centavos: 199,
  taxa_por_assinatura_centavos: 400,
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
}

function manual(minutos: number, precoManualCentavos: number, custoDiretoExtraCentavos = 0) {
  return { minutos, precoAutomatico: false, precoManualCentavos, custoDiretoExtraCentavos }
}

describe('cálculo da tela de orçamento', () => {
  it('reproduz o exemplo conferido: sugerido R$ 8.999,95 e margem 29,3%', () => {
    const calculo = calcularOrcamento(
      [manual(480, 170_000, 24_000), manual(1_440, 510_000, 26_000), manual(600, 210_000)],
      [],
      [4_000, 3_000, 3_000],
      baseDoCalculo,
    )
    expect(calculo.custoTotalCentavos).toBe(575_000)
    expect(calculo.fixosPorCobrancaCentavos).toBe(997)
    expect(calculo.precoSugeridoCentavos).toBe(899_995)
    expect(calculo.margemPontosBase).toBe(2_928)
    expect(calculo.situacaoDaMargem).toBe('adequada')
    expect(calculo.itens.map((item) => item.situacao)).toEqual([
      'abaixo_da_minima',
      'adequada',
      'adequada',
    ])
    expect(calculo.parcelasCentavos).toEqual([356_000, 267_000, 267_000])
  })

  it('preço automático: 1h a R$ 195,31 atinge a margem desejada', () => {
    const calculo = calcularOrcamento(
      [{ minutos: 60, precoAutomatico: true, precoManualCentavos: 0, custoDiretoExtraCentavos: 0 }],
      [],
      [10_000],
      baseDoCalculo,
    )
    expect(calculo.itens[0]).toMatchObject({ precoCentavos: 19_531, margemPontosBase: 3_000 })
    expect(calculo.precoPraticadoCentavos).toBe(19_531)
  })

  it('despesa incluída entra no custo; a cotar deixa custo e sugerido pendentes', () => {
    const itens = [manual(480, 170_000, 24_000)]
    const com = calcularOrcamento(itens, [26_000], [10_000], baseDoCalculo)
    const sem = calcularOrcamento(itens, [], [10_000], baseDoCalculo)
    expect(com.custoTotalCentavos).toBe((sem.custoTotalCentavos ?? 0) + 26_000)
    const aCotar = calcularOrcamento(itens, [null], [10_000], baseDoCalculo)
    expect(aCotar.despesaIncluidaACotar).toBe(true)
    expect(aCotar.custoTotalCentavos).toBeNull()
    expect(aCotar.precoSugeridoCentavos).toBeNull()
    expect(aCotar.margemPontosBase).toBeNull()
  })

  it('sem base de custos, o rateio fica pendente e não há preço sugerido', () => {
    const calculo = calcularOrcamento([manual(480, 100_000)], [], [10_000], null)
    expect(calculo.custoTotalCentavos).toBeNull()
    expect(calculo.precoSugeridoCentavos).toBeNull()
    expect(calculo.margemPontosBase).toBeNull()
    expect(calculo.situacaoDaMargem).toBe('pendente')
  })

  it('sem itens não há preço sugerido, mesmo com taxas fixas', () => {
    const calculo = calcularOrcamento([], [], [], baseDoCalculo)
    expect(calculo.precoSugeridoCentavos).toBeNull()
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

  it('o editor mostra preço sugerido, praticado, margem e parcelas', async () => {
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByRole('heading', { name: 'Indústria Horizonte' })).toBeInTheDocument()
    expect(screen.getByText('R$ 8.999,95')).toBeInTheDocument()
    expect(screen.getByText('R$ 8.900,00')).toBeInTheDocument()
    expect(screen.getByText('29,3%')).toBeInTheDocument()
    expect(screen.getByText(/Um item está abaixo da margem mínima/)).toBeInTheDocument()
    expect(screen.getByText('3.560,00')).toBeInTheDocument()
    expect(screen.getByText('Somam 100% do preço praticado.')).toBeInTheDocument()
  })

  it('avisa quando as parcelas não fecham 100% e salva com a versão atual', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    const percentual = await screen.findByLabelText('Percentual da parcela 3')
    await usuario.clear(percentual)
    await usuario.type(percentual, '25')
    expect(screen.getByText('Faltam 5,0% para fechar 100%.')).toBeInTheDocument()
    // Sem fechar 100%, cada parcela mostra o próprio percentual do preço (25% de R$ 8.900,00).
    expect(screen.getByText('2.225,00')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    expect(chamada?.[1]).toMatchObject({
      p_id: 'o1',
      p_row_version: 3,
      p_dados: {
        objeto: 'Licenciamento (LO)',
        parcelas: [
          { id: 'p1', descricao: 'Assinatura do contrato', dias: 3, percentual_pb: 4_000 },
          { id: 'p2', dias: 5, percentual_pb: 3_000 },
          { id: 'p3', dias: 0, percentual_pb: 2_500 },
        ],
      },
    })
  })

  it('horas aceitam 1h30; digitar o preço vira manual e apagar volta ao automático', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
    await usuario.type(screen.getByLabelText('Serviço do item 4'), 'Revisão técnica')
    const horas = screen.getByLabelText('Horas do item 4')
    await usuario.type(horas, '1:30')
    await usuario.tab()
    expect(horas).toHaveValue('1h30')
    // 1h30 custa 142,50 + 45,00 de rateio = 187,50 ÷ 0,64 = 292,97, automático.
    const preco = screen.getByLabelText('Preço do item 4')
    expect(preco).toHaveValue('292,97')

    await usuario.clear(preco)
    await usuario.type(preco, '350')
    expect(
      screen.getByRole('button', { name: 'Usar preço automático no item 4' }),
    ).toBeInTheDocument()
    await usuario.clear(horas)
    await usuario.type(horas, '2h')
    expect(preco).toHaveValue('350,00')

    await usuario.clear(preco)
    await usuario.tab()
    // 2h: 190 + 60 = 250 ÷ 0,64 = 390,63.
    expect(preco).toHaveValue('390,63')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (chamada?.[1] as { p_dados: { itens: unknown[] } }).p_dados
    expect(dados.itens[3]).toMatchObject({
      descricao: 'Revisão técnica',
      minutos: 120,
      preco_automatico: true,
    })
    expect(dados.itens[0]).toMatchObject({ minutos: 480, preco_automatico: false })
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

  it('despesa incluída sem valor fica a cotar e deixa a margem pendente', async () => {
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
    expect(screen.getByText(/Há despesa incluída no preço ainda a cotar/)).toBeInTheDocument()
    expect(screen.queryByText('29,3%')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const chamada = falso.cliente.rpc.mock.calls.find(([nome]) => nome === 'salvar_orcamento')
    const dados = (chamada?.[1] as { p_dados: { despesas: unknown[] } }).p_dados
    expect(dados.despesas[1]).toMatchObject({ estimativa_centavos: null, tratamento: 'incluida' })
  })

  it('sem base de custos, avisa e não inventa preço sugerido', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { obter_orcamento: { data: orcamento({ base: null }) } } }),
    )
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByText(/Custos e taxas ainda não configurados/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurar custos e taxas' })).toBeInTheDocument()
  })

  it('proposta enviada é só leitura', async () => {
    falso.reiniciar(
      cenario('gestao', { rpc: { obter_orcamento: { data: orcamento({ situacao: 'enviada' }) } } }),
    )
    renderizarApp('/orcamentos/o1')
    expect(await screen.findByText(/Mudanças viram uma nova revisão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Preço do item 1')).toBeDisabled()
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

  it('o editor não tem violações de acessibilidade detectáveis', async () => {
    const { container } = renderizarApp('/orcamentos/o1')
    await screen.findByRole('heading', { name: 'Indústria Horizonte' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => v.id)).toEqual([])
  })
})
