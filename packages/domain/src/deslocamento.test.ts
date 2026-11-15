import { describe, expect, it } from 'vitest'

import { modoDeDeslocamento, valorDoKm } from './deslocamento'
import {
  precificarOrcamento,
  profissaoObrigatoria,
  SEM_VISITAS,
  valorDasVisitas,
  type BaseDoPreco,
} from './preco-do-orcamento'

// Mesmos números de supabase/tests/340_dois_blocos_e_deslocamento.test.sql.
describe('valorDoKm', () => {
  it('preço do litro ÷ consumo: R$ 6,00 ÷ 12 km/l = R$ 0,50', () => {
    expect(
      valorDoKm({
        precoCombustivelCentavos: 600,
        consumoKmPorLitro: 12,
        acrescimoKmCentavos: null,
      }),
    ).toBe(50)
  })
  it('soma o acréscimo por km: 0,50 + 0,30 = 0,80', () => {
    expect(
      valorDoKm({ precoCombustivelCentavos: 600, consumoKmPorLitro: 12, acrescimoKmCentavos: 30 }),
    ).toBe(80)
  })
  it('arredonda ao centavo, metade para cima', () => {
    // 6,29 ÷ 11,5 = 0,54695… → 0,55
    expect(
      valorDoKm({ precoCombustivelCentavos: 629, consumoKmPorLitro: 11.5, acrescimoKmCentavos: 0 }),
    ).toBe(55)
    // 0,01 ÷ 2 = 0,005 → 0,01
    expect(
      valorDoKm({ precoCombustivelCentavos: 1, consumoKmPorLitro: 2, acrescimoKmCentavos: null }),
    ).toBe(1)
    // 5,99 ÷ 12,25 = 0,48897… → 0,49
    expect(
      valorDoKm({
        precoCombustivelCentavos: 599,
        consumoKmPorLitro: 12.25,
        acrescimoKmCentavos: null,
      }),
    ).toBe(49)
  })
  it('sem combustível, fica só o acréscimo (ou zero)', () => {
    expect(
      valorDoKm({
        precoCombustivelCentavos: null,
        consumoKmPorLitro: null,
        acrescimoKmCentavos: 120,
      }),
    ).toBe(120)
    expect(
      valorDoKm({
        precoCombustivelCentavos: null,
        consumoKmPorLitro: null,
        acrescimoKmCentavos: null,
      }),
    ).toBe(0)
  })
  it('recusa entradas inválidas', () => {
    const certo = {
      precoCombustivelCentavos: 600,
      consumoKmPorLitro: 12,
      acrescimoKmCentavos: null,
    }
    expect(valorDoKm({ ...certo, consumoKmPorLitro: null })).toBeNull()
    expect(valorDoKm({ ...certo, precoCombustivelCentavos: null })).toBeNull()
    expect(valorDoKm({ ...certo, consumoKmPorLitro: 0 })).toBeNull()
    expect(valorDoKm({ ...certo, consumoKmPorLitro: -12 })).toBeNull()
    expect(valorDoKm({ ...certo, consumoKmPorLitro: 12.345 })).toBeNull()
    expect(valorDoKm({ ...certo, consumoKmPorLitro: 1000 })).toBeNull()
    expect(valorDoKm({ ...certo, consumoKmPorLitro: Number.NaN })).toBeNull()
    expect(valorDoKm({ ...certo, precoCombustivelCentavos: -1 })).toBeNull()
    expect(valorDoKm({ ...certo, precoCombustivelCentavos: 1.5 })).toBeNull()
    expect(valorDoKm({ ...certo, acrescimoKmCentavos: -1 })).toBeNull()
    // R$ 999.999.999,99 ÷ 0,01 km/l passa do teto.
    expect(
      valorDoKm({ ...certo, precoCombustivelCentavos: 99_999_999_999, consumoKmPorLitro: 0.01 }),
    ).toBeNull()
  })
})

