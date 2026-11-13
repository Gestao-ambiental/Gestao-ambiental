// Orçamentos (onda 5; ORC-02, ORC-03): formação do preço e cronograma de pagamento.
// Dinheiro sempre em centavos inteiros; percentuais em pontos-base (1% = 100), para a conta nunca
// passar por ponto flutuante de moeda. Custo e margem são internos: nada daqui vai para a proposta
// do cliente (09 Regras de negócio, §7.1). O banco confere o que for regra de escrita.

/** 100% em pontos-base. */
export const PONTOS_BASE_TOTAL = 10_000

/** Limites conferidos na tela e no banco (ORC-03). */
export const MAXIMO_PARCELAS = 60
export const PRECO_MAXIMO_CENTAVOS = 99_999_999_999
export const HORAS_MAXIMAS_DO_ITEM = 10_000
/** Duração do item é guardada em minutos inteiros: "1h20" não vira dízima. */
export const MINUTOS_MAXIMOS_DO_ITEM = HORAS_MAXIMAS_DO_ITEM * 60

export class ErroDeOrcamento extends Error {
  constructor(
    readonly codigo:
      | 'percentuais_invalidos'
      | 'valor_invalido'
      | 'parcelas_demais'
      | 'pesos_invalidos'
      | 'sem_parcelas',
  ) {
    super(codigo)
    this.name = 'ErroDeOrcamento'
  }
}

function exigirCentavos(valor: number): void {
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > PRECO_MAXIMO_CENTAVOS) {
    throw new ErroDeOrcamento('valor_invalido')
  }
}

function exigirPontosBase(valor: number): void {
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > PONTOS_BASE_TOTAL) {
    throw new ErroDeOrcamento('percentuais_invalidos')
  }
}

/** `numerador ÷ divisor` arredondado ao inteiro mais próximo (meio sobe), sem ponto flutuante. */
function dividirArredondando(numerador: bigint, divisor: bigint): number {
  return Number((numerador * 2n + divisor) / (divisor * 2n))
}

/** Parte inteira de `valor × pontosBase ÷ 10.000`, arredondada ao centavo mais próximo. */
export function aplicarPontosBase(valorCentavos: number, pontosBase: number): number {
  exigirCentavos(valorCentavos)
  exigirPontosBase(pontosBase)
  return Math.round((valorCentavos * pontosBase) / PONTOS_BASE_TOTAL)
}

// ---------------------------------------------------------------------------
// Base de custos da consultoria
// ---------------------------------------------------------------------------

export interface BaseDeCustos {
  /** Custo direto de uma hora técnica (salários e encargos), sem custos fixos. */
  horaTecnicaCentavos: number
  /** Custos fixos do mês (aluguel, energia, internet, sistemas…). */
  custosFixosMensaisCentavos: number
  /** Horas que a equipe consegue faturar no mês. Zero = rateio ainda não configurado. */
  horasFaturaveisMes: number
}

/**
 * Custo fixo por hora faturável. `null` quando a base não está configurada: rateio pendente nunca
 * é apresentado como zero.
 */
export function custoFixoPorHora(base: BaseDeCustos): number | null {
  exigirCentavos(base.custosFixosMensaisCentavos)
  if (!Number.isFinite(base.horasFaturaveisMes) || base.horasFaturaveisMes <= 0) return null
  return Math.round(base.custosFixosMensaisCentavos / base.horasFaturaveisMes)
}

// ---------------------------------------------------------------------------
// Composição pela equipe (P9 e P10, aprovadas em 11/11/2026)
// ---------------------------------------------------------------------------

/** Limites da composição pela equipe, conferidos também no banco. */
export const MAXIMO_LINHAS_DA_EQUIPE = 100
export const HORAS_DISPONIVEIS_MAXIMAS_MES = 744

/**
 * Uma pessoa da equipe (decisão do Eduardo, 12/11/2026): custo do mês (salário, piso ou pró-labore,
 * com encargos) e horas de trabalho no mês (a jornada). Quanto dessas horas vira serviço, e se é
 * técnico ou administrativo, é decidido em cada orçamento, no responsável de cada serviço.
 */
export interface LinhaDaEquipe {
  /** Remuneração (salário, piso ou pró-labore) + encargos + benefícios do mês. */
  custoMensalCentavos: number
  /** Horas de trabalho no mês (ex.: 173 h para 40 h por semana). Inteiras. */
  horasDisponiveisMes: number
  /** Sócio com pró-labore: só para identificar a remuneração dos sócios. */
  socio: boolean
}

