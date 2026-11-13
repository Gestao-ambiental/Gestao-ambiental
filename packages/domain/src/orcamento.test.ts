import { describe, expect, it } from 'vitest'

import {
  formatarReaisDigitados,
  ErroDeOrcamento,
  MAXIMO_PARCELAS,
  acrescimoEquivalente,
  aplicarPontosBase,
  composicaoDaEquipe,
  custoDoItem,
  horaDeCustoDaPessoa,
  custoFixoPorHora,
  diferencaDasParcelas,
  distribuirPorMaiorResto,
  formatarCentavos,
  formatarDuracao,
  formatarPontosBase,
  formatarReais,
  lerDuracao,
  lerReais,
  numeroDoOrcamento,
  precoAutomaticoDoItem,
  precoSugerido,
  resultadoDoPreco,
  situacaoDaMargem,
} from './orcamento'
import type { BaseDeCustos } from './orcamento'

// Exemplo conferido na auditoria de 10/11/2026: hora técnica R$ 95, custos fixos R$ 9.600/mês,
// 320 h faturáveis, margem 30%, tributos 6%, 3 cobranças Pix a R$ 1,99 e 1 assinatura a R$ 4,00.
const base: BaseDeCustos = {
  horaTecnicaCentavos: 9_500,
  custosFixosMensaisCentavos: 960_000,
  horasFaturaveisMes: 320,
}
const fixosPorCobranca = 3 * 199 + 400

describe('base de custos', () => {
  it('custo fixo por hora é o custo do mês dividido pelas horas faturáveis', () => {
    expect(custoFixoPorHora(base)).toBe(3_000)
  })

  it('sem horas faturáveis o rateio fica pendente, nunca zero', () => {
    expect(custoFixoPorHora({ ...base, horasFaturaveisMes: 0 })).toBeNull()
    const custo = custoDoItem(
      { minutos: 480, custoDiretoExtraCentavos: 0 },
      { ...base, horasFaturaveisMes: 0 },
    )
    expect(custo.diretoCentavos).toBe(76_000)
    expect(custo.rateioCentavos).toBeNull()
    expect(custo.totalCentavos).toBeNull()
  })

  it('custo do item soma horas, custos diretos e rateio, cada um uma vez', () => {
    expect(custoDoItem({ minutos: 480, custoDiretoExtraCentavos: 24_000 }, base)).toEqual({
      diretoCentavos: 100_000,
      rateioCentavos: 24_000,
      totalCentavos: 124_000,
    })
    expect(custoDoItem({ minutos: 1_440, custoDiretoExtraCentavos: 26_000 }, base)).toEqual({
      diretoCentavos: 254_000,
      rateioCentavos: 72_000,
      totalCentavos: 326_000,
    })
    expect(custoDoItem({ minutos: 600, custoDiretoExtraCentavos: 0 }, base).totalCentavos).toBe(
      125_000,
    )
  })

  it('conta por minuto: 1h20 não vira dízima', () => {
    // 80 min × R$ 95/h = R$ 126,666… → R$ 126,67; rateio 80 min × R$ 30/h = R$ 40,00.
    expect(custoDoItem({ minutos: 80, custoDiretoExtraCentavos: 0 }, base)).toEqual({
      diretoCentavos: 12_667,
      rateioCentavos: 4_000,
      totalCentavos: 16_667,
    })
  })

  it('recusa minutos fracionados', () => {
    expect(() => custoDoItem({ minutos: 1.5, custoDiretoExtraCentavos: 0 }, base)).toThrow(
      ErroDeOrcamento,
    )
  })

  it('recusa horas negativas ou fora do limite', () => {
    expect(() => custoDoItem({ minutos: -1, custoDiretoExtraCentavos: 0 }, base)).toThrow(
      ErroDeOrcamento,
    )
    expect(() => custoDoItem({ minutos: 600_001, custoDiretoExtraCentavos: 0 }, base)).toThrow(
      ErroDeOrcamento,
    )
  })
})

