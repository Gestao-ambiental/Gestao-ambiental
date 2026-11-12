import { describe, expect, it } from 'vitest'

import {
  SEM_VISITAS,
  custoHoraPorProfissao,
  valorDasVisitas,
  precificarOrcamento,
  rateioPorConta,
  type BaseDoPreco,
} from './preco-do-orcamento'

// Hora técnica R$ 100, custo fixo por hora R$ 50, tributos 6%, sem taxas percentuais,
// R$ 2 por cobrança e R$ 4 de assinatura, visita R$ 150, km R$ 1,20.
const base: BaseDoPreco = {
  horaTecnicaCentavos: 10_000,
  custoFixoHoraCentavos: 5_000,
  tributosPb: 600,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 200,
  taxaPorAssinaturaCentavos: 400,
  valorVisitaCentavos: 15_000,
  custoKmCentavos: 120,
}

const doisItens = [
  { minutos: 120, custoDiretoExtraCentavos: 0 }, // 2h: 200 + 100 de rateio = 300
  { minutos: 60, custoDiretoExtraCentavos: 5_000 }, // 1h: 100 + 50 extra + 50 de rateio = 200
]

describe('valorDasVisitas', () => {
  it('soma valor fixo, km e outros gastos por visita', () => {
    // 2 × (150 + 80 km × 1,20 + 20) = 2 × 266 = 532
    expect(
      valorDasVisitas({ quantidade: 2, kmPorVisita: 80, outrosPorVisitaCentavos: 2_000 }, base),
    ).toBe(53_200)
  })
  it('zero visitas custa zero', () => {
    expect(valorDasVisitas(SEM_VISITAS, base)).toBe(0)
  })
  it('recusa quantidade negativa ou fracionária', () => {
    expect(() => valorDasVisitas({ ...SEM_VISITAS, quantidade: -1 }, base)).toThrow()
    expect(() => valorDasVisitas({ ...SEM_VISITAS, quantidade: 1.5 }, base)).toThrow()
  })
})

