import { describe, expect, it } from 'vitest'

import { SEM_VISITAS, precificarOrcamento, type BaseDoPreco } from './preco-do-orcamento'

// Exemplos do ADR-0018 (números fictícios de teste, não preços sugeridos). Os mesmos centavos estão
// em supabase/tests/240_unidades_de_cobranca.test.sql.
const base: BaseDoPreco = {
  horaTecnicaCentavos: 3_000,
  custoFixoHoraCentavos: 1_000,
  tributosPb: 0,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 0,
  taxaPorAssinaturaCentavos: 0,
  valorVisitaCentavos: 0,
  custoKmCentavos: 0,
  horasVenda: [
    { id: 'h', profissao: 'Eng.', atividade: 'Hora', valorCentavos: 16_000 },
    { id: 'ha', profissao: 'Bio.', atividade: 'Levantamento', valorCentavos: 8_000, unidade: 'ha' },
    { id: 'pac', profissao: 'Eng.', atividade: 'PGRSS', valorCentavos: 120_000, unidade: 'pacote' },
    { id: 'dia', profissao: 'Bio.', atividade: 'Campo', valorCentavos: 50_000, unidade: 'diaria' },
  ],
}

const comum = {
  visitas: SEM_VISITAS,
  despesasIncluidasCentavos: [] as (number | null)[],
  quantidadeDeParcelas: 0,
  margemPb: 0,
}

describe('unidades de cobrança (ADR-0018)', () => {
  it('hectare: quantidade × preço; as horas seguem no custo', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'tabela',
      base,
      itens: [
        // 12,5 ha × 80,00 = 1.000,00; custo 20h × (30,00 + 10,00) = 800,00
        {
          minutos: 1_200,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'ha',
          quantidadeDezMilesimos: 125_000,
        },
      ],
    })
    expect(p.precosDosItens).toEqual([100_000])
    expect(p.custoTotalCentavos).toBe(80_000)
    expect(p.divisao?.lucroCentavos).toBe(20_000)
    expect(p.margemResultantePb).toBe(2_000)
  })

  it('pacote e hora no mesmo orçamento: despesa repartida, soma exata', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'tabela',
      base,
      despesasIncluidasCentavos: [10_001],
      itens: [
        {
          minutos: 1_200,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'pac',
          precoFechadoCentavos: 120_000,
        },
        // 7h30 × 160,00 = 1.200,00
        { minutos: 450, custoDiretoExtraCentavos: 0, horaVendaId: 'h' },
      ],
    })
    expect(p.precosDosItens).toEqual([125_001, 125_000])
    expect(p.precoTotalCentavos).toBe(250_001)
    expect(p.custoTotalCentavos).toBe(120_001)
    expect(p.divisao?.lucroCentavos).toBe(130_000)
    expect(p.divisao?.precosFechadosCentavos).toBe(120_000)
  })

  it('diária com logística: quantidade de diárias e despesa incluída uma vez só', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'tabela',
      base,
      despesasIncluidasCentavos: [25_000],
      itens: [
        {
          minutos: 1_440,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'dia',
          quantidadeDezMilesimos: 30_000,
        },
      ],
    })
    // 3 × 500,00 + 250,00 de barco = 1.750,00; custo 24h × 40,00 + 250,00 = 1.210,00
    expect(p.precosDosItens).toEqual([175_000])
    expect(p.custoTotalCentavos).toBe(121_000)
    expect(p.divisao?.lucroCentavos).toBe(54_000)
  })

  it('pela margem, o pacote fica fora do acréscimo; tributos cobrem o pacote também', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'margem',
      margemPb: 2_000,
      base: { ...base, tributosPb: 1_000 },
      itens: [
        {
          minutos: 1_200,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'pac',
          precoFechadoCentavos: 120_000,
        },
        { minutos: 450, custoDiretoExtraCentavos: 0, horaVendaId: 'h' },
      ],
    })
    // Base do acréscimo = 1.200,00 + 75,00 de contas = 1.275,00; acréscimo 20% = 255,00.
    // (1.275 + 255) ÷ 0,90 + 1.200 × 10% ÷ 0,90 = 1.833,33
    expect(p.precosDosItens).toEqual([120_000, 183_333])
    expect(p.divisao?.baseDoAcrescimoCentavos).toBe(127_500)
    expect(p.divisao?.tributosCentavos).toBe(30_333)
    expect(p.divisao?.lucroCentavos).toBe(163_000)
  })

  it('só pacotes pela margem: preço fechado mais as despesas, sem acréscimo', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'margem',
      margemPb: 3_000,
      base,
      despesasIncluidasCentavos: [10_001],
      itens: [
        {
          minutos: 600,
          custoDiretoExtraCentavos: 5_000,
          horaVendaId: 'pac',
          precoFechadoCentavos: 120_000,
        },
      ],
    })
    expect(p.precosDosItens).toEqual([130_001])
  })

  it('sem quantidade ou sem preço do pacote, o preço fica pendente', () => {
    const semQuantidade = precificarOrcamento({
      ...comum,
      formaDePreco: 'tabela',
      base,
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'ha' }],
    })
    expect(semQuantidade.pendencia).toBe('quantidade_pendente')
    const semPreco = precificarOrcamento({
      ...comum,
      formaDePreco: 'margem',
      base,
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'pac' }],
    })
    expect(semPreco.pendencia).toBe('quantidade_pendente')
  })

  it('meia unidade de centavo arredonda para cima, como o banco', () => {
    const p = precificarOrcamento({
      ...comum,
      formaDePreco: 'tabela',
      base,
      itens: [
        {
          minutos: 0,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'ha',
          quantidadeDezMilesimos: 1,
        },
      ],
    })
    // 0,0001 ha × 8.000 centavos = 0,8 centavo → 1
    expect(p.precosDosItens).toEqual([1])
  })
})
