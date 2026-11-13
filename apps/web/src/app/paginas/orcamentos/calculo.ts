// Liga o rascunho da tela às regras de preço do domínio. Só apresentação: o banco confere limites e
// permissões e grava o preço com a mesma regra (private.precificar_orcamento).

import {
  aplicarPontosBase,
  distribuirPorMaiorResto,
  diferencaDasParcelas,
  lerReais,
  precificarOrcamento,
  rateioPorConta,
  situacaoDaMargem,
  type PrecoDoOrcamento,
  type SituacaoDaMargem,
} from '@gestao-ambiental/domain'

import type { BaseDoOrcamento, FormaDePreco, VisitasDoOrcamento } from '@/lib/api/orcamentos'

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
  custoDiretoExtraCentavos: number
  /** Linha da tabela de hora de venda (preço pela tabela e profissão do custo). */
  horaVendaId?: string | null
  /** Membro responsável: o custo usa a hora dele. */
  responsavelId?: string | null
  /** Quantidade na unidade da linha de preço (× 10.000). */
  quantidadeDezMilesimos?: number | null
  /** Preço fechado do pacote. */
  precoFechadoCentavos?: number | null
}

export interface CalculoDoOrcamento extends PrecoDoOrcamento {
  /** A margem escolhida comparada à mínima da base (a margem mínima vale para o total). */
  situacaoDaMargem: SituacaoDaMargem
  /** Quanto o rateio deste orçamento cobre de cada conta do mês (prévia das contas). */
  contas: { descricao: string; valorCentavos: number }[]
  /** Parcelas em centavos, por maior resto. Vazio sem parcelas ou sem preço. */
  parcelasCentavos: number[]
  /** Quanto falta (positivo) ou sobra (negativo) para as parcelas fecharem 100%. */
  diferencaParcelasPontosBase: number
}

/**
 * Preço do orçamento pela regra do domínio (precificarOrcamento), com uma margem só, escolhida
 * no fim. O banco grava o mesmo resultado ao salvar (private.precificar_orcamento).
 *
 * `despesasIncluidasCentavos`: estimativas das despesas incluídas no preço (`null` = a cotar).
 */
export function calcularOrcamento(
  linhas: readonly LinhaParaCalculo[],
  visitas: VisitasDoOrcamento,
  despesasIncluidasCentavos: readonly (number | null)[],
  percentuaisDasParcelas: readonly number[],
  margemPb: number,
  base: BaseDoOrcamento | null,
  formaDePreco: FormaDePreco = 'margem',
): CalculoDoOrcamento {
  const preco = precificarOrcamento({
    formaDePreco,
    itens: linhas,
    visitas,
    despesasIncluidasCentavos,
    quantidadeDeParcelas: percentuaisDasParcelas.length,
    margemPb,
    base,
  })
  // Sem contas detalhadas, a prévia mostra o total do mês numa linha só.
  const contas = base
    ? rateioPorConta(
        preco.custosDosItens.reduce((soma, c) => soma + (c.rateioCentavos ?? 0), 0),
        base.contas.length > 0
          ? base.contas
          : [
              {
                descricao: 'Contas do mês (total)',
                valorCentavos: base.custosFixosMensaisCentavos,
              },
            ],
        base.custosFixosEquipeCentavos,
      )
    : []

  const diferencaParcelasPontosBase = diferencaDasParcelas(percentuaisDasParcelas)
  const total = preco.precoTotalCentavos
  // Fechando 100%, os centavos vão por maior resto (soma igual ao preço). Sem fechar, cada parcela
  // mostra o próprio percentual do preço, para a diferença ficar visível em vez de redistribuída.
  const parcelasCentavos =
    total === null || percentuaisDasParcelas.length === 0
      ? []
      : diferencaParcelasPontosBase === 0
        ? distribuirPorMaiorResto(total, percentuaisDasParcelas)
        : percentuaisDasParcelas.map((pontos) => aplicarPontosBase(total, pontos))

  return {
    ...preco,
    // Pela tabela, compara a margem que sobra; pela margem, a escolhida.
    situacaoDaMargem:
      base && preco.pendencia === null
        ? situacaoDaMargem(
            formaDePreco === 'tabela' ? (preco.margemResultantePb ?? 0) : margemPb,
            base.margemMinimaPb,
          )
        : 'pendente',
    contas,
    parcelasCentavos,
    diferencaParcelasPontosBase,
  }
}
