// Preço dos serviços: acréscimo sobre horas de venda e contas, despesas sem acréscimo e
// cobertura separada de tributos e taxas. Visitas mantêm preço fixo. O banco calcula
// os mesmos valores em private.precificar_orcamento.

import {
  aplicarPontosBase,
  custoDoItem,
  distribuirPorMaiorResto,
  ErroDeOrcamento,
  PONTOS_BASE_TOTAL,
  PRECO_MAXIMO_CENTAVOS,
  composicaoDaEquipe,
  horaDeCustoDaPessoa,
  type CustoDoItem,
  type LinhaDaEquipe,
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
  /** Preço cobrado por visita técnica, cadastrado em Custos e taxas. Não recebe margem. */
  valorVisitaCentavos: number
  /** Valor cobrado por km rodado (ida e volta), quando a visita é longe. Não recebe margem. */
  custoKmCentavos: number
  /** Tabela de hora de venda (profissão e atividade ou nível), para a forma "tabela". */
  horasVenda?: readonly HoraDeVenda[]
  /** Hora técnica (custo) por profissão; sem a profissão, vale `horaTecnicaCentavos`. */
  custoHoraPorProfissao?: readonly CustoDaProfissao[]
  /** Hora de custo de cada membro da equipe: custo do mês ÷ horas no mês. */
  custoHoraPorMembro?: readonly CustoDoMembro[]
}

export interface CustoDoMembro {
  membroId: string
  horaCentavos: number
}

/**
 * Unidade de cobrança de uma linha da tabela de preços (ADR-0018, decisões de 12/11/2026). A hora
 * vende pelas horas do item; m², hectare, diária e campanha vendem pela quantidade; o pacote é um
 * preço fechado digitado no item. Em todas, as horas estimadas do item seguem valendo para o custo
 * e para a carga da equipe.
 */
export type UnidadeDeCobranca = 'hora' | 'm2' | 'ha' | 'diaria' | 'campanha' | 'pacote'

export const UNIDADES_DE_COBRANCA: readonly UnidadeDeCobranca[] = [
  'hora',
  'm2',
  'ha',
  'diaria',
  'campanha',
  'pacote',
]

/** Quantidade com 4 casas, em inteiros: 12,5 ha = 125.000 (igual a numeric(18,4) do banco). */
export const ESCALA_DA_QUANTIDADE = 10_000
export const QUANTIDADE_MAXIMA = 99_999_999 * ESCALA_DA_QUANTIDADE

/**
 * Faixa progressiva (ADR-0018, fatia 4): cada trecho da quantidade paga o valor da sua faixa.
 * `ateDezMilesimos` é o limite superior (× 10.000) e entra na faixa; nulo = última faixa, aberta.
 */
export interface FaixaDePreco {
  ateDezMilesimos: number | null
  valorCentavos: number
}

/** Unidades que aceitam faixas de quantidade (hora e pacote não). */
export const UNIDADES_COM_FAIXAS: readonly UnidadeDeCobranca[] = ['m2', 'ha', 'diaria', 'campanha']
export const MAXIMO_DE_FAIXAS = 10

/** Uma linha da tabela de preços: Eng. ambiental · Júnior (hora); Arquiteta · Projeto (m²)… */
export interface HoraDeVenda {
  id: string
  profissao: string
  atividade: string
  /** Preço de uma unidade (no pacote, o preço sugerido para o item). Com faixas, não é usado. */
  valorCentavos: number
  /** Padrão: hora. */
  unidade?: UnidadeDeCobranca
  /** Faixas progressivas; vazio ou ausente = preço por unidade. */
  faixas?: readonly FaixaDePreco[]
  /** Preço mínimo do serviço, só sobre os honorários (sem despesas e outros custos). Nunca no pacote. */
  minimoCentavos?: number | null
}

/**
 * Faixas válidas: até 10, limites positivos e crescentes, só a última aberta. Começam em zero e
 * não deixam lacuna: quantidade fora delas não existe. Devolve o problema ou `null`.
 */
