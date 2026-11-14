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
  horasVenda: [{ id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valorCentavos: 10_000 }],
  custoFixoHoraCentavos: 5_000,
  tributosPb: 600,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 200,
  taxaPorAssinaturaCentavos: 400,
  valorVisitaCentavos: 15_000,
  custoKmCentavos: 120,
}

const doisItens = [
  { minutos: 120, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' }, // 2h: 200 + 100 de rateio = 300
  { minutos: 60, custoDiretoExtraCentavos: 5_000, horaVendaId: 'venda' }, // 1h: 100 + 50 extra + 50 de rateio = 200
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
  it('aplica acréscimo só no trabalho e contas e reparte pelo custo', () => {
    const p = precificarOrcamento({
      itens: doisItens,
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 2,
      margemPb: 3_000,
      base,
    })
    expect(p.pendencia).toBeNull()
    // Trabalho e contas 450 + 30% = 585; extras 50 e taxas fixas 8; ÷ 0,94 = 684,04
    expect(p.custoTotalCentavos).toBe(50_000)
    expect(p.fixosPorCobrancaCentavos).toBe(800)
    expect(p.precoTotalCentavos).toBe(68_404)
    // Repartição proporcional aos custos dos itens.
    expect(p.precosDosItens).toEqual([41_042, 27_362])
    expect(p.precosDosItens.reduce((a, b) => a + b, 0)).toBe(p.precoTotalCentavos)
    expect(p.precoVisitasCentavos).toBe(0)
  })

  it('a divisão fecha e o lucro corresponde ao acréscimo sobre trabalho e contas', () => {
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
    expect(d.tributosCentavos).toBe(4_104) // 6% de 684,04
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
    expect(d.lucroCentavos).toBe(13_500)
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
    // A visita permanece em 150; seus tributos são cobertos nos serviços.
    expect(p.valorVisitasCentavos).toBe(15_000)
    expect(p.precoVisitasCentavos).toBe(15_000)
    expect(p.precoTotalCentavos).toBe(84_149)
    // Só os serviços se repartem na proporção dos custos.
    expect(p.precosDosItens).toEqual([41_489, 27_660])
    expect(p.custoTotalCentavos).toBe(50_000)
  })

  it('despesa incluída entra no custo e se espalha pelas linhas', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' }],
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

  it('acrescenta 15% apenas ao trabalho e às contas, sem acréscimo nas despesas', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 600, custoDiretoExtraCentavos: 5_000, horaVendaId: 'venda' }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [15_000],
      quantidadeDeParcelas: 0,
      margemPb: 1_500,
      base: {
        ...base,
        horaTecnicaCentavos: 8_000,
        horasVenda: [
          { id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valorCentavos: 8_000 },
        ],
        custoFixoHoraCentavos: 2_000,
        tributosPb: 0,
        taxaPorAssinaturaCentavos: 0,
      },
    })
    expect(p.precoTotalCentavos).toBe(135_000)
    expect(p.divisao?.lucroCentavos).toBe(15_000)
  })

  it('usa as horas de venda escolhidas, não o custo interno: exemplo confirmado', () => {
    const p = precificarOrcamento({
      itens: Array.from({ length: 3 }, () => ({
        minutos: 60,
        custoDiretoExtraCentavos: 0,
        horaVendaId: 'venda',
      })),
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 3_000,
      base: {
        ...base,
        horaTecnicaCentavos: 7_949,
        custoFixoHoraCentavos: 96,
        horasVenda: [
          { id: 'venda', profissao: 'Engenheiro', atividade: 'Júnior', valorCentavos: 21_419 },
        ],
        tributosPb: 0,
        taxaPorAssinaturaCentavos: 0,
      },
    })
    expect(p.custoTotalCentavos).toBe(24_135)
    expect(p.divisao?.horasDeVendaCentavos).toBe(64_257)
    expect(p.precoTotalCentavos).toBe(83_909)
    expect(p.divisao?.lucroCentavos).toBe(59_774)
  })

  it('sem hora de venda, preço pela margem fica pendente', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0 }],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 1_500,
      base,
    })
    expect(p.pendencia).toBe('hora_sem_valor')
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

  it('inclui tributos e taxas preservando o valor fixo das visitas', () => {
    const p = precificarOrcamento({
      itens: [{ minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' }],
      visitas: { quantidade: 2, kmPorVisita: 50, outrosPorVisitaCentavos: 1_000 },
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 1,
      margemPb: 2_000,
      base: {
        horaTecnicaCentavos: 9_500,
        horasVenda: [
          { id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valorCentavos: 9_500 },
        ],
        custoFixoHoraCentavos: 3_000,
        tributosPb: 600,
        taxasPb: 0,
        taxaPorCobrancaCentavos: 199,
        taxaPorAssinaturaCentavos: 400,
        valorVisitaCentavos: 15_000,
        custoKmCentavos: 120,
      },
    })
    // Serviços: (125 + 25 + 5,99 + 6% de 440) ÷ 0,94 = 194,03; visitas = 440.
    expect(p.precoTotalCentavos).toBe(63_403)
    expect(p.precosDosItens).toEqual([19_403])
    expect(p.precoVisitasCentavos).toBe(44_000)
  })

  it('itens sem custo repartem por igual', () => {
    const p = precificarOrcamento({
      itens: [
        { minutos: 0, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' },
        { minutos: 0, custoDiretoExtraCentavos: 0, horaVendaId: 'venda' },
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
    expect(p.precosDosItens).toEqual([258_180, 288_922, 30_115])
  })

  it('com responsável, o custo usa a hora dele; fora da equipe, volta para a profissão', () => {
    const p = precificarOrcamento({
      formaDePreco: 'margem',
      itens: [
        { minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'h-civil', responsavelId: 'm-1' },
        { minutos: 60, custoDiretoExtraCentavos: 0, horaVendaId: 'h-bio-sr', responsavelId: 'm-x' },
      ],
      visitas: SEM_VISITAS,
      despesasIncluidasCentavos: [],
      quantidadeDeParcelas: 0,
      margemPb: 2_000,
      base: { ...comTabela, custoHoraPorMembro: [{ membroId: 'm-1', horaCentavos: 6_000 }] },
    })
    // 1h × (60,00 + 0,96) = 60,96; responsável fora da equipe: Biólogo, 1h × (57,47 + 0,96) = 58,43
    expect(p.custosDosItens.map((c) => c.totalCentavos)).toEqual([6_096, 5_843])
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