export interface ComposicaoDaEquipe {
  /** Soma do custo do mês de todos: numerador da hora técnica média. */
  custoTecnicoCentavos: number
  /** Soma dos custos das linhas marcadas como sócio. */
  remuneracaoDosSociosCentavos: number
  /** Σ horas no mês: as horas que a equipe tem para vender. */
  horasFaturaveisMes: number
  /** Custo ÷ horas: hora técnica média, usada quando o serviço não tem responsável. */
  horaTecnicaCentavos: number | null
}

function exigirLinhaDaEquipe(linha: LinhaDaEquipe): void {
  exigirCentavos(linha.custoMensalCentavos)
  if (
    !Number.isSafeInteger(linha.horasDisponiveisMes) ||
    linha.horasDisponiveisMes < 0 ||
    linha.horasDisponiveisMes > HORAS_DISPONIVEIS_MAXIMAS_MES
  ) {
    throw new ErroDeOrcamento('valor_invalido')
  }
}

/** Hora de custo de uma pessoa: custo do mês ÷ horas no mês. `null` sem horas. */
export function horaDeCustoDaPessoa(linha: LinhaDaEquipe): number | null {
  exigirLinhaDaEquipe(linha)
  if (linha.horasDisponiveisMes === 0) return null
  return dividirArredondando(BigInt(linha.custoMensalCentavos), BigInt(linha.horasDisponiveisMes))
}

/**
 * Hora técnica média e horas da equipe. O banco faz a mesma conta (salvar_base_de_custos). As contas
 * do mês são rateadas por essas mesmas horas.
 */
export function composicaoDaEquipe(linhas: readonly LinhaDaEquipe[]): ComposicaoDaEquipe {
  if (linhas.length > MAXIMO_LINHAS_DA_EQUIPE) throw new ErroDeOrcamento('valor_invalido')
  let custoTecnicoCentavos = 0
  let remuneracaoDosSociosCentavos = 0
  let horas = 0
  for (const linha of linhas) {
    exigirLinhaDaEquipe(linha)
    custoTecnicoCentavos += linha.custoMensalCentavos
    if (linha.socio) remuneracaoDosSociosCentavos += linha.custoMensalCentavos
    horas += linha.horasDisponiveisMes
  }
  return {
    custoTecnicoCentavos,
    remuneracaoDosSociosCentavos,
    horasFaturaveisMes: horas,
    horaTecnicaCentavos:
      horas === 0 ? null : dividirArredondando(BigInt(custoTecnicoCentavos), BigInt(horas)),
  }
}

export interface CustoDoItem {
  /** Horas × hora técnica + custos diretos do item (deslocamento, ART…). */
  diretoCentavos: number
  /** Horas × custo fixo por hora. `null` se o rateio está pendente. */
  rateioCentavos: number | null
  /** Direto + rateio. `null` se o rateio está pendente. */
  totalCentavos: number | null
}

/**
 * Custo interno de um item: cada custo entra uma única vez (direto ou rateado). A conta é por minuto,
 * igual à do banco: round(minutos × valor da hora ÷ 60).
 */
export function custoDoItem(
  item: { minutos: number; custoDiretoExtraCentavos: number },
  base: BaseDeCustos,
): CustoDoItem {
  if (
    !Number.isSafeInteger(item.minutos) ||
    item.minutos < 0 ||
    item.minutos > MINUTOS_MAXIMOS_DO_ITEM
  ) {
    throw new ErroDeOrcamento('valor_invalido')
  }
  exigirCentavos(item.custoDiretoExtraCentavos)
  exigirCentavos(base.horaTecnicaCentavos)
  const minutos = BigInt(item.minutos)
  const diretoCentavos =
    dividirArredondando(minutos * BigInt(base.horaTecnicaCentavos), 60n) +
    item.custoDiretoExtraCentavos
  const porHora = custoFixoPorHora(base)
  const rateioCentavos =
    porHora === null ? null : dividirArredondando(minutos * BigInt(porHora), 60n)
  return {
    diretoCentavos,
    rateioCentavos,
    totalCentavos: rateioCentavos === null ? null : diretoCentavos + rateioCentavos,
  }
}

// ---------------------------------------------------------------------------
// Preço sugerido e resultado
// ---------------------------------------------------------------------------

export interface PercentuaisDoPreco {
  /** Margem desejada sobre o preço de venda (não é acréscimo sobre o custo). */
  margemPontosBase: number
  /** Tributos sobre o faturamento, alíquota efetiva informada pela contabilidade. */
  tributosPontosBase: number
  /** Taxas de cobrança que são percentual do preço (cartão). Pix e boleto são fixas. */
  taxasPontosBase: number
}

/**
 * Preço = (custos + custos fixos por cobrança e assinatura) ÷ (1 − margem − tributos − taxas).
 * Percentuais que somam 100% ou mais não têm preço possível.
 */