describe('composição pela equipe', () => {
  it('hora de custo da pessoa = custo do mês ÷ horas no mês', () => {
    // Piso: 173 h × 79,49 = 13.751,77 ÷ 173 h = 79,49.
    expect(
      horaDeCustoDaPessoa({
        custoMensalCentavos: 1_375_177,
        horasDisponiveisMes: 173,
        socio: true,
      }),
    ).toBe(7_949)
    expect(
      horaDeCustoDaPessoa({ custoMensalCentavos: 500_000, horasDisponiveisMes: 0, socio: false }),
    ).toBeNull()
  })

  it('hora técnica média = Σ custos ÷ Σ horas, com o pró-labore entrando uma vez', () => {
    const c = composicaoDaEquipe([
      { custoMensalCentavos: 1_000_000, horasDisponiveisMes: 160, socio: true },
      { custoMensalCentavos: 500_000, horasDisponiveisMes: 168, socio: false },
      { custoMensalCentavos: 300_000, horasDisponiveisMes: 168, socio: false },
    ])
    expect(c.custoTecnicoCentavos).toBe(1_800_000)
    expect(c.remuneracaoDosSociosCentavos).toBe(1_000_000)
    // 18.000 ÷ 496 h = 36,290… → R$ 36,29.
    expect(c.horasFaturaveisMes).toBe(496)
    expect(c.horaTecnicaCentavos).toBe(3_629)
  })

  it('sem horas não há hora técnica', () => {
    const c = composicaoDaEquipe([
      { custoMensalCentavos: 100_000, horasDisponiveisMes: 0, socio: false },
    ])
    expect(c.horaTecnicaCentavos).toBeNull()
  })

  it('recusa horas fora do mês ou fracionadas', () => {
    const linha = { custoMensalCentavos: 100_000, socio: false }
    expect(() => composicaoDaEquipe([{ ...linha, horasDisponiveisMes: 745 }])).toThrow(
      ErroDeOrcamento,
    )
    expect(() => composicaoDaEquipe([{ ...linha, horasDisponiveisMes: 1.5 }])).toThrow(
      ErroDeOrcamento,
    )
  })
})

describe('preço automático do item', () => {
  const percentuais = { margemPontosBase: 3_000, tributosPontosBase: 600, taxasPontosBase: 0 }

  it('parte do custo do item e atinge a margem desejada, sem taxas fixas por cobrança', () => {
    // 1h: R$ 95 de hora técnica + R$ 30 de rateio = R$ 125 ÷ (1 − 30% − 6%) = R$ 195,31.
    const custo = custoDoItem({ minutos: 60, custoDiretoExtraCentavos: 0 }, base).totalCentavos
    expect(custo).toBe(12_500)
    const preco = precoAutomaticoDoItem(12_500, percentuais)
    expect(preco).toBe(19_531)
    const margem = resultadoDoPreco(preco, 12_500, 0, percentuais).margemPontosBase
    expect(margem).toBe(3_000)
  })

  it('outros custos do item também recebem tributos e margem', () => {
    // Só R$ 240 de deslocamento: o preço cobre os 6% de tributo e a margem.
    expect(precoAutomaticoDoItem(24_000, percentuais)).toBe(37_500)
  })
})

describe('duração digitada', () => {
  it.each([
    ['', 0],
    ['2', 120],
    ['2h', 120],
    ['1,5', 90],
    ['1.5h', 90],
    ['1,25', 75],
    ['1h30', 90],
    ['1h 30', 90],
    ['1H30MIN', 90],
    ['1h5', 65],
    ['1:30', 90],
    ['01:30', 90],
    ['90min', 90],
    ['45 m', 45],
    ['10000', 600_000],
  ])('"%s" → %i minutos', (texto, minutos) => {
    expect(lerDuracao(texto)).toBe(minutos)
  })

  it.each(['1h90', '1:5', '1:75', 'abc', '-1', '1,333', '10001', '1h30h', 'h30'])(
    'recusa "%s"',
    (texto) => {
      expect(lerDuracao(texto)).toBeNull()
    },
  )

  it('formata minutos como horas e minutos', () => {
    expect(formatarDuracao(90)).toBe('1h30')
    expect(formatarDuracao(120)).toBe('2h')
    expect(formatarDuracao(45)).toBe('45min')
    expect(formatarDuracao(65)).toBe('1h05')
    expect(formatarDuracao(0)).toBe('0h')
  })
})