export function problemaDasFaixas(
  faixas: readonly FaixaDePreco[],
  unidade: UnidadeDeCobranca = 'hora',
):
  | 'unidade_sem_faixas'
  | 'faixas_demais'
  | 'faixas_fora_de_ordem'
  | 'ultima_faixa_fechada'
  | 'valor_invalido'
  | null {
  if (faixas.length === 0) return null
  if (!UNIDADES_COM_FAIXAS.includes(unidade)) return 'unidade_sem_faixas'
  if (faixas.length > MAXIMO_DE_FAIXAS) return 'faixas_demais'
  let anterior = 0
  for (const [indice, faixa] of faixas.entries()) {
    if (
      !Number.isSafeInteger(faixa.valorCentavos) ||
      faixa.valorCentavos < 0 ||
      faixa.valorCentavos > PRECO_MAXIMO_CENTAVOS
    )
      return 'valor_invalido'
    const ultima = indice === faixas.length - 1
    if (faixa.ateDezMilesimos === null) {
      if (!ultima) return 'faixas_fora_de_ordem'
      continue
    }
    if (ultima) return 'ultima_faixa_fechada'
    if (
      !Number.isSafeInteger(faixa.ateDezMilesimos) ||
      faixa.ateDezMilesimos <= anterior ||
      faixa.ateDezMilesimos > QUANTIDADE_MAXIMA
    )
      return 'faixas_fora_de_ordem'
    anterior = faixa.ateDezMilesimos
  }
  return null
}

/**
 * Valor progressivo: soma de cada trecho × valor da faixa, em precisão exata, arredondada uma vez
 * (metade para cima). 500 fica toda na faixa "até 500"; 500,0001 põe 0,0001 na seguinte.
 */
export function valorPorFaixas(
  quantidadeDezMilesimos: number,
  faixas: readonly FaixaDePreco[],
): number {
  exigirInteiro(quantidadeDezMilesimos, QUANTIDADE_MAXIMA)
  if (problemaDasFaixas(faixas, 'm2') !== null) throw new ErroDeOrcamento('valor_invalido')
  let soma = 0n
  let inicio = 0
  for (const faixa of faixas) {
    const fim = faixa.ateDezMilesimos ?? quantidadeDezMilesimos
    const trecho = Math.max(Math.min(quantidadeDezMilesimos, fim) - inicio, 0)
    soma += BigInt(trecho) * BigInt(faixa.valorCentavos)
    if (faixa.ateDezMilesimos === null) break
    inicio = faixa.ateDezMilesimos
  }
  return dividir(soma, BigInt(ESCALA_DA_QUANTIDADE))
}

export interface CustoDaProfissao {
  profissao: string
  horaTecnicaCentavos: number
}