export function precoSugerido(
  custoTotalCentavos: number,
  custosFixosPorCobrancaCentavos: number,
  percentuais: PercentuaisDoPreco,
): number {
  exigirCentavos(custoTotalCentavos)
  exigirCentavos(custosFixosPorCobrancaCentavos)
  exigirPontosBase(percentuais.margemPontosBase)
  exigirPontosBase(percentuais.tributosPontosBase)
  exigirPontosBase(percentuais.taxasPontosBase)
  const soma =
    percentuais.margemPontosBase + percentuais.tributosPontosBase + percentuais.taxasPontosBase
  if (soma >= PONTOS_BASE_TOTAL) throw new ErroDeOrcamento('percentuais_invalidos')
  const preco = Math.round(
    ((custoTotalCentavos + custosFixosPorCobrancaCentavos) * PONTOS_BASE_TOTAL) /
      (PONTOS_BASE_TOTAL - soma),
  )
  exigirCentavos(preco)
  return preco
}

/**
 * Preço automático de um item: o custo dele (horas, rateio e outros custos) dividido por
 * (1 − margem desejada − tributos − taxas). As taxas fixas por cobrança e assinatura ficam no total
 * do orçamento, não no item. O banco grava o mesmo valor (private.preco_automatico_do_item).
 */
export function precoAutomaticoDoItem(
  custoCentavos: number,
  percentuais: PercentuaisDoPreco,
): number {
  return precoSugerido(custoCentavos, 0, percentuais)
}

export interface ResultadoDoPreco {
  tributosCentavos: number
  taxasCentavos: number
  /** Preço − custos − fixos por cobrança − tributos − taxas. Pode ser negativo. */
  resultadoCentavos: number
  /** Resultado ÷ preço. `null` com preço zero. */
  margemPontosBase: number | null
}

/** O que sobra com o preço praticado, depois de tributos e taxas. */
export function resultadoDoPreco(
  precoCentavos: number,
  custoTotalCentavos: number,
  custosFixosPorCobrancaCentavos: number,
  percentuais: Pick<PercentuaisDoPreco, 'tributosPontosBase' | 'taxasPontosBase'>,
): ResultadoDoPreco {
  exigirCentavos(custoTotalCentavos)
  exigirCentavos(custosFixosPorCobrancaCentavos)
  const tributosCentavos = aplicarPontosBase(precoCentavos, percentuais.tributosPontosBase)
  const taxasCentavos = aplicarPontosBase(precoCentavos, percentuais.taxasPontosBase)
  const resultadoCentavos =
    precoCentavos -
    custoTotalCentavos -
    custosFixosPorCobrancaCentavos -
    tributosCentavos -
    taxasCentavos
  return {
    tributosCentavos,
    taxasCentavos,
    resultadoCentavos,
    margemPontosBase:
      precoCentavos === 0
        ? null
        : Math.round((resultadoCentavos * PONTOS_BASE_TOTAL) / precoCentavos),
  }
}

/** Acréscimo sobre o custo que equivale a uma margem sobre o preço: m ÷ (1 − m). */
export function acrescimoEquivalente(margemPontosBase: number): number {
  exigirPontosBase(margemPontosBase)
  if (margemPontosBase >= PONTOS_BASE_TOTAL) throw new ErroDeOrcamento('percentuais_invalidos')
  return Math.round((margemPontosBase * PONTOS_BASE_TOTAL) / (PONTOS_BASE_TOTAL - margemPontosBase))
}

export type SituacaoDaMargem = 'pendente' | 'adequada' | 'abaixo_da_minima'

/**
 * A margem mínima trava pelo total do orçamento (decisão de 10/11/2026). Item abaixo dela é só
 * aviso: use esta mesma função por item para decidir o aviso, nunca para bloquear o envio.
 */
export function situacaoDaMargem(
  margemPontosBase: number | null,
  minimaPontosBase: number,
): SituacaoDaMargem {
  exigirPontosBase(minimaPontosBase)
  if (margemPontosBase === null) return 'pendente'
  return margemPontosBase < minimaPontosBase ? 'abaixo_da_minima' : 'adequada'
}

// ---------------------------------------------------------------------------
// Cronograma de pagamento (ORC-03)
// ---------------------------------------------------------------------------

/**
 * Divide o total pelos pesos (percentuais ou qualquer proporção) com centavos por maior resto:
 * a soma é sempre igual ao total, nenhuma parcela é negativa e, no empate, ganha a primeira.
 */
