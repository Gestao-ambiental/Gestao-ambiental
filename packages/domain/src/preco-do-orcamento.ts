// Preço do orçamento com margem única, escolhida no fim (decisão do Eduardo, 11/11/2026).
// Os itens mostram horas e custo; o preço total sai de custo ÷ (1 − margem − tributos − taxas) e é
// repartido entre os itens pelo custo de cada um, com centavos por maior resto. As visitas técnicas
// viram uma linha própria. O banco grava os mesmos valores (private.precificar_orcamento).

import {
  aplicarPontosBase,
  custoDoItem,
  distribuirPorMaiorResto,
  ErroDeOrcamento,
  PONTOS_BASE_TOTAL,
  PRECO_MAXIMO_CENTAVOS,
  type CustoDoItem,
} from './orcamento'

/** Limites das visitas, conferidos também no banco. */
export const MAXIMO_VISITAS = 100
export const MAXIMO_KM_POR_VISITA = 10_000
/** Contas do mês na base de custos (energia, água, internet…). */
export const MAXIMO_CONTAS_DO_MES = 50

/** Base de custos já copiada para o orçamento. */
export interface BaseDoPreco {
  horaTecnicaCentavos: number
  /** (Custos fixos do mês + parte administrativa da equipe) ÷ horas faturáveis. */
  custoFixoHoraCentavos: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
  /** Custo de uma visita técnica (tempo e logística), cadastrado em Custos e taxas. */
  valorVisitaCentavos: number
  /** Custo por km rodado (combustível, manutenção). */
  custoKmCentavos: number
}

export interface VisitasDoOrcamento {
  quantidade: number
  /** Km de ida e volta de cada visita. Zero quando a visita é perto e o valor fixo basta. */
  kmPorVisita: number
  /** Pedágio, estacionamento, alimentação… por visita. */
  outrosPorVisitaCentavos: number
}

export const SEM_VISITAS: VisitasDoOrcamento = {
  quantidade: 0,
  kmPorVisita: 0,
  outrosPorVisitaCentavos: 0,
}

function exigirInteiro(valor: number, maximo: number): void {
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > maximo) {
    throw new ErroDeOrcamento('valor_invalido')
  }
}

/** quantidade × (valor da visita + km × custo do km + outros gastos). */
export function custoDasVisitas(
  visitas: VisitasDoOrcamento,
  base: Pick<BaseDoPreco, 'valorVisitaCentavos' | 'custoKmCentavos'>,
): number {
  exigirInteiro(visitas.quantidade, MAXIMO_VISITAS)
  exigirInteiro(visitas.kmPorVisita, MAXIMO_KM_POR_VISITA)
  exigirInteiro(visitas.outrosPorVisitaCentavos, 99_999_999_999)
  exigirInteiro(base.valorVisitaCentavos, 99_999_999_999)
  exigirInteiro(base.custoKmCentavos, 99_999_999_999)
  const porVisita =
    base.valorVisitaCentavos +
    visitas.kmPorVisita * base.custoKmCentavos +
    visitas.outrosPorVisitaCentavos
  return visitas.quantidade * porVisita
}

export type PendenciaDoPreco =
  'sem_itens' | 'sem_base' | 'despesa_a_cotar' | 'percentuais_impossiveis' | 'valor_invalido'

export interface DivisaoDoValor {
  /** Horas × hora técnica. */
  trabalhoTecnicoCentavos: number
  /** "Outros custos" dos itens (ART, laboratório, materiais). */
  outrosCustosDiretosCentavos: number
  /** Rateio das contas do mês e da parte administrativa da equipe. */
  contasDaConsultoriaCentavos: number
  visitasCentavos: number
  despesasIncluidasCentavos: number
  tributosCentavos: number
  /** Taxas percentuais de cobrança + taxas fixas por cobrança e assinatura. */
  taxasCentavos: number
  lucroCentavos: number
}

