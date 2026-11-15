// Orçamento rápido (ADR-0023): serviço com preço digitado, sem linha da tabela, e orçamento sem
// custos e taxas configurados. Mesmos centavos de supabase/tests/380_orcamento_rapido.test.sql.
import { describe, expect, it } from 'vitest'

import { SEM_VISITAS, precificarOrcamento, type BaseDoPreco } from './preco-do-orcamento'

// Hora técnica R$ 100, contas R$ 50 por hora, tributos 6%, R$ 2 por cobrança e R$ 4 de assinatura.
const base: BaseDoPreco = {
  horaTecnicaCentavos: 10_000,
  horasVenda: [{ id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valorCentavos: 10_000 }],
  custoFixoHoraCentavos: 5_000,
  tributosPb: 600,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 200,
  taxaPorAssinaturaCentavos: 400,
  valorVisitaCentavos: 15_000,
  custoKmCentavos: 120,
}

describe('orçamento sem custos e taxas configurados', () => {
  it('soma os preços digitados, as despesas incluídas e as visitas, sem tributo nem margem', () => {
    const p = precificarOrcamento({
      itens: [
        { minutos: 120, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 150_000 },
        { minutos: 60, custoDiretoExtraCentavos: 5_000, precoFechadoCentavos: 80_000 },
      ],
      // O km é ignorado sem a base: cada visita vale o digitado.
      visitas: { quantidade: 2, kmPorVisita: 50, outrosPorVisitaCentavos: 20_000 },
      despesasIncluidasCentavos: [10_001],
      quantidadeDeParcelas: 3,
      margemPb: 3_000,
      base: null,
    })
    expect(p.pendencia).toBeNull()
    // Despesa de 100,01 repartida 150.000 : 80.000 por maior resto.
    expect(p.precosDosItens).toEqual([156_522, 83_479])
    expect(p.valorVisitasCentavos).toBe(40_000)
    expect(p.precoVisitasCentavos).toBe(40_000)
    expect(p.precoTotalCentavos).toBe(280_001)
    expect(p.fixosPorCobrancaCentavos).toBe(0)
  })

  it('custo, lucro e margem ficam não calculados, nunca zero', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 90_000 }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 2_000,
      base: null,
    })
    expect(p.precoTotalCentavos).toBe(90_000)
    expect(p.custoTotalCentavos).toBeNull()
    expect(p.margemResultantePb).toBeNull()
    expect(p.divisao).toBeNull()
    expect(p.custosDosItens).toEqual([])
  })

  it('só visitas e um serviço: visitas × valor de cada visita', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 0, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 0 }],
      visitas: { quantidade: 3, kmPorVisita: 0, outrosPorVisitaCentavos: 12_550 },
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: null,
    })
    expect(p.precoTotalCentavos).toBe(37_650)
    expect(p.precosDosItens).toEqual([0])
  })

  it('serviço ligado à tabela de preços ou sem preço digitado deixa pendente', () => {
    const daTabela = precificarOrcamento({
      itens: [
        { minutos: 60, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 10_000 },
        { minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 0,
      base: null,
    })
    expect(daTabela.pendencia).toBe('sem_base')
    expect(daTabela.precoTotalCentavos).toBeNull()
    expect(daTabela.precosDosItens).toEqual([0, 0])

    const semPreco = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, precoFechadoCentavos: null }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 0,
      base: null,
    })
    expect(semPreco.pendencia).toBe('sem_base')
  })

  it('despesa incluída a cotar continua deixando pendente', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 10_000 }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [5_000, null],
      quantidadeDeParcelas: 1,
      margemPb: 0,
      base: null,
    })
    expect(p.pendencia).toBe('despesa_a_cotar')
    expect(p.precoTotalCentavos).toBeNull()
  })

  it('sem serviços continua "sem itens"', () => {
    const p = precificarOrcamento({
      itens: [],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: null,
    })
    expect(p.pendencia).toBe('sem_itens')
  })
})

describe('preço digitado com custos e taxas configurados', () => {
  it('vale como preço fixo: sem acréscimo, com tributos e taxas por fora, nas duas formas', () => {
    for (const formaDePreco of ['tabela', 'margem'] as const) {
      const p = precificarOrcamento({
        formaDePreco,
        itens: [{ minutos: 120, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 100_000 }],
        visitas: SEM_VISITAS,
        despesasIncluidasCentavos: [],
        quantidadeDeParcelas: 1,
        margemPb: 3_000,
        base,
      })
      expect(p.pendencia).toBeNull()
      expect(p.precoTotalCentavos).toBe(100_000)
      // Custo: 2h × 100 + 2h × 50 de contas = 300; as horas seguem valendo.
      expect(p.custoTotalCentavos).toBe(30_000)
      expect(p.divisao?.precosFechadosCentavos).toBe(100_000)
      expect(p.divisao?.tributosCentavos).toBe(6_000)
      // 1.000 − 300 − 60 de tributos − 6 de taxas fixas = 634 → 63,40% do preço.
      expect(p.divisao?.lucroCentavos).toBe(63_400)
      expect(p.margemResultantePb).toBe(6_340)
    }
  })

  it('preço digitado abaixo do custo: a margem resultante fica negativa', () => {
    const p = precificarOrcamento({
      formaDePreco: 'tabela',
      itens: [{ minutos: 120, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 10_000 }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base,
    })
    // 100 − 300 − 6 de tributos − 4 de assinatura = −210.
    expect(p.divisao?.lucroCentavos).toBe(-21_000)
    expect(p.margemResultantePb).toBe(-21_000)
  })

  it('mistura preço digitado e hora da tabela: só a hora recebe o acréscimo', () => {
    const p = precificarOrcamento({
      itens: [
        { minutos: 120, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' },
        { minutos: 60, custoDiretoExtraCentavos: 0, precoFechadoCentavos: 50_000 },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 3_000,
      base,
    })
    // Hora: (200 + 100 de contas) × 1,30 + 4 de assinatura, com os 6% sobre tudo, inclusive os
    // 500 do digitado: (394 × 10.000 + 500 × 600) ÷ 9.400 = 451,06.
    expect(p.precosDosItens).toEqual([45_106, 50_000])
    expect(p.precoTotalCentavos).toBe(95_106)
    expect(p.divisao?.precosFechadosCentavos).toBe(50_000)
    expect(p.divisao?.horasDeVendaCentavos).toBe(20_000)
  })

  it('serviço sem linha da tabela e sem preço digitado fica pendente', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: null }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 3_000,
      base,
    })
    expect(p.pendencia).toBe('hora_sem_valor')
  })
})