export function distribuirPorMaiorResto(totalCentavos: number, pesos: readonly number[]): number[] {
  exigirCentavos(totalCentavos)
  if (pesos.length === 0) throw new ErroDeOrcamento('sem_parcelas')
  if (pesos.length > MAXIMO_PARCELAS) throw new ErroDeOrcamento('parcelas_demais')
  if (pesos.some((peso) => !Number.isSafeInteger(peso) || peso < 0)) {
    throw new ErroDeOrcamento('pesos_invalidos')
  }
  const somaDosPesos = pesos.reduce((soma, peso) => soma + peso, 0)
  if (somaDosPesos <= 0) throw new ErroDeOrcamento('pesos_invalidos')

  const partes = pesos.map((peso, indice) => {
    const bruto = totalCentavos * peso
    return { indice, valor: Math.floor(bruto / somaDosPesos), resto: bruto % somaDosPesos }
  })
  let faltam = totalCentavos - partes.reduce((soma, parte) => soma + parte.valor, 0)
  const porResto = [...partes].sort((a, b) => b.resto - a.resto || a.indice - b.indice)
  for (const parte of porResto) {
    if (faltam <= 0) break
    parte.valor += 1
    faltam -= 1
  }
  return partes.map((parte) => parte.valor)
}

/** Os percentuais das parcelas fecham 100%? Devolve quanto falta (positivo) ou sobra (negativo). */
export function diferencaDasParcelas(percentuaisPontosBase: readonly number[]): number {
  return PONTOS_BASE_TOTAL - percentuaisPontosBase.reduce((soma, valor) => soma + valor, 0)
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

/** "ORC-2026-041": numeração por consultoria e ano (ORC-04). */
export function numeroDoOrcamento(ano: number, sequencia: number): string {
  return `ORC-${String(ano)}-${String(sequencia).padStart(3, '0')}`
}

/** 890000 → "8.900,00" (sem o símbolo, para colunas alinhadas). */
export function formatarCentavos(centavos: number): string {
  const negativo = centavos < 0
  const absoluto = Math.abs(Math.trunc(centavos))
  const inteiro = String(Math.floor(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fracao = String(absoluto % 100).padStart(2, '0')
  return `${negativo ? '−' : ''}${inteiro},${fracao}`
}

/** 890000 → "R$ 8.900,00". */
export function formatarReais(centavos: number): string {
  return `R$ ${formatarCentavos(centavos)}`
}

/** 2928 → "29,3%" (uma casa). */
export function formatarPontosBase(pontosBase: number): string {
  const decimos = Math.round(pontosBase / 10)
  const negativo = decimos < 0
  const absoluto = Math.abs(decimos)
  return `${negativo ? '−' : ''}${String(Math.floor(absoluto / 10))},${String(absoluto % 10)}%`
}

/**
 * Duração digitada → minutos. Aceita horas decimais ("2", "1,5", "1.5h"), horas e minutos
 * ("1h30", "1h 30", "1h30min", "1:30") e só minutos ("90min"). Vazio é zero. `null` para o que não
 * for duração, minutos acima de 59 ("1h90") ou mais que o limite do item.
 */
export function lerDuracao(texto: string): number | null {
  const limpo = texto.trim().toLowerCase().replace(/\s+/g, '')
  if (limpo === '') return 0
  let minutos: number
  const decimal = /^(\d{1,6})(?:[.,](\d{1,2}))?h?$/.exec(limpo)
  const horaEMinuto = /^(\d{1,6})(?:h(\d{1,2})|:(\d{2}))(?:min|m)?$/.exec(limpo)
  const soMinutos = /^(\d{1,7})(?:min|m)$/.exec(limpo)
  if (decimal) {
    const centesimos = Number((decimal[2] ?? '').padEnd(2, '0'))
    minutos = Number(decimal[1]) * 60 + Math.round((centesimos * 60) / 100)
  } else if (horaEMinuto) {
    const parteMinutos = Number(horaEMinuto[2] ?? horaEMinuto[3])
    if (parteMinutos > 59) return null
    minutos = Number(horaEMinuto[1]) * 60 + parteMinutos
  } else if (soMinutos) {
    minutos = Number(soMinutos[1])
  } else {
    return null
  }
  return minutos <= MINUTOS_MAXIMOS_DO_ITEM ? minutos : null
}

/** 90 → "1h30"; 120 → "2h"; 45 → "45min"; 65 → "1h05"; 0 → "0h". */
export function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0 && resto > 0) return `${String(resto)}min`
  return resto === 0 ? `${String(horas)}h` : `${String(horas)}h${String(resto).padStart(2, '0')}`
}

/** "8.900,00", "8900" ou "R$ 8.900,5" → centavos. `null` se não for um valor em reais. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[R$\s.]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  const [inteiro = '0', fracao = ''] = limpo.split('.')
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'))
  return Number.isSafeInteger(centavos) && centavos <= PRECO_MAXIMO_CENTAVOS ? centavos : null
}