export interface PrecoDoOrcamento {
  custosDosItens: CustoDoItem[]
  custoVisitasCentavos: number
  /** Soma dos custos; `null` sem base ou com despesa incluída a cotar. */
  custoTotalCentavos: number | null
  fixosPorCobrancaCentavos: number
  /** `null` enquanto houver pendência. */
  precoTotalCentavos: number | null
  /** Preço de cada item, na ordem; zeros enquanto houver pendência. */
  precosDosItens: number[]
  /** Preço da linha "Visitas técnicas"; zero sem visitas ou com pendência. */
  precoVisitasCentavos: number
  margemPb: number
  pendencia: PendenciaDoPreco | null
  divisao: DivisaoDoValor | null
}

export interface EntradaDoPreco {
  itens: readonly { minutos: number; custoDiretoExtraCentavos: number }[]
  visitas: VisitasDoOrcamento
  /** Estimativas das despesas incluídas no preço; `null` = a cotar. */
  despesasIncluidasCentavos: readonly (number | null)[]
  quantidadeDeParcelas: number
  /** Margem sobre o preço de venda, escolhida no fim do orçamento. */
  margemPb: number
  base: BaseDoPreco | null
}

/**
 * Preço do orçamento inteiro. Pesos da repartição: o custo de cada item e, se houver, o das visitas
 * (última linha). Custos todos zero repartem por igual. Despesas incluídas entram no custo total e,
 * portanto, se espalham pelas linhas na proporção do custo.
 */