describe('precificarOrcamento', () => {
  it('aplica uma margem só no total e reparte pelo custo', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 2,
      margemPb: 3_000,
      base,
    })
    expect(p.pendencia).toBeNull()
    // custo 500 + fixos (2 × 2 + 4 = 8) = 508 ÷ (1 − 0,30 − 0,06) = 793,75
    expect(p.custoTotalCentavos).toBe(50_000)
    expect(p.fixosPorCobrancaCentavos).toBe(800)
    expect(p.precoTotalCentavos).toBe(79_375)
    // Repartição 300 : 200 → 476,25 e 317,50
    expect(p.precosDosItens).toEqual([47_625, 31_750])
    expect(p.precosDosItens.reduce((a, b) => a + b, 0)).toBe(p.precoTotalCentavos)
    expect(p.precoVisitasCentavos).toBe(0)
  })

  it('a divisão do valor fecha com o preço e o lucro dá a margem escolhida', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 2,
      margemPb: 3_000,
      base,
    })
    const d = p.divisao
    expect(d).not.toBeNull()
    if (!d || p.precoTotalCentavos === null) return
    expect(d.trabalhoTecnicoCentavos).toBe(30_000)
    expect(d.outrosCustosDiretosCentavos).toBe(5_000)
    expect(d.contasDaConsultoriaCentavos).toBe(15_000)
    expect(d.tributosCentavos).toBe(4_763) // 6% de 793,75
    expect(d.taxasCentavos).toBe(800)
    const soma =
      d.trabalhoTecnicoCentavos +
      d.outrosCustosDiretosCentavos +
      d.contasDaConsultoriaCentavos +
      d.visitasCentavos +
      d.despesasIncluidasCentavos +
      d.tributosCentavos +
      d.taxasCentavos +
      d.lucroCentavos
    expect(soma).toBe(p.precoTotalCentavos)
    expect(Math.round((d.lucroCentavos * 10_000) / p.precoTotalCentavos)).toBe(3_000)
  })

  it('visitas têm preço fixo, sem margem, numa linha própria', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: { quantidade: 1, kmPorVisita: 0, outrosPorVisitaCentavos: 0 },
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 3_000,
      base,
    })
    // Serviços: (500 + 6 de taxas fixas) ÷ 0,64 = 790,625 → 790,63; visita: 150 fixo
    expect(p.valorVisitasCentavos).toBe(15_000)
    expect(p.precoVisitasCentavos).toBe(15_000)
    expect(p.precoTotalCentavos).toBe(94_063)
    // Só os serviços se repartem: 300 : 200 → 474,38 e 316,25
    expect(p.precosDosItens).toEqual([47_438, 31_625])
    expect(p.custoTotalCentavos).toBe(50_000)
  })

  it('despesa incluída entra no custo e se espalha pelas linhas', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0 }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [10_000],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: { ...base, tributosPb: 0, taxaPorAssinaturaCentavos: 0 },
    })
    // custo 150 + 100 de despesa = 250, sem margem nem tributos
    expect(p.precoTotalCentavos).toBe(25_000)
    expect(p.precosDosItens).toEqual([25_000])
  })

  it('fica pendente, sem preço, com despesa incluída a cotar', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [null],
      quantidadeDeParcelas: 1,
      margemPb: 3_000,
      base,
    })
    expect(p.pendencia).toBe('despesa_a_cotar')
    expect(p.precoTotalCentavos).toBeNull()
    expect(p.precosDosItens).toEqual([0, 0])
    expect(p.custoTotalCentavos).toBeNull()
  })

  it('fica pendente sem base de custos e sem itens', () => {
    expect(
      precificarOrcamento({
        itens: doisItens,
        visitas: SEM_VISITAS,
        despesasIncluidasCentavos: [],
        quantidadeDeParcelas: 1,
        margemPb: 3_000,
        base: null,
      }).pendencia,
    ).toBe('sem_base')
    expect(
      precificarOrcamento({
        itens: [],
        visitas: SEM_VISITAS,
        despesasIncluidasCentavos: [],
        quantidadeDeParcelas: 1,
        margemPb: 3_000,
        base,
      }).pendencia,
    ).toBe('sem_itens')
  })

  it('margem + tributos + taxas a 100% ou mais não tem preço', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 9_400,
      base,
    })
    expect(p.pendencia).toBe('percentuais_impossiveis')
  })

  it('dá o mesmo centavo que o banco (caso de supabase/tests/190_orcamentos.test.sql)', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0 }],
      visitas: { quantidade: 2, kmPorVisita: 50, outrosPorVisitaCentavos: 1_000 },
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 2_000,
      base: {
        horaTecnicaCentavos: 9_500,
        custoFixoHoraCentavos: 3_000,
        tributosPb: 600,
        taxasPb: 0,
        taxaPorCobrancaCentavos: 199,
        taxaPorAssinaturaCentavos: 400,
        valorVisitaCentavos: 15_000,
        custoKmCentavos: 120,
      },
    })
    // Serviços: (125 + 5,99) ÷ 0,74 = 177,01; visitas: 2 × (150 + 50 × 1,20 + 10) = 440
    expect(p.precoTotalCentavos).toBe(61_701)
    expect(p.precosDosItens).toEqual([17_701])
    expect(p.precoVisitasCentavos).toBe(44_000)
  })

  it('itens sem custo repartem por igual', () => {
    const p = precificarOrcamento({
      itens: [
        { minutos: 0, custoDiretoExtraCentavos: 0 },
        { minutos: 0, custoDiretoExtraCentavos: 0 },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 0,
      base: { ...base, tributosPb: 0 },
    })
    // Só as taxas fixas: 6,00 → 3,00 + 3,00
    expect(p.precosDosItens).toEqual([300, 300])
  })
})

