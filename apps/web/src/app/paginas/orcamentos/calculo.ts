// Liga o rascunho da tela às regras de preço do domínio. Só apresentação: os números gravados
// são os que a pessoa digitou; o banco confere limites e permissões.

import {
  custoDoItem,
  distribuirPorMaiorResto,
  diferencaDasParcelas,
  lerReais,
  precoSugerido,
  resultadoDoPreco,
  situacaoDaMargem,
  type SituacaoDaMargem,
} from '@gestao-ambiental/domain'

import type { BaseDoOrcamento } from '@/lib/api/orcamentos'

/** "8", "8,5" ou "8.5" → 8.5. `null` se não for um número de 0 a 10.000. */
export function lerHoras(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  const valor = Number(limpo)
  return valor <= 10_000 ? valor : null
}

/** "40" ou "33,33" → pontos-base (4000, 3333). `null` fora de 0 a 100. */
export function lerPercentual(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  const pontos = Math.round(Number(limpo) * 100)
  return pontos <= 10_000 ? pontos : null
}

/** 4000 → "40"; 3333 → "33,33". */
export function textoDoPercentual(pontosBase: number): string {
  const inteiro = Math.floor(pontosBase / 100)
  const fracao = pontosBase % 100
  return fracao === 0 ? String(inteiro) : `${String(inteiro)},${String(fracao).padStart(2, '0')}`
}

/** 1.5 → "1,5". */
export function textoDasHoras(horas: number): string {
  return String(horas).replace('.', ',')
}

/** Valor digitado em reais; vazio conta como zero. */
export function lerReaisOuZero(texto: string): number | null {
  return texto.trim() === '' ? 0 : lerReais(texto)
}

export interface LinhaParaCalculo {
  horas: number
  precoCentavos: number
  custoDiretoExtraCentavos: number
}

export interface CalculoDoItem {
  /** Custo interno (direto + rateio). `null` com rateio pendente. */
  custoCentavos: number | null
  margemPontosBase: number | null
  situacao: SituacaoDaMargem
}

export interface CalculoDoOrcamento {
  itens: CalculoDoItem[]
  custoTotalCentavos: number | null
  fixosPorCobrancaCentavos: number
  precoPraticadoCentavos: number
  /** `null` com rateio pendente ou percentuais impossíveis. */
  precoSugeridoCentavos: number | null
  margemPontosBase: number | null
  situacaoDaMargem: SituacaoDaMargem
  /** Parcelas em centavos, por maior resto. Vazio se as parcelas não têm peso. */
  parcelasCentavos: number[]
  /** Quanto falta (positivo) ou sobra (negativo) para as parcelas fecharem 100%. */
  diferencaParcelasPontosBase: number
}

/**
 * O custo fixo por hora já vem calculado na base do orçamento: a conta do domínio recebe esse
 * valor como custo do mês de uma hora, o que dá o mesmo resultado.
 */
export function calcularOrcamento(
  linhas: readonly LinhaParaCalculo[],
  percentuaisDasParcelas: readonly number[],
  base: BaseDoOrcamento | null,
): CalculoDoOrcamento {
  const baseDeCustos = base
    ? {
        horaTecnicaCentavos: base.horaTecnicaCentavos,
        custosFixosMensaisCentavos: base.custoFixoHoraCentavos,
        horasFaturaveisMes: 1,
      }
    : null
  const percentuais = {
    tributosPontosBase: base?.tributosPb ?? 0,
    taxasPontosBase: base?.taxasPb ?? 0,
  }
  const minima = base?.margemMinimaPb ?? 0

  const itens = linhas.map((linha): CalculoDoItem => {
    if (!baseDeCustos) return { custoCentavos: null, margemPontosBase: null, situacao: 'pendente' }
    const custo = custoDoItem(
      { horas: linha.horas, custoDiretoExtraCentavos: linha.custoDiretoExtraCentavos },
      baseDeCustos,
    ).totalCentavos
    if (custo === null) return { custoCentavos: null, margemPontosBase: null, situacao: 'pendente' }
    const margem = resultadoDoPreco(linha.precoCentavos, custo, 0, percentuais).margemPontosBase
    return {
      custoCentavos: custo,
      margemPontosBase: margem,
      situacao: situacaoDaMargem(margem, minima),
    }
  })

  const custoTotalCentavos = itens.every((item) => item.custoCentavos !== null)
    ? itens.reduce((soma, item) => soma + (item.custoCentavos ?? 0), 0)
    : null
  const fixosPorCobrancaCentavos = base
    ? percentuaisDasParcelas.length * base.taxaPorCobrancaCentavos + base.taxaPorAssinaturaCentavos
    : 0
  const precoPraticadoCentavos = linhas.reduce((soma, linha) => soma + linha.precoCentavos, 0)

  let precoSugeridoCentavos: number | null = null
  if (base && custoTotalCentavos !== null) {
    try {
      precoSugeridoCentavos = precoSugerido(custoTotalCentavos, fixosPorCobrancaCentavos, {
        margemPontosBase: base.margemDesejadaPb,
        ...percentuais,
      })
    } catch {
      precoSugeridoCentavos = null
    }
  }

  const margemPontosBase =
    custoTotalCentavos === null
      ? null
      : resultadoDoPreco(
          precoPraticadoCentavos,
          custoTotalCentavos,
          fixosPorCobrancaCentavos,
          percentuais,
        ).margemPontosBase

  const somaDosPesos = percentuaisDasParcelas.reduce((soma, peso) => soma + peso, 0)
  const parcelasCentavos =
    percentuaisDasParcelas.length > 0 && somaDosPesos > 0
      ? distribuirPorMaiorResto(precoPraticadoCentavos, percentuaisDasParcelas)
      : []

  return {
    itens,
    custoTotalCentavos,
    fixosPorCobrancaCentavos,
    precoPraticadoCentavos,
    precoSugeridoCentavos,
    margemPontosBase,
    situacaoDaMargem: base ? situacaoDaMargem(margemPontosBase, minima) : 'pendente',
    parcelasCentavos,
    diferencaParcelasPontosBase: diferencaDasParcelas(percentuaisDasParcelas),
  }
}
