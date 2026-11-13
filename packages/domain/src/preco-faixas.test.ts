import { describe, expect, it } from 'vitest'

import {
  SEM_VISITAS,
  precificarOrcamento,
  problemaDasFaixas,
  valorPorFaixas,
  type BaseDoPreco,
  type FaixaDePreco,
} from './preco-do-orcamento'

// Faixas progressivas e preço mínimo (ADR-0018, fatia 4). Números fictícios de teste, não preços
// sugeridos. Os mesmos centavos estão em supabase/tests/260_faixas_e_minimo.test.sql.
const M = 10_000 // 1 unidade em dez-milésimos

/** Até 500 m²: R$ 2,00/m²; acima: R$ 1,50/m². */
const faixasDoM2: FaixaDePreco[] = [
  { ateDezMilesimos: 500 * M, valorCentavos: 200 },
  { ateDezMilesimos: null, valorCentavos: 150 },
]

const base: BaseDoPreco = {
  horaTecnicaCentavos: 4_000,
  custoFixoHoraCentavos: 1_200,
  tributosPb: 0,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 0,
  taxaPorAssinaturaCentavos: 0,
  valorVisitaCentavos: 0,
  custoKmCentavos: 0,
  horasVenda: [
    {
      id: 'm2',
      profissao: 'Arq.',
      atividade: 'Projeto',
      valorCentavos: 200,
      unidade: 'm2',
      faixas: faixasDoM2,
    },
    {
      id: 'h',
      profissao: 'Eng.',
      atividade: 'Consulta',
      valorCentavos: 16_000,
      minimoCentavos: 50_000,
    },
    {
      id: 'ha',
      profissao: 'Bio.',
      atividade: 'Inventário',
      valorCentavos: 8_000,
      unidade: 'ha',
      minimoCentavos: 50_000,
    },
  ],
}

const comum = {
  visitas: SEM_VISITAS,
  quantidadeDeParcelas: 0,
  margemPb: 0,
  formaDePreco: 'tabela' as const,
  base,
}

describe('faixas progressivas (ADR-0018, 4.2)', () => {
  it('1.250 m²: 500 × 2,00 + 750 × 1,50 = 2.125,00; com despesa, sobra 565,00', () => {
    expect(valorPorFaixas(1_250 * M, faixasDoM2)).toBe(212_500)
    const p = precificarOrcamento({
      ...comum,
      despesasIncluidasCentavos: [10_000],
      itens: [
        {
          minutos: 1_800,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'm2',
          quantidadeDezMilesimos: 1_250 * M,
        },
      ],
    })
    expect(p.precosDosItens).toEqual([222_500])
    expect(p.custoTotalCentavos).toBe(166_000)
    expect(p.divisao?.lucroCentavos).toBe(56_500)
    expect(p.margemResultantePb).toBe(2_539)
  })

  it('fronteira: 500 fica toda na primeira faixa; 500,0001 põe só o excedente na segunda', () => {
    expect(valorPorFaixas(500 * M, faixasDoM2)).toBe(100_000)
    // 100.000 + 0,0001 × 150 = 100.000,015 → 100.000
    expect(valorPorFaixas(500 * M + 1, faixasDoM2)).toBe(100_000)
    expect(valorPorFaixas(0, faixasDoM2)).toBe(0)
  })

  it('arredonda uma vez, metade para cima', () => {
    const faixas: FaixaDePreco[] = [
      { ateDezMilesimos: M, valorCentavos: 0 },
      { ateDezMilesimos: null, valorCentavos: 5_000 },
    ]
    // 0,0001 × 5.000 = 0,5 centavo → 1
    expect(valorPorFaixas(M + 1, faixas)).toBe(1)
  })

  it('progressivo, não volume: a tarifa menor não vale para a quantidade toda', () => {
    // Volume daria 1.250 × 1,50 = 1.875,00; progressivo dá 2.125,00.
    expect(valorPorFaixas(1_250 * M, faixasDoM2)).not.toBe(187_500)
  })

  it('valida as faixas', () => {
    expect(problemaDasFaixas(faixasDoM2, 'm2')).toBeNull()
    expect(problemaDasFaixas([], 'hora')).toBeNull()
    expect(problemaDasFaixas(faixasDoM2, 'hora')).toBe('unidade_sem_faixas')
    expect(problemaDasFaixas(faixasDoM2, 'pacote')).toBe('unidade_sem_faixas')
    expect(problemaDasFaixas([{ ateDezMilesimos: 500 * M, valorCentavos: 200 }], 'm2')).toBe(
      'ultima_faixa_fechada',
    )
    expect(
      problemaDasFaixas(
        [
          { ateDezMilesimos: 500 * M, valorCentavos: 200 },
          { ateDezMilesimos: 500 * M, valorCentavos: 150 },
          { ateDezMilesimos: null, valorCentavos: 100 },
        ],
        'm2',
      ),
    ).toBe('faixas_fora_de_ordem')
    expect(
      problemaDasFaixas(
        [
          { ateDezMilesimos: null, valorCentavos: 200 },
          { ateDezMilesimos: null, valorCentavos: 150 },
        ],
        'm2',
      ),
    ).toBe('faixas_fora_de_ordem')
    expect(
      problemaDasFaixas(
        Array.from({ length: 11 }, (_, i) => ({
          ateDezMilesimos: i === 10 ? null : (i + 1) * M,
          valorCentavos: 100,
        })),
        'm2',
      ),
    ).toBe('faixas_demais')
  })
})

describe('preço mínimo (ADR-0018, P12)', () => {
  it('vale só para os honorários: outros custos e despesas vêm depois', () => {
    // 1 h × 160,00 = 160,00 < mínimo 500,00 → 500,00 + outros custos 30,00 + despesa 20,00
    const p = precificarOrcamento({
      ...comum,
      despesasIncluidasCentavos: [2_000],
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 3_000, horaVendaId: 'h' }],
    })
    expect(p.precosDosItens).toEqual([55_000])
    expect(p.divisao?.horasDeVendaCentavos).toBe(50_000)
  })

  it('acima do mínimo, o mínimo não muda nada', () => {
    // 12,5 ha × 80,00 = 1.000,00 > 500,00
    const p = precificarOrcamento({
      ...comum,
      despesasIncluidasCentavos: [],
      itens: [
        {
          minutos: 1_200,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'ha',
          quantidadeDezMilesimos: 125_000,
        },
      ],
    })
    expect(p.precosDosItens).toEqual([100_000])
  })

  it('pela margem, o mínimo entra na base do acréscimo', () => {
    // venda 500,00 (mínimo) + contas 12,00 = 512,00; acréscimo 10% = 51,20 → 563,20
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'margem',
      margemPb: 1_000,
      despesasIncluidasCentavos: [],
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'h' }],
    })
    expect(p.divisao?.baseDoAcrescimoCentavos).toBe(51_200)
    expect(p.precoTotalCentavos).toBe(56_320)
  })
})
