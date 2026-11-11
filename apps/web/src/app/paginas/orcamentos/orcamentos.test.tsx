import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { calcularOrcamento, lerHoras, lerPercentual, textoDoPercentual } from './calculo'

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
        horas: 8,
        preco_centavos: 170_000,
        custo_direto_extra_centavos: 24_000,
      },
      {
        id: 'i2',
        descricao: 'RCA/PCA e PGRS',
        horas: 24,
        preco_centavos: 510_000,
        custo_direto_extra_centavos: 26_000,
      },
      {
        id: 'i3',
        descricao: 'Protocolo e acompanhamento',
        horas: 10,
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
      { id: 'p1', descricao: '3 dias após a assinatura', percentual_pb: 4_000 },
      { id: 'p2', descricao: '5 dias após o protocolo', percentual_pb: 3_000 },
      { id: 'p3', descricao: 'Na emissão da licença', percentual_pb: 3_000 },
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

describe('cálculo da tela de orçamento', () => {
  it('reproduz o exemplo conferido: sugerido R$ 8.999,95 e margem 29,3%', () => {
    const calculo = calcularOrcamento(
      [
        { horas: 8, precoCentavos: 170_000, custoDiretoExtraCentavos: 24_000 },
        { horas: 24, precoCentavos: 510_000, custoDiretoExtraCentavos: 26_000 },
        { horas: 10, precoCentavos: 210_000, custoDiretoExtraCentavos: 0 },
      ],
      [4_000, 3_000, 3_000],
      {
        horaTecnicaCentavos: 9_500,
        custoFixoHoraCentavos: 3_000,
        margemDesejadaPb: 3_000,
        margemMinimaPb: 2_500,
        tributosPb: 600,
        taxasPb: 0,
        taxaPorCobrancaCentavos: 199,
        taxaPorAssinaturaCentavos: 400,
      },
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

  it('sem base de custos, o rateio fica pendente e não há preço sugerido', () => {
    const calculo = calcularOrcamento(
      [{ horas: 8, precoCentavos: 100_000, custoDiretoExtraCentavos: 0 }],
      [10_000],
      null,
    )
    expect(calculo.custoTotalCentavos).toBeNull()
    expect(calculo.precoSugeridoCentavos).toBeNull()
    expect(calculo.margemPontosBase).toBeNull()
    expect(calculo.situacaoDaMargem).toBe('pendente')
  })

  it('sem itens não há preço sugerido, mesmo com taxas fixas', () => {
    const calculo = calcularOrcamento([], [], {
      horaTecnicaCentavos: 9_500,
      custoFixoHoraCentavos: 3_000,
      margemDesejadaPb: 3_000,
      margemMinimaPb: 2_500,
      tributosPb: 600,
      taxasPb: 0,
      taxaPorCobrancaCentavos: 199,
      taxaPorAssinaturaCentavos: 400,
    })
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
          { id: 'p1', percentual_pb: 4_000 },
          { id: 'p2', percentual_pb: 3_000 },
          { id: 'p3', percentual_pb: 2_500 },
        ],
      },
    })
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
