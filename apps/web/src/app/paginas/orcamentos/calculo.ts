// Liga o rascunho da tela às regras de preço do domínio. Só apresentação: o banco confere limites e
// permissões e grava o preço automático com a mesma regra (private.preco_automatico_do_item).

import {
  aplicarPontosBase,
  custoDoItem,
  distribuirPorMaiorResto,
  diferencaDasParcelas,
  lerReais,
  precoAutomaticoDoItem,
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

/** Dias após o marco: inteiro de 0 a 365; vazio é zero. */
export function lerDias(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return 0
  if (!/^\d{1,3}$/.test(limpo)) return null
  const dias = Number(limpo)
  return dias <= 365 ? dias : null
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

/** Estimativa de despesa: vazio é "a cotar" (`null`), nunca zero. `undefined` = valor inválido. */
export function lerEstimativa(texto: string): number | null | undefined {
  if (texto.trim() === '') return null
  return lerReais(texto) ?? undefined
}

export interface LinhaParaCalculo {
  minutos: number
  /** Verdadeiro: o preço sai do custo do item e da margem desejada. */
  precoAutomatico: boolean
  /** Preço digitado; só vale quando o preço é manual. */
  precoManualCentavos: number
  custoDiretoExtraCentavos: number
}

export interface CalculoDoItem {
  /** Custo interno (direto + rateio). `null` com rateio pendente. */
  custoCentavos: number | null
  /** Preço do item. `null` quando é automático e não há base de custos. */
  precoCentavos: number | null
  margemPontosBase: number | null
  situacao: SituacaoDaMargem
}

export interface CalculoDoOrcamento {
  itens: CalculoDoItem[]
  /** Custo dos itens + despesas incluídas no preço. `null` com rateio ou despesa a cotar pendentes. */
  custoTotalCentavos: number | null
  /** Há despesa incluída no preço ainda a cotar. */
  despesaIncluidaACotar: boolean
  fixosPorCobrancaCentavos: number
  precoPraticadoCentavos: number
  /** `null` com custo pendente ou percentuais impossíveis. */
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
 *
 * `despesasIncluidasCentavos`: estimativas das despesas incluídas no preço (`null` = a cotar).
 */
export function calcularOrcamento(
  linhas: readonly LinhaParaCalculo[],
  despesasIncluidasCentavos: readonly (number | null)[],
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
    const custo = baseDeCustos
      ? custoDoItem(
          { minutos: linha.minutos, custoDiretoExtraCentavos: linha.custoDiretoExtraCentavos },
          baseDeCustos,
        ).totalCentavos
      : null
    let preco: number | null = linha.precoManualCentavos
    if (linha.precoAutomatico) {
      preco = null
      if (base && custo !== null) {
        try {
          preco = precoAutomaticoDoItem(custo, {
            margemPontosBase: base.margemDesejadaPb,
            ...percentuais,
          })
        } catch {
          preco = null
        }
      }
    }
    if (custo === null || preco === null) {
      return {
        custoCentavos: custo,
        precoCentavos: preco,
        margemPontosBase: null,
        situacao: 'pendente',
      }
    }
    const margem = resultadoDoPreco(preco, custo, 0, percentuais).margemPontosBase
    return {
      custoCentavos: custo,
      precoCentavos: preco,
      margemPontosBase: margem,
      situacao: situacaoDaMargem(margem, minima),
    }
  })

  const despesaIncluidaACotar = despesasIncluidasCentavos.some((valor) => valor === null)
  const custoTotalCentavos =
    itens.every((item) => item.custoCentavos !== null) && !despesaIncluidaACotar
      ? itens.reduce((soma, item) => soma + (item.custoCentavos ?? 0), 0) +
        despesasIncluidasCentavos.reduce<number>((soma, valor) => soma + (valor ?? 0), 0)
      : null
  const fixosPorCobrancaCentavos = base
    ? percentuaisDasParcelas.length * base.taxaPorCobrancaCentavos + base.taxaPorAssinaturaCentavos
    : 0
  const precoPraticadoCentavos = itens.reduce((soma, item) => soma + (item.precoCentavos ?? 0), 0)

  let precoSugeridoCentavos: number | null = null
  // Sem itens não há o que precificar: só as taxas fixas não viram "preço sugerido".
  if (base && custoTotalCentavos !== null && linhas.length > 0) {
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

  // Fechando 100%, os centavos vão por maior resto (soma igual ao preço). Sem fechar, cada parcela
  // mostra o próprio percentual do preço, para a diferença ficar visível em vez de redistribuída.
  const diferencaParcelasPontosBase = diferencaDasParcelas(percentuaisDasParcelas)
  const parcelasCentavos =
    percentuaisDasParcelas.length === 0
      ? []
      : diferencaParcelasPontosBase === 0
        ? distribuirPorMaiorResto(precoPraticadoCentavos, percentuaisDasParcelas)
        : percentuaisDasParcelas.map((pontos) => aplicarPontosBase(precoPraticadoCentavos, pontos))

  return {
    itens,
    custoTotalCentavos,
    despesaIncluidaACotar,
    fixosPorCobrancaCentavos,
    precoPraticadoCentavos,
    precoSugeridoCentavos,
    margemPontosBase,
    situacaoDaMargem: base ? situacaoDaMargem(margemPontosBase, minima) : 'pendente',
    parcelasCentavos,
    diferencaParcelasPontosBase,
  }
}