describe('preço sugerido', () => {
  const percentuais = { margemPontosBase: 3_000, tributosPontosBase: 600, taxasPontosBase: 0 }

  it('divide os custos por (1 − margem − tributos − taxas)', () => {
    expect(precoSugerido(575_000, fixosPorCobranca, percentuais)).toBe(899_995)
  })

  it('margem sobre o preço não é acréscimo sobre o custo', () => {
    // R$ 3.500 com 30% de margem dá R$ 5.000; 30% de acréscimo daria R$ 4.550 (23,1% de margem).
    const semTributos = { margemPontosBase: 3_000, tributosPontosBase: 0, taxasPontosBase: 0 }
    expect(precoSugerido(350_000, 0, semTributos)).toBe(500_000)
    expect(acrescimoEquivalente(3_000)).toBe(4_286)
    expect(resultadoDoPreco(455_000, 350_000, 0, semTributos).margemPontosBase).toBe(2_308)
  })

  it('tributos e taxas entram no divisor, não somados no fim', () => {
    const comTaxa = { margemPontosBase: 3_000, tributosPontosBase: 600, taxasPontosBase: 300 }
    const preco = precoSugerido(350_000, 0, comTaxa)
    expect(preco).toBe(573_770)
    expect(resultadoDoPreco(preco, 350_000, 0, comTaxa).margemPontosBase).toBe(3_000)
    // Somar 9% no fim deixa a margem em 26,8%.
    expect(resultadoDoPreco(545_000, 350_000, 0, comTaxa).margemPontosBase).toBe(2_678)
  })

  it('percentuais que somam 100% ou mais não têm preço', () => {
    expect(() =>
      precoSugerido(350_000, 0, {
        margemPontosBase: 8_000,
        tributosPontosBase: 1_600,
        taxasPontosBase: 499,
      }),
    ).toThrow('percentuais_invalidos')
    expect(() =>
      precoSugerido(350_000, 0, {
        margemPontosBase: 9_400,
        tributosPontosBase: 600,
        taxasPontosBase: 0,
      }),
    ).toThrow('percentuais_invalidos')
  })
})

describe('resultado com o preço praticado', () => {
  it('desconta custos, fixos por cobrança, tributos e taxas', () => {
    expect(
      resultadoDoPreco(890_000, 575_000, fixosPorCobranca, {
        tributosPontosBase: 600,
        taxasPontosBase: 0,
      }),
    ).toEqual({
      tributosCentavos: 53_400,
      taxasCentavos: 0,
      resultadoCentavos: 260_603,
      margemPontosBase: 2_928,
    })
  })

  it('preço zero não tem margem; prejuízo aparece negativo', () => {
    const semPercentuais = { tributosPontosBase: 0, taxasPontosBase: 0 }
    expect(resultadoDoPreco(0, 0, 0, semPercentuais).margemPontosBase).toBeNull()
    expect(resultadoDoPreco(100_000, 150_000, 0, semPercentuais)).toMatchObject({
      resultadoCentavos: -50_000,
      margemPontosBase: -5_000,
    })
  })

  it('a margem mínima compara o total; sem preço fica pendente', () => {
    expect(situacaoDaMargem(2_928, 2_500)).toBe('adequada')
    expect(situacaoDaMargem(2_110, 2_500)).toBe('abaixo_da_minima')
    expect(situacaoDaMargem(2_500, 2_500)).toBe('adequada')
    expect(situacaoDaMargem(null, 2_500)).toBe('pendente')
  })

  it('aplica pontos-base arredondando ao centavo', () => {
    expect(aplicarPontosBase(890_000, 600)).toBe(53_400)
    expect(aplicarPontosBase(333, 3_333)).toBe(111)
  })
})