describe('precificarOrcamento pela tabela (hora de venda) e custo por profissão', () => {
  // O mesmo cenário de supabase/tests/210_preco_pela_tabela.test.sql.
  const comTabela = {
    ...base,
    custoFixoHoraCentavos: 96,
    horaTecnicaCentavos: 7_212, // média da equipe
    tributosPb: 0,
    taxaPorCobrancaCentavos: 0,
    taxaPorAssinaturaCentavos: 0,
    valorVisitaCentavos: 25_000,
    horasVenda: [
      { id: 'h-eng-jr', profissao: 'Eng. ambiental', atividade: 'Júnior', valorCentavos: 21_419 },
      {
        id: 'h-eng-pericia',
        profissao: 'Eng. ambiental',
        atividade: 'Perícia ambiental',
        valorCentavos: 35_698,
      },
      { id: 'h-bio-sr', profissao: 'Biólogo', atividade: 'Sênior', valorCentavos: 30_000 },
      { id: 'h-civil', profissao: 'Eng. civil', atividade: 'Júnior', valorCentavos: 25_000 },
    ],
    custoHoraPorProfissao: [
      { profissao: 'Biólogo', horaTecnicaCentavos: 5_747 },
      { profissao: 'Eng. ambiental', horaTecnicaCentavos: 7_949 },
    ],
  }

  it('pela tabela dá o mesmo centavo que o banco', () => {
    const p = precificarOrcamento({
      formaDePreco: 'tabela',
      itens: [
        { minutos: 600, custoDiretoExtraCentavos: 0, horaVendaId: 'h-eng-jr' },
        { minutos: 480, custoDiretoExtraCentavos: 0, horaVendaId: 'h-bio-sr' },
        { minutos: 120, custoDiretoExtraCentavos: 0, horaVendaId: 'h-eng-pericia' },
      ],
      visitas: { quantidade: 1, kmPorVisita: 0, outrosPorVisitaCentavos: 0 },
      despesasIncluidasCentavos: [5_000],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: comTabela,
    })
    expect(p.pendencia).toBeNull()
    expect(p.precosDosItens).toEqual([216_228, 242_283, 72_075])
    expect(p.precoTotalCentavos).toBe(555_586)
  })

  it('pela margem, cada item usa a hora técnica da profissão; sem ninguém dela, a média', () => {
    const p = precificarOrcamento({
      formaDePreco: 'margem',
      itens: [
        { minutos: 600, custoDiretoExtraCentavos: 0, horaVendaId: 'h-eng-jr' },
        { minutos: 480, custoDiretoExtraCentavos: 0, horaVendaId: 'h-bio-sr' },
        { minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'h-civil' },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 2_000,
      base: comTabela,
    })
    expect(p.custosDosItens.map((c) => c.totalCentavos)).toEqual([80_450, 46_744, 7_308])
    expect(p.precosDosItens).toEqual([100_563, 58_430, 9_135])
  })

  it('a margem vira resultado: 10h de engenheiro a R$ 214,19 com custo de R$ 80,45 por hora', () => {
    const p = precificarOrcamento({
      formaDePreco: 'tabela',
      itens: [{ minutos: 600, custoDiretoExtraCentavos: 0, horaVendaId: 'h-eng-jr' }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: comTabela,
    })
    // Preço 2.141,90; custo 10 × (79,49 + 0,96) = 804,50; lucro 1.337,40 = 62,44%
    expect(p.precoTotalCentavos).toBe(214_190)
    expect(p.divisao?.lucroCentavos).toBe(133_740)
    expect(p.margemResultantePb).toBe(6_244)
  })

  it('item sem hora de venda válida deixa o preço pendente', () => {
    const p = precificarOrcamento({
      formaDePreco: 'tabela',
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'nao-existe' }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 0,
      base: comTabela,
    })
    expect(p.pendencia).toBe('hora_sem_valor')
    expect(p.precoTotalCentavos).toBeNull()
  })
})

describe('custoHoraPorProfissao', () => {
  it('agrupa por profissão, sem caixa nem espaços, e deixa de fora quem não tem profissão', () => {
    const linha = (custo: number, horas: number, profissao: string | null) => ({
      custoMensalCentavos: custo,
      horasDisponiveisMes: horas,
      aproveitamentoPb: 10_000,
      parteTecnicaPb: 10_000,
      socio: true,
      profissao,
    })
    expect(
      custoHoraPorProfissao([
        linha(1_375_177, 173, 'Eng. ambiental'),
        linha(500_000, 87, ' biólogo '),
        linha(300_000, 100, null),
      ]),
    ).toEqual([
      { profissao: 'Eng. ambiental', horaTecnicaCentavos: 7_949 },
      { profissao: 'biólogo', horaTecnicaCentavos: 5_747 },
    ])
  })
})

describe('rateioPorConta', () => {
  it('reparte o rateio pelo valor de cada conta, com a equipe por último', () => {
    const linhas = rateioPorConta(
      10_000,
      [
        { descricao: 'Aluguel', valorCentavos: 300_000 },
        { descricao: 'Energia elétrica', valorCentavos: 50_000 },
        { descricao: 'Internet', valorCentavos: 0 },
      ],
      150_000,
    )
    expect(linhas).toEqual([
      { descricao: 'Aluguel', valorCentavos: 6_000 },
      { descricao: 'Energia elétrica', valorCentavos: 1_000 },
      { descricao: 'Equipe: gestão e administrativo', valorCentavos: 3_000 },
    ])
  })
  it('sem contas ou sem rateio não mostra nada', () => {
    expect(rateioPorConta(0, [{ descricao: 'Aluguel', valorCentavos: 1 }], 0)).toEqual([])
    expect(rateioPorConta(500, [], 0)).toEqual([])
  })
})