/** Profissões comparadas sem caixa nem espaços nas pontas ("Biólogo" = " biólogo "). */
export function mesmaProfissao(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** "tabela": horas × hora de venda; "margem": acréscimo sobre horas de venda e contas, com tributos e taxas separados. */
export type FormaDePreco = 'margem' | 'tabela'

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

/** Preço fixo das visitas: quantidade × (valor da visita + km × valor do km + outros gastos). */
export function valorDasVisitas(
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
  | 'sem_itens'
  | 'sem_base'
  | 'despesa_a_cotar'
  | 'percentuais_impossiveis'
  | 'valor_invalido'
  | 'hora_sem_valor'
  | 'quantidade_pendente'

export interface DivisaoDoValor {
  /** Custo interno das horas da equipe. */
  trabalhoTecnicoCentavos: number
  /** Venda dos serviços que recebem acréscimo (horas, m², hectare, diária, campanha). */
  horasDeVendaCentavos: number
  /** Pacotes: preço fechado, sem acréscimo. */
  precosFechadosCentavos: number
  /** Sobre o que incide o acréscimo: venda dos serviços sem pacote + contas desses serviços. */
  baseDoAcrescimoCentavos: number
  /** "Outros custos" dos itens (ART, laboratório, materiais). */
  outrosCustosDiretosCentavos: number
  /** Rateio das contas do mês e da parte administrativa da equipe. */
  contasDaConsultoriaCentavos: number
  /** Preço fixo das visitas, sem margem. */
  visitasCentavos: number
  despesasIncluidasCentavos: number
  tributosCentavos: number
  /** Taxas percentuais de cobrança + taxas fixas por cobrança e assinatura. */
  taxasCentavos: number
  /** Lucro estimado após tributos e taxas. */
  lucroCentavos: number
}

export interface PrecoDoOrcamento {
  custosDosItens: CustoDoItem[]
  /** Preço fixo das visitas (sem margem). */
  valorVisitasCentavos: number
  /** Custo dos serviços (itens e despesas incluídas); `null` sem base ou com despesa a cotar. */
  custoTotalCentavos: number | null
  fixosPorCobrancaCentavos: number
  /** `null` enquanto houver pendência. */
  precoTotalCentavos: number | null
  /** Preço de cada item, na ordem; zeros enquanto houver pendência. */
  precosDosItens: number[]
  /** Preço da linha "Visitas técnicas"; zero sem visitas ou com pendência. */
  precoVisitasCentavos: number
  margemPb: number
  formaDePreco: FormaDePreco
  /** Lucro ÷ preço dos serviços: a margem que de fato sobra. `null` com pendência. */
  margemResultantePb: number | null
  pendencia: PendenciaDoPreco | null
  divisao: DivisaoDoValor | null
}

export interface EntradaDoPreco {
  itens: readonly {
    minutos: number
    custoDiretoExtraCentavos: number
    /** Linha da tabela de hora de venda: preço (forma "tabela") e profissão do custo. */
    horaVendaId?: string | null
    /** Membro responsável pelo serviço: o custo usa a hora dele. */
    responsavelId?: string | null
    /** Quantidade na unidade da linha (× 10.000); só fora da hora e do pacote. */
    quantidadeDezMilesimos?: number | null
    /** Preço fechado do pacote. */
    precoFechadoCentavos?: number | null
  }[]
  visitas: VisitasDoOrcamento
  /** Estimativas das despesas incluídas no preço; `null` = a cotar. */
  despesasIncluidasCentavos: readonly (number | null)[]
  quantidadeDeParcelas: number
  /** Acréscimo sobre horas de venda e contas, escolhido no fim (só na forma "margem"). */
  margemPb: number
  /** Padrão: "margem". */
  formaDePreco?: FormaDePreco
  base: BaseDoPreco | null
}

/** round(a ÷ b), metade para cima, em inteiros: igual ao round() em numeric do banco. */
function dividir(numerador: bigint, divisor: bigint): number {
  return Number((numerador * 2n + divisor) / (divisor * 2n))
}

/**
 * Preço do orçamento inteiro = preço dos serviços (com margem) + preço fixo das visitas. A margem
 * vale só para os serviços. Pesos da repartição: o custo de cada item; custos todos zero repartem
 * por igual. Despesas incluídas entram no custo dos serviços e se espalham pelos itens.
 */
export function precificarOrcamento(entrada: EntradaDoPreco): PrecoDoOrcamento {
  const { itens, base, margemPb } = entrada
  const formaDePreco = entrada.formaDePreco ?? 'margem'
  const zeros = itens.map(() => 0)
  const pendente = (
    pendencia: PendenciaDoPreco,
    parcial: Partial<PrecoDoOrcamento> = {},
  ): PrecoDoOrcamento => ({
    custosDosItens: [],
    valorVisitasCentavos: 0,
    custoTotalCentavos: null,
    fixosPorCobrancaCentavos: 0,
    precoTotalCentavos: null,
    precosDosItens: zeros,
    precoVisitasCentavos: 0,
    margemPb,
    formaDePreco,
    margemResultantePb: null,
    pendencia,
    divisao: null,
    ...parcial,
  })

  if (!base) return pendente(itens.length === 0 ? 'sem_itens' : 'sem_base')

  // O custo de cada item usa a hora do responsável; sem responsável (ou fora da equipe), a da
  // profissão da hora escolhida; sem ninguém dessa profissão, a média (igual a private.itens_do_preco).
  const horas = new Map((base.horasVenda ?? []).map((h) => [h.id, h]))
  const membros = new Map((base.custoHoraPorMembro ?? []).map((c) => [c.membroId, c.horaCentavos]))
  const horaTecnicaDoItem = (item: (typeof itens)[number]): number => {
    const doMembro = item.responsavelId ? membros.get(item.responsavelId) : undefined
    if (doMembro !== undefined) return doMembro
    const hora = item.horaVendaId ? horas.get(item.horaVendaId) : undefined
    const custo = hora
      ? base.custoHoraPorProfissao?.find((c) => mesmaProfissao(c.profissao, hora.profissao))
      : undefined
    return custo?.horaTecnicaCentavos ?? base.horaTecnicaCentavos
  }
  // Venda de cada item, sem os outros custos: hora = horas × preço; m², ha, diária e campanha =
  // quantidade × preço; pacote = preço fechado. Pacote não recebe acréscimo (P1, ADR-0018).
  const vendaDoItem = (
    item: (typeof itens)[number],
  ): { venda: number; fixo: boolean } | PendenciaDoPreco => {
    const linha = item.horaVendaId ? horas.get(item.horaVendaId) : undefined
    if (!linha) return 'hora_sem_valor'
    const unidade = linha.unidade ?? 'hora'
    // Preço mínimo (P12): só sobre os honorários, antes dos outros custos e das despesas.
    const comMinimo = (venda: number) => Math.max(venda, linha.minimoCentavos ?? 0)
    if (unidade === 'hora') {
      return {
        venda: comMinimo(dividir(BigInt(item.minutos) * BigInt(linha.valorCentavos), 60n)),
        fixo: false,
      }
    }
    if (unidade === 'pacote') {
      const preco = item.precoFechadoCentavos
      if (preco === null || preco === undefined) return 'quantidade_pendente'
      exigirInteiro(preco, PRECO_MAXIMO_CENTAVOS)
      return { venda: preco, fixo: true }
    }
    const quantidade = item.quantidadeDezMilesimos
    if (quantidade === null || quantidade === undefined) return 'quantidade_pendente'
    exigirInteiro(quantidade, QUANTIDADE_MAXIMA)
    const faixas = linha.faixas ?? []
    return {
      venda: comMinimo(
        faixas.length > 0
          ? valorPorFaixas(quantidade, faixas)
          : dividir(BigInt(quantidade) * BigInt(linha.valorCentavos), BigInt(ESCALA_DA_QUANTIDADE)),
      ),
      fixo: false,
    }
  }
  const custosDosItens = itens.map((item) =>
    custoDoItem(item, {
      horaTecnicaCentavos: horaTecnicaDoItem(item),
      custosFixosMensaisCentavos: base.custoFixoHoraCentavos,
      horasFaturaveisMes: 1,
    }),
  )
  const valorVisitasCentavos = valorDasVisitas(entrada.visitas, base)
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
    valorVisitasCentavos,
    fixosPorCobrancaCentavos,
    custoTotalCentavos: aCotar ? null : custoItens + despesasIncluidasCentavos,
  }

  if (itens.length === 0) return pendente('sem_itens', parcial)
  if (aCotar) return pendente('despesa_a_cotar', parcial)

  const custoTotalCentavos = custoItens + despesasIncluidasCentavos
  const precoVisitasCentavos = valorVisitasCentavos
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
  const fechar = (
    precosDosItens: number[],
    precoServicosCentavos: number,
    vendas: { venda: number; fixo: boolean }[],
  ): PrecoDoOrcamento => {
    const precoTotalCentavos = precoServicosCentavos + precoVisitasCentavos
    const tributosCentavos = aplicarPontosBase(precoTotalCentavos, base.tributosPb)
    const taxasCentavos =
      aplicarPontosBase(precoTotalCentavos, base.taxasPb) + fixosPorCobrancaCentavos
    const lucroCentavos =
      precoTotalCentavos -
      custoTotalCentavos -
      valorVisitasCentavos -
      tributosCentavos -
      taxasCentavos
    return {
      ...parcial,
      custoTotalCentavos,
      precoTotalCentavos,
      precosDosItens,
      precoVisitasCentavos,
      margemPb,
      formaDePreco,
      margemResultantePb:
        precoServicosCentavos > 0
          ? dividir(
              BigInt(lucroCentavos) * BigInt(PONTOS_BASE_TOTAL),
              BigInt(precoServicosCentavos),
            )
          : null,
      pendencia: null,
      divisao: {
        trabalhoTecnicoCentavos,
        horasDeVendaCentavos: vendas.reduce((soma, v) => soma + (v.fixo ? 0 : v.venda), 0),
        precosFechadosCentavos: vendas.reduce((soma, v) => soma + (v.fixo ? v.venda : 0), 0),
        baseDoAcrescimoCentavos: vendas.reduce(
          (soma, v, i) => soma + (v.fixo ? 0 : v.venda + (custosDosItens[i]?.rateioCentavos ?? 0)),
          0,
        ),
        outrosCustosDiretosCentavos,
        contasDaConsultoriaCentavos,
        visitasCentavos: valorVisitasCentavos,
        despesasIncluidasCentavos,
        tributosCentavos,
        taxasCentavos,
        lucroCentavos,
      },
    }
  }

  if (formaDePreco === 'tabela') {
    // Pela tabela: horas × hora de venda + outros custos; despesas incluídas se repartem pelos
    // itens na proporção desse preço; a margem é o que sobra.
    const vendas: { venda: number; fixo: boolean }[] = []
    for (const item of itens) {
      const v = vendaDoItem(item)
      if (typeof v === 'string') return pendente(v, parcial)
      vendas.push(v)
    }
    // Os outros custos passam para o preço, menos no pacote (o preço fechado já é o preço).
    const pelaHora = vendas.map((v, i) =>
      v.fixo ? v.venda : v.venda + (itens[i]?.custoDiretoExtraCentavos ?? 0),
    )
    const somaPelaHora = pelaHora.reduce((soma, v) => soma + v, 0)
    const repartidas = distribuirPorMaiorResto(
      despesasIncluidasCentavos,
      somaPelaHora > 0 ? pelaHora : pelaHora.map(() => 1),
    )
    const precos = pelaHora.map((v, indice) => v + (repartidas[indice] ?? 0))
    const precoServicos = precos.reduce((soma, v) => soma + v, 0)
    if (precoServicos + precoVisitasCentavos > PRECO_MAXIMO_CENTAVOS) {
      return pendente('valor_invalido', parcial)
    }
    return fechar(precos, precoServicos, vendas)
  }

  if (margemPb + base.tributosPb + base.taxasPb >= PONTOS_BASE_TOTAL) {
    return pendente('percentuais_impossiveis', parcial)
  }

  // Conta em inteiros, arredondando a metade para cima: o banco faz round() em numeric e chega
  // ao mesmo centavo (ponto flutuante poderia errar um centavo no caso ",5").
  const vendas: { venda: number; fixo: boolean }[] = []
  for (const item of itens) {
    const v = vendaDoItem(item)
    if (typeof v === 'string') return pendente(v, parcial)
    vendas.push(v)
  }
  const livres = vendas.flatMap((v, i) => (v.fixo ? [] : [i]))
  const fechados = vendas.reduce((soma, v) => soma + (v.fixo ? v.venda : 0), 0)

  // Só pacotes: o preço é o fechado, com as despesas incluídas repartidas por ele (sem acréscimo).
  if (livres.length === 0) {
    const pesos = vendas.map((v) => v.venda)
    const somaDosPesos = pesos.reduce((soma, peso) => soma + peso, 0)
    const repartidas = distribuirPorMaiorResto(
      despesasIncluidasCentavos,
      somaDosPesos > 0 ? pesos : pesos.map(() => 1),
    )
    const precos = vendas.map((v, i) => v.venda + (repartidas[i] ?? 0))
    const precoServicos = precos.reduce((soma, v) => soma + v, 0)
    if (precoServicos + precoVisitasCentavos > PRECO_MAXIMO_CENTAVOS) {
      return pendente('valor_invalido', parcial)
    }
    return fechar(precos, precoServicos, vendas)
  }

  // Acréscimo sobre a venda e as contas dos serviços que não são pacote; tributos e taxas
  // percentuais cobrem também pacotes e visitas, que têm valor fixo.
  const baseDoAcrescimo = livres.reduce(
    (soma, i) => soma + (vendas[i]?.venda ?? 0) + (custosDosItens[i]?.rateioCentavos ?? 0),
    0,
  )
  const extrasLivres = livres.reduce(
    (soma, i) => soma + (itens[i]?.custoDiretoExtraCentavos ?? 0),
    0,
  )
  const acrescimo = aplicarPontosBase(baseDoAcrescimo, margemPb)
  const percentuais = base.tributosPb + base.taxasPb
  const divisor = BigInt(PONTOS_BASE_TOTAL - percentuais)
  const numerador =
    BigInt(
      baseDoAcrescimo +
        extrasLivres +
        despesasIncluidasCentavos +
        acrescimo +
        fixosPorCobrancaCentavos,
    ) *
      BigInt(PONTOS_BASE_TOTAL) +
    BigInt(fechados + valorVisitasCentavos) * BigInt(percentuais)
  const precoLivres = dividir(numerador, divisor)
  const precoServicosCentavos = precoLivres + fechados
  if (
    !Number.isSafeInteger(precoServicosCentavos) ||
    precoServicosCentavos + valorVisitasCentavos > PRECO_MAXIMO_CENTAVOS
  ) {
    return pendente('valor_invalido', parcial)
  }

  const pesos = livres.map(
    (i) =>
      (vendas[i]?.venda ?? 0) +
      (custosDosItens[i]?.rateioCentavos ?? 0) +
      (itens[i]?.custoDiretoExtraCentavos ?? 0),
  )
  const somaDosPesos = pesos.reduce((soma, peso) => soma + peso, 0)
  const partes = distribuirPorMaiorResto(precoLivres, somaDosPesos > 0 ? pesos : pesos.map(() => 1))
  const precos = vendas.map((v) => (v.fixo ? v.venda : 0))
  livres.forEach((i, k) => {
    precos[i] = partes[k] ?? 0
  })
  return fechar(precos, precoServicosCentavos, vendas)
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

/**
 * Hora de custo de cada membro: custo do mês ÷ horas no mês. Quem não tem horas fica de fora. O banco
 * grava o mesmo resultado (salvar_base_de_custos → custo_hora_membro).
 */
export function custoHoraPorMembro(
  linhas: readonly (LinhaDaEquipe & { membroId: string })[],
): CustoDoMembro[] {
  return linhas.flatMap((linha) => {
    const hora = horaDeCustoDaPessoa(linha)
    return hora === null ? [] : [{ membroId: linha.membroId, horaCentavos: hora }]
  })
}

/**
 * Hora técnica (custo) por profissão: custo de quem é da profissão ÷ horas no mês dessas pessoas.
 * Quem não tem profissão fica de fora (entra só na média da equipe). O banco grava o mesmo
 * resultado (salvar_base_de_custos → custo_hora_profissao).
 */
export function custoHoraPorProfissao(
  linhas: readonly (LinhaDaEquipe & { profissao?: string | null })[],
): CustoDaProfissao[] {
  const grupos = new Map<string, { profissao: string; linhas: LinhaDaEquipe[] }>()
  for (const linha of linhas) {
    const profissao = linha.profissao?.trim()
    if (!profissao) continue
    const chave = profissao.toLowerCase()
    const grupo = grupos.get(chave) ?? { profissao, linhas: [] }
    grupo.linhas.push(linha)
    grupos.set(chave, grupo)
  }
  return [...grupos.values()]
    .flatMap((g) => {
      const hora = composicaoDaEquipe(g.linhas).horaTecnicaCentavos
      return hora === null ? [] : [{ profissao: g.profissao, horaTecnicaCentavos: hora }]
    })
    .sort((a, b) => (a.profissao < b.profissao ? -1 : a.profissao > b.profissao ? 1 : 0))
}