describe('cronograma por maior resto (ORC-03)', () => {
  it('40/30/30 de R$ 8.900,00', () => {
    expect(distribuirPorMaiorResto(890_000, [4_000, 3_000, 3_000])).toEqual([
      356_000, 267_000, 267_000,
    ])
  })

  it('a soma é sempre o total e o centavo que sobra vai para o maior resto', () => {
    expect(distribuirPorMaiorResto(500_000, [1, 1, 1])).toEqual([166_667, 166_667, 166_666])
    expect(distribuirPorMaiorResto(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(distribuirPorMaiorResto(1, [1, 1, 1])).toEqual([1, 0, 0])
    for (const total of [1, 7, 99, 1_001, 890_000, 99_999_999_999]) {
      const partes = distribuirPorMaiorResto(total, [4_000, 3_000, 3_000, 1, 17])
      expect(partes.reduce((soma, parte) => soma + parte, 0)).toBe(total)
      expect(partes.every((parte) => parte >= 0)).toBe(true)
    }
  })

  it('peso zero recebe zero; pesos não precisam somar 100%', () => {
    expect(distribuirPorMaiorResto(1_000, [0, 1, 3])).toEqual([0, 250, 750])
  })

  it('recusa sem parcelas, parcelas demais e pesos inválidos', () => {
    expect(() => distribuirPorMaiorResto(1_000, [])).toThrow('sem_parcelas')
    expect(() =>
      distribuirPorMaiorResto(
        1_000,
        Array.from({ length: MAXIMO_PARCELAS + 1 }, () => 1),
      ),
    ).toThrow('parcelas_demais')
    expect(() => distribuirPorMaiorResto(1_000, [1, -1])).toThrow('pesos_invalidos')
    expect(() => distribuirPorMaiorResto(1_000, [0, 0])).toThrow('pesos_invalidos')
    expect(() => distribuirPorMaiorResto(-1, [1])).toThrow('valor_invalido')
    expect(
      distribuirPorMaiorResto(
        1_000,
        Array.from({ length: MAXIMO_PARCELAS }, () => 1),
      ),
    ).toHaveLength(MAXIMO_PARCELAS)
  })

  it('diz quanto falta ou sobra para as parcelas fecharem 100%', () => {
    expect(diferencaDasParcelas([4_000, 3_000, 3_000])).toBe(0)
    expect(diferencaDasParcelas([4_000, 3_000, 2_500])).toBe(500)
    expect(diferencaDasParcelas([6_000, 5_000])).toBe(-1_000)
  })
})

describe('apresentação', () => {
  it('numera por ano com três dígitos', () => {
    expect(numeroDoOrcamento(2026, 41)).toBe('ORC-2026-041')
    expect(numeroDoOrcamento(2026, 1_234)).toBe('ORC-2026-1234')
  })

  it('formata centavos e percentuais em pt-BR', () => {
    expect(formatarCentavos(890_000)).toBe('8.900,00')
    expect(formatarCentavos(997)).toBe('9,97')
    expect(formatarCentavos(5)).toBe('0,05')
    expect(formatarCentavos(123_456_789)).toBe('1.234.567,89')
    expect(formatarCentavos(-50_000)).toBe('−500,00')
    expect(formatarReais(899_995)).toBe('R$ 8.999,95')
    expect(formatarPontosBase(2_928)).toBe('29,3%')
    expect(formatarPontosBase(600)).toBe('6,0%')
    expect(formatarPontosBase(-5_000)).toBe('−50,0%')
  })

  it('põe o ponto de milhar enquanto a pessoa digita reais', () => {
    expect(formatarReaisDigitados('40000')).toBe('40.000')
    expect(formatarReaisDigitados('4000')).toBe('4.000')
    expect(formatarReaisDigitados('400')).toBe('400')
    expect(formatarReaisDigitados('40.0000')).toBe('400.000')
    expect(formatarReaisDigitados('1234567,891')).toBe('1.234.567,89')
    expect(formatarReaisDigitados('R$ 8.900,5')).toBe('8.900,5')
    expect(formatarReaisDigitados('0040')).toBe('40')
    expect(formatarReaisDigitados(',5')).toBe('0,5')
    expect(formatarReaisDigitados('12,3,4')).toBe('12,34')
    expect(formatarReaisDigitados('abc')).toBe('')
    expect(formatarReaisDigitados('')).toBe('')
    expect(lerReais(formatarReaisDigitados('40000'))).toBe(4_000_000)
  })

  it('lê reais digitados', () => {
    expect(lerReais('8.900,00')).toBe(890_000)
    expect(lerReais('R$ 8.900,5')).toBe(890_050)
    expect(lerReais('8900')).toBe(890_000)
    expect(lerReais('0,05')).toBe(5)
    expect(lerReais('')).toBeNull()
    expect(lerReais('abc')).toBeNull()
    expect(lerReais('1,234')).toBeNull()
    expect(lerReais('-10')).toBeNull()
  })
})
