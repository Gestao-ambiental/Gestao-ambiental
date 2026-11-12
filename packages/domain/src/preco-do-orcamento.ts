// Preço do orçamento com margem única, escolhida no fim (decisão do Eduardo, 11/11/2026).
// Os itens mostram horas e custo; o preço dos serviços sai de custo ÷ (1 − margem − tributos −
// taxas) e é repartido entre os itens pelo custo de cada um, com centavos por maior resto. As
// visitas técnicas têm preço fixo, sem margem (decisão de 12/11/2026), e viram uma linha própria.
// Forma "tabela" (12/11/2026): preço do item = horas × hora de venda do nível + outros custos, e a
// margem vira resultado. O custo de cada item usa a hora de custo do responsável do serviço; sem
// responsável, a da profissão da hora de venda; sem ninguém dessa profissão, a média da equipe. O
// banco grava os mesmos valores (private.precificar_orcamento).

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

/** Uma linha da tabela de hora de venda: Eng. ambiental · Júnior; Biólogo · Sênior… */
export interface HoraDeVenda {
  id: string
  profissao: string
  atividade: string
  valorCentavos: number
}

export interface CustoDaProfissao {
  profissao: string
  horaTecnicaCentavos: number
}

/** Profissões comparadas sem caixa nem espaços nas pontas ("Biólogo" = " biólogo "). */
export function mesmaProfissao(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** "tabela": horas × hora de venda; "margem": custo ÷ (1 − margem − tributos − taxas). */
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

export interface DivisaoDoValor {
  /** Horas × hora técnica. */
  trabalhoTecnicoCentavos: number
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
  /** O que sobra: a margem dos serviços, menos tributos e taxas sobre as visitas. */
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
  }[]
  visitas: VisitasDoOrcamento
  /** Estimativas das despesas incluídas no preço; `null` = a cotar. */
  despesasIncluidasCentavos: readonly (number | null)[]
  quantidadeDeParcelas: number
  /** Margem sobre o preço de venda, escolhida no fim do orçamento (só na forma "margem"). */
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
  const fechar = (precosDosItens: number[], precoServicosCentavos: number): PrecoDoOrcamento => {
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
    const pelaHora: number[] = []
    for (const item of itens) {
      const valor = item.horaVendaId ? horas.get(item.horaVendaId)?.valorCentavos : undefined
      if (valor === undefined) return pendente('hora_sem_valor', parcial)
      pelaHora.push(
        dividir(BigInt(item.minutos) * BigInt(valor), 60n) + item.custoDiretoExtraCentavos,
      )
    }
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
    return fechar(precos, precoServicos)
  }

  if (margemPb + base.tributosPb + base.taxasPb >= PONTOS_BASE_TOTAL) {
    return pendente('percentuais_impossiveis', parcial)
  }

  // Conta em inteiros, arredondando a metade para cima: o banco faz round() em numeric e chega
  // ao mesmo centavo (ponto flutuante poderia errar um centavo no caso ",5").
  const divisor = BigInt(PONTOS_BASE_TOTAL - margemPb - base.tributosPb - base.taxasPb)
  const numerador =
    BigInt(custoTotalCentavos + fixosPorCobrancaCentavos) * BigInt(PONTOS_BASE_TOTAL)
  const precoServicosCentavos = dividir(numerador, divisor)
  if (
    !Number.isSafeInteger(precoServicosCentavos) ||
    precoServicosCentavos + valorVisitasCentavos > PRECO_MAXIMO_CENTAVOS
  ) {
    return pendente('valor_invalido', parcial)
  }

  const pesos = custosDosItens.map((c) => c.totalCentavos ?? 0)
  const somaDosPesos = pesos.reduce((soma, peso) => soma + peso, 0)
  const partes = distribuirPorMaiorResto(
    precoServicosCentavos,
    somaDosPesos > 0 ? pesos : pesos.map(() => 1),
  )
  return fechar(partes, precoServicosCentavos)
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