describe('modoDeDeslocamento', () => {
  it('usa o modo escolhido', () => {
    expect(
      modoDeDeslocamento({ deslocamentoModo: 'km', valorVisitaCentavos: 100, custoKmCentavos: 0 }),
    ).toBe('km')
  })
  it('base antiga sem modo: km só quando só o km tem valor', () => {
    expect(modoDeDeslocamento({ valorVisitaCentavos: 0, custoKmCentavos: 120 })).toBe('km')
    expect(modoDeDeslocamento({ valorVisitaCentavos: 15_000, custoKmCentavos: 120 })).toBe('visita')
    expect(modoDeDeslocamento({ valorVisitaCentavos: 0, custoKmCentavos: 0 })).toBe('visita')
    expect(
      modoDeDeslocamento({
        deslocamentoModo: null,
        valorVisitaCentavos: 15_000,
        custoKmCentavos: 0,
      }),
    ).toBe('visita')
  })
})

describe('valorDasVisitas por modo', () => {
  const visitas = { quantidade: 2, kmPorVisita: 80, outrosPorVisitaCentavos: 2_000 }
  const valores = { valorVisitaCentavos: 15_000, custoKmCentavos: 50 }
  it('por visita: só o valor fixo e os outros gastos; o km não entra', () => {
    // 2 × (150 + 20) = 340
    expect(valorDasVisitas(visitas, { ...valores, deslocamentoModo: 'visita' })).toBe(34_000)
  })
  it('por km: km × valor do km e os outros gastos; o valor da visita não entra', () => {
    // 2 × (80 × 0,50 + 20) = 2 × 60 = 120
    expect(valorDasVisitas(visitas, { ...valores, deslocamentoModo: 'km' })).toBe(12_000)
  })
  it('orçamento antigo, sem modo: soma os dois, como antes', () => {
    // 2 × (150 + 40 + 20) = 420
    expect(valorDasVisitas(visitas, valores)).toBe(42_000)
    expect(valorDasVisitas(visitas, { ...valores, deslocamentoModo: null })).toBe(42_000)
  })
  it('sem visitas, zero em qualquer modo', () => {
    expect(valorDasVisitas(SEM_VISITAS, { ...valores, deslocamentoModo: 'km' })).toBe(0)
  })
})

describe('tabela em dois blocos', () => {
  it('profissão obrigatória só na hora', () => {
    expect(profissaoObrigatoria('hora')).toBe(true)
    for (const unidade of ['m2', 'ha', 'diaria', 'campanha', 'pacote'] as const) {
      expect(profissaoObrigatoria(unidade)).toBe(false)
    }
  })

  // Média da equipe 40,00/h; Bióloga 60,00/h; contas 10,00/h. Serviço por hectare sem "Quem faz".
  const base: BaseDoPreco = {
    horaTecnicaCentavos: 4_000,
    custoFixoHoraCentavos: 1_000,
    tributosPb: 0,
    taxasPb: 0,
    taxaPorCobrancaCentavos: 0,
    taxaPorAssinaturaCentavos: 0,
    valorVisitaCentavos: 0,
    custoKmCentavos: 0,
    custoHoraPorProfissao: [{ profissao: 'Bióloga', horaTecnicaCentavos: 6_000 }],
    horasVenda: [
      {
        id: 'servico',
        profissao: '',
        atividade: 'Inventário de fauna',
        valorCentavos: 10_000,
        unidade: 'ha',
      },
      {
        id: 'bio',
        profissao: 'Bióloga',
        atividade: 'Inventário de flora',
        valorCentavos: 10_000,
        unidade: 'ha',
      },
    ],
  }

  it('serviço sem "Quem faz" custa pela média da equipe', () => {
    const p = precificarOrcamento({
      // 3 h, 10 ha × 100,00 = 1.000,00
      itens: [
        {
          minutos: 180,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'servico',
          quantidadeDezMilesimos: 100_000,
        },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      formaDePreco: 'tabela',
      base,
    })
    expect(p.pendencia).toBeNull()
    // 3 h × 40,00 + 3 h × 10,00 de contas = 150,00
    expect(p.custosDosItens[0]?.totalCentavos).toBe(15_000)
    expect(p.precosDosItens).toEqual([100_000])
  })

  it('com "Quem faz", usa a hora da profissão', () => {
    const p = precificarOrcamento({
      itens: [
        {
          minutos: 180,
          custoDiretoExtraCentavos: 0,
          horaVendaId: 'bio',
          quantidadeDezMilesimos: 100_000,
        },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      formaDePreco: 'tabela',
      base,
    })
    // 3 h × 60,00 + 30,00 de contas = 210,00
    expect(p.custosDosItens[0]?.totalCentavos).toBe(21_000)
  })
})