export function precificarOrcamento(entrada: EntradaDoPreco): PrecoDoOrcamento {
  const { itens, base, margemPb } = entrada
  const zeros = itens.map(() => 0)
  const pendente = (
    pendencia: PendenciaDoPreco,
    parcial: Partial<PrecoDoOrcamento> = {},
  ): PrecoDoOrcamento => ({
    custosDosItens: [],
    custoVisitasCentavos: 0,
    custoTotalCentavos: null,
    fixosPorCobrancaCentavos: 0,
    precoTotalCentavos: null,
    precosDosItens: zeros,
    precoVisitasCentavos: 0,
    margemPb,
    pendencia,
    divisao: null,
    ...parcial,
  })

  if (!base) return pendente(itens.length === 0 ? 'sem_itens' : 'sem_base')

  const baseDeCustos = {
    horaTecnicaCentavos: base.horaTecnicaCentavos,
    custosFixosMensaisCentavos: base.custoFixoHoraCentavos,
    horasFaturaveisMes: 1,
  }
  const custosDosItens = itens.map((item) => custoDoItem(item, baseDeCustos))
  const custoVisitasCentavos = custoDasVisitas(entrada.visitas, base)
  const fixosPorCobrancaCentavos =
    entrada.quantidadeDeParcelas * base.taxaPorCobrancaCentavos + base.taxaPorAssinaturaCentavos
  const aCotar = entrada.despesasIncluidasCentavos.some((valor) => valor === null)
  const despesasIncluidasCentavos = entrada.despesasIncluidasCentavos.reduce<number>(
    (soma, valor) => soma + (valor ?? 0),
    0,
  )
  const custoItens = custosDosItens.reduce((soma, c) => soma + (c.totalCentavos ?? 0), 0)
  const parcial = {
    custosDosItens,
    custoVisitasCentavos,
    fixosPorCobrancaCentavos,
    custoTotalCentavos: aCotar
      ? null
      : custoItens + custoVisitasCentavos + despesasIncluidasCentavos,
  }

  if (itens.length === 0) return pendente('sem_itens', parcial)
  if (aCotar) return pendente('despesa_a_cotar', parcial)
  if (margemPb + base.tributosPb + base.taxasPb >= PONTOS_BASE_TOTAL) {
    return pendente('percentuais_impossiveis', parcial)
  }

  const custoTotalCentavos = custoItens + custoVisitasCentavos + despesasIncluidasCentavos
  // Conta em inteiros, arredondando a metade para cima: o banco faz round() em numeric e chega
  // ao mesmo centavo (ponto flutuante poderia errar um centavo no caso ",5").
  const divisor = BigInt(PONTOS_BASE_TOTAL - margemPb - base.tributosPb - base.taxasPb)
  const numerador =
    BigInt(custoTotalCentavos + fixosPorCobrancaCentavos) * BigInt(PONTOS_BASE_TOTAL)
  const precoTotalCentavos = Number((numerador * 2n + divisor) / (divisor * 2n))
  if (!Number.isSafeInteger(precoTotalCentavos) || precoTotalCentavos > PRECO_MAXIMO_CENTAVOS) {
    return pendente('valor_invalido', parcial)
  }

  const comVisitas = custoVisitasCentavos > 0
  const pesos = custosDosItens.map((c) => c.totalCentavos ?? 0)
  if (comVisitas) pesos.push(custoVisitasCentavos)
  const somaDosPesos = pesos.reduce((soma, peso) => soma + peso, 0)
  const partes = distribuirPorMaiorResto(
    precoTotalCentavos,
    somaDosPesos > 0 ? pesos : pesos.map(() => 1),
  )
  const precoVisitasCentavos = comVisitas ? (partes.pop() ?? 0) : 0

  const trabalhoTecnicoCentavos = custosDosItens.reduce(
    (soma, c, indice) => soma + c.diretoCentavos - (itens[indice]?.custoDiretoExtraCentavos ?? 0),
    0,
  )
  const outrosCustosDiretosCentavos = itens.reduce(
    (soma, item) => soma + item.custoDiretoExtraCentavos,
    0,
  )
  const contasDaConsultoriaCentavos = custosDosItens.reduce(
    (soma, c) => soma + (c.rateioCentavos ?? 0),
    0,
  )
  const tributosCentavos = aplicarPontosBase(precoTotalCentavos, base.tributosPb)
  const taxasCentavos =
    aplicarPontosBase(precoTotalCentavos, base.taxasPb) + fixosPorCobrancaCentavos
  return {
    ...parcial,
    custoTotalCentavos,
    precoTotalCentavos,
    precosDosItens: partes,
    precoVisitasCentavos,
    margemPb,
    pendencia: null,
    divisao: {
      trabalhoTecnicoCentavos,
      outrosCustosDiretosCentavos,
      contasDaConsultoriaCentavos,
      visitasCentavos: custoVisitasCentavos,
      despesasIncluidasCentavos,
      tributosCentavos,
      taxasCentavos,
      lucroCentavos: precoTotalCentavos - custoTotalCentavos - tributosCentavos - taxasCentavos,
    },
  }
}

/**
 * Quanto do rateio deste orçamento cobre cada conta do mês, na proporção do valor de cada uma.
 * A parte administrativa da equipe entra como última linha, se houver. Soma igual ao rateio.
 */
export function rateioPorConta(
  rateioCentavos: number,
  contas: readonly { descricao: string; valorCentavos: number }[],
  equipeAdministrativaCentavos: number,
): { descricao: string; valorCentavos: number }[] {
  const linhas = contas
    .filter((conta) => conta.valorCentavos > 0)
    .map((conta) => ({ descricao: conta.descricao, peso: conta.valorCentavos }))
  if (equipeAdministrativaCentavos > 0) {
    linhas.push({
      descricao: 'Equipe: gestão e administrativo',
      peso: equipeAdministrativaCentavos,
    })
  }
  if (linhas.length === 0 || rateioCentavos <= 0) return []
  const valores = distribuirPorMaiorResto(
    rateioCentavos,
    linhas.map((linha) => linha.peso),
  )
  return linhas.map((linha, indice) => ({
    descricao: linha.descricao,
    valorCentavos: valores[indice] ?? 0,
  }))
}
