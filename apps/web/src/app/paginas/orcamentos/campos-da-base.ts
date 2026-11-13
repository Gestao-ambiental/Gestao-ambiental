// Campos da base de custos enquanto a pessoa digita (texto) e a leitura deles para os números
// que o banco espera. Usados em Custos e taxas e nos primeiros passos (ADR-0020): mesmas regras.

import {
  composicaoDaEquipe,
  DIAS_MAXIMOS_NO_MES,
  formatarCentavos,
  formatarDuracao,
  HORAS_MAXIMAS_DO_PROJETO,
  HORAS_MAXIMAS_POR_DIARIA,
  lerDuracao,
  linhasMensaisDaEquipe,
  CONSUMO_MAXIMO_KM_POR_LITRO,
  MAXIMO_DE_FAIXAS,
  mesmaProfissao,
  modoDeDeslocamento,
  problemaDasFaixas,
  profissaoObrigatoria,
  resumoDaPessoa,
  UNIDADES_COM_FAIXAS,
  rotuloDaProfissaoNoCusto,
  valorDoKm,
  type CodigoProfissao,
  type ComposicaoDaEquipe,
  type FaixaDePreco,
  type FormaDeRecebimento,
  type ModoDeDeslocamento,
  type PassoPrecos,
  type PessoaDoRascunho,
  type RemuneracaoDaPessoa,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'

import type {
  BaseDeCustosDaConsultoria,
  ContaDoMes,
  HoraDeVenda,
  PessoaDaBase,
} from '@/lib/api/orcamentos'

import { lerEstimativa, lerReaisOuZero } from './calculo'
import { campoDaQuantidade, lerQuantidade } from './comum'

/**
 * Linha da tabela de preços, com os números como texto enquanto a pessoa digita. A unidade decide o
 * bloco: hora = "Hora de profissional" (profissão e nível); as demais = "Serviços" (serviço e "Quem
 * faz", opcional).
 */
export interface LinhaHora {
  id: string
  /** Na hora, a profissão; no serviço, o "Quem faz" ('' = ninguém específico). */
  profissao: string
  /** Na hora, o nível (Júnior, Sênior…); no serviço, o nome do serviço. */
  atividade: string
  /** Unidade de cobrança (ADR-0018): hora, m², hectare, diária, campanha ou pacote. */
  unidade: UnidadeDeCobranca
  valor: string
  /** Tempo sugerido por unidade (1h30, 1,5…), opcional: sugere as horas do serviço. */
  tempo: string
  fonte: string
  /** Preço mínimo (opcional), só sobre os honorários; nunca no pacote. */
  minimo: string
  /** Faixas progressivas; a última fica aberta ("acima de"). Vazio = preço único. */
  faixas: LinhaFaixa[]
}

export interface LinhaFaixa {
  id: string
  /** Até quanto (na unidade da linha); vazio na última. */
  ate: string
  valor: string
}

/** Duas faixas para começar: a primeira com o preço da linha e a última aberta. */
export function faixasIniciais(valor: string): LinhaFaixa[] {
  return [
    { id: crypto.randomUUID(), ate: '', valor },
    { id: crypto.randomUUID(), ate: '', valor: '' },
  ]
}

export function usaFaixas(l: LinhaHora): boolean {
  return UNIDADES_COM_FAIXAS.includes(l.unidade) && l.faixas.length > 0
}

/** Bloco da linha na tabela: hora de profissional ou serviço. */
export function ehHoraDeProfissional(l: { unidade: UnidadeDeCobranca }): boolean {
  return l.unidade === 'hora'
}

/** Nome da linha nas mensagens: "Hora de profissional, linha 1", "Serviços, linha 2". */
export function rotuloDaLinhaDePreco(linhas: readonly LinhaHora[], indice: number): string {
  const linha = linhas[indice]
  const hora = linha ? ehHoraDeProfissional(linha) : true
  const posicao = linhas.slice(0, indice + 1).filter((l) => ehHoraDeProfissional(l) === hora).length
  return `${hora ? 'Hora de profissional' : 'Serviços'}, linha ${String(posicao)}`
}

/** Linha nova de cada bloco. O serviço começa em m², a primeira unidade da lista depois da hora. */
export function novaLinhaDePreco(bloco: 'hora' | 'servico'): LinhaHora {
  return {
    id: crypto.randomUUID(),
    profissao: '',
    atividade: '',
    unidade: bloco === 'hora' ? 'hora' : 'm2',
    valor: '',
    tempo: '',
    fonte: '',
    minimo: '',
    faixas: [],
  }
}

/**
 * Tabela ACEAMB (2015) corrigida pelo IPCA até ago/2026 (fator 1,784883), itens 1.16 (hora técnica)
 * e 1.11 (avaliação e perícia ambiental), enviada pelo Eduardo em 12/11/2026. Só preenche quando a
 * pessoa pede; dá para editar depois. Outras profissões (biólogo, eng. civil, arquiteto) entram com
 * os valores das tabelas que a consultoria informar: nada é inventado aqui.
 */
export const FONTE_ACEAMB = 'ACEAMB 2015 corrigida pelo IPCA (ago/2026)'
export const HORAS_ACEAMB_2026 = [
  { profissao: 'Engenheiro ambiental e sanitarista', atividade: 'Júnior', valor: '214,19' },
  { profissao: 'Engenheiro ambiental e sanitarista', atividade: 'Sênior', valor: '356,98' },
  { profissao: 'Engenheiro ambiental e sanitarista', atividade: 'Máster', valor: '446,22' },
  {
    profissao: 'Engenheiro ambiental e sanitarista',
    atividade: 'Avaliação e perícia ambiental',
    valor: '356,98',
  },
].map((h) => ({ ...h, unidade: 'hora' as const, tempo: '', minimo: '', faixas: [] }))

/** Conta do mês (energia, água, internet…), com o valor como texto enquanto a pessoa digita. */
export interface LinhaConta {
  id: string
  descricao: string
  valor: string
}

/** Nomes sugeridos para começar a lista. Os valores ficam em branco: nunca inventamos valor. */
export const CONTAS_SUGERIDAS = [
  'Aluguel e condomínio',
  'Energia elétrica',
  'Água e esgoto',
  'Internet e telefone',
  'Contabilidade',
  'Sistemas e softwares',
  'Seguros',
  'Material de escritório',
]

/** Pessoa da equipe (um membro com login), com os números como texto enquanto a pessoa digita. */
export interface LinhaPessoa {
  id: string
  /** Membro da consultoria: recebe os serviços dos orçamentos. */
  membroId: string
  socio: boolean
  profissao: string
  /** Como recebe; '' = ainda não informado (linhas antigas). */
  forma: FormaDeRecebimento | ''
  /** CLT, pró-labore, estágio: custo do mês. */
  custo: string
  /** Horas no mês (jornada); no projeto, opcional. */
  horas: string
  diaria: string
  horasDiaria: string
  /** Dias no mês, opcional. */
  dias: string
  projeto: string
  horasProjeto: string
}

/** Nome de cada forma de recebimento na tela. */
export const ROTULO_DA_FORMA: Record<FormaDeRecebimento, string> = {
  clt: 'Salário (CLT)',
  pro_labore: 'Pró-labore',
  estagio: 'Bolsa de estágio',
  diaria: 'Por diária',
  projeto: 'Por projeto',
}

export function horasDe(base: BaseDeCustosDaConsultoria | null): LinhaHora[] {
  return linhasDePrecoDe(base?.horasVenda ?? [])
}

/** Linhas da tabela de preços a partir da lista (da base ou do rascunho). */
export function linhasDePrecoDe(horasVenda: readonly HoraDeVenda[]): LinhaHora[] {
  return horasVenda.map((h) => ({
    id: h.id,
    profissao: h.profissao,
    atividade: h.atividade,
    unidade: h.unidade,
    valor: formatarCentavos(h.valorCentavos),
    tempo: h.minutosPorUnidade === null ? '' : formatarDuracao(h.minutosPorUnidade),
    fonte: h.fonte ?? '',
    minimo: h.minimoCentavos === null ? '' : formatarCentavos(h.minimoCentavos),
    faixas: h.faixas.map((f) => ({
      id: crypto.randomUUID(),
      ate: f.ateDezMilesimos === null ? '' : campoDaQuantidade(f.ateDezMilesimos),
      valor: formatarCentavos(f.valorCentavos),
    })),
  }))
}

/** Lê as faixas da linha; devolve o problema em texto, se houver. `rotulo`: "Serviços, linha 2". */
export function lerFaixas(l: LinhaHora, rotulo: string): FaixaDePreco[] | string {
  if (!usaFaixas(l)) return []
  const faixas: FaixaDePreco[] = []
  for (const [i, f] of l.faixas.entries()) {
    const k = String(i + 1)
    const ultima = i === l.faixas.length - 1
    const ate = ultima ? null : lerQuantidade(f.ate)
    const valor = lerEstimativa(f.valor)
    if (!ultima && (ate === null || ate === undefined || ate === 0))
      return `${rotulo}: informe até quanto vale a faixa ${k}.`
    if (valor === null || valor === undefined)
      return `${rotulo}: informe o valor por unidade da faixa ${k}.`
    faixas.push({ ateDezMilesimos: ate ?? null, valorCentavos: valor })
  }
  const problema = problemaDasFaixas(faixas, l.unidade)
  if (problema === 'faixas_demais') return `${rotulo}: use até ${String(MAXIMO_DE_FAIXAS)} faixas.`
  if (problema !== null)
    return `${rotulo}: os limites das faixas precisam crescer (ex.: até 500, até 1.000, acima).`
  return faixas
}

/**
 * Lê a tabela de preços. Hora de profissional: profissão e nível obrigatórios. Serviço: nome
 * obrigatório, "Quem faz" opcional. A dupla profissão e nível/serviço não se repete.
 */
export function lerHorasDeVenda(linhas: readonly LinhaHora[]): HoraDeVenda[] | string {
  const horas: HoraDeVenda[] = []
  for (const [indice, l] of linhas.entries()) {
    const rotulo = rotuloDaLinhaDePreco(linhas, indice)
    const hora = ehHoraDeProfissional(l)
    const faixas = lerFaixas(l, rotulo)
    if (typeof faixas === 'string') return faixas
    // Com faixas, o preço da linha é o da primeira faixa (só para mostrar; o cálculo usa as faixas).
    const valor = faixas[0]?.valorCentavos ?? lerReaisOuZero(l.valor)
    const minimo = l.unidade === 'pacote' ? null : lerEstimativa(l.minimo)
    const minutos = l.tempo.trim() === '' ? null : lerDuracao(l.tempo)
    if (minimo === undefined) return `${rotulo}: preço mínimo inválido.`
    if (profissaoObrigatoria(l.unidade) && !l.profissao.trim())
      return `${rotulo}: informe a profissão.`
    if (!l.atividade.trim())
      return hora ? `${rotulo}: informe o nível (ex.: Júnior).` : `${rotulo}: informe o serviço.`
    if (valor === null) return `${rotulo}: valor inválido.`
    if (minutos === null && l.tempo.trim() !== '')
      return `${rotulo}: tempo por unidade inválido. Use 1h30, 1:30 ou 1,5.`
    const repetida = horas.some(
      (h) =>
        mesmaProfissao(h.profissao, l.profissao) &&
        h.atividade.toLowerCase() === l.atividade.trim().toLowerCase(),
    )
    if (repetida) {
      const nome = l.profissao.trim()
        ? `${l.profissao.trim()} · ${l.atividade.trim()}`
        : l.atividade.trim()
      return `Tabela de preços: "${nome}" aparece duas vezes.`
    }
    horas.push({
      id: l.id,
      profissao: l.profissao.trim(),
      atividade: l.atividade.trim(),
      valorCentavos: valor,
      fonte: l.fonte.trim() || null,
      unidade: l.unidade,
      minutosPorUnidade: minutos,
      faixas,
      minimoCentavos: minimo,
    })
  }
  return horas
}

export function contasDe(base: BaseDeCustosDaConsultoria | null): LinhaConta[] {
  return linhasDeContaDe(base?.contas ?? [])
}

/** Linhas das contas do mês a partir da lista; conta sem valor (rascunho) fica em branco. */
export function linhasDeContaDe(
  contas: readonly { descricao: string; valorCentavos: number | null }[],
): LinhaConta[] {
  return contas.map((c) => ({
    id: crypto.randomUUID(),
    descricao: c.descricao,
    valor: c.valorCentavos === null ? '' : formatarCentavos(c.valorCentavos),
  }))
}

/** Lê as contas do mês. Valor em branco conta como zero. Devolve a primeira mensagem de erro. */
export function lerContas(linhas: readonly LinhaConta[]): ContaDoMes[] | string {
  const contas: ContaDoMes[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const valor = lerReaisOuZero(l.valor)
    if (!l.descricao.trim()) return `Contas do mês, linha ${n}: informe a conta.`
    if (valor === null) return `Contas do mês, linha ${n}: valor inválido.`
    contas.push({ descricao: l.descricao.trim(), valorCentavos: valor })
  }
  return contas
}

export function linhasDe(base: BaseDeCustosDaConsultoria | null): LinhaPessoa[] {
  return linhasDePessoaDe(base?.equipe ?? [])
}

/** Linhas da equipe a partir da lista (da base ou do rascunho); ausente fica em branco. */
export function linhasDePessoaDe(equipe: readonly PessoaDoRascunho[]): LinhaPessoa[] {
  const reais = (v: number | null) => (v === null ? '' : formatarCentavos(v))
  const inteiro = (v: number | null) => (v === null ? '' : String(v))
  return equipe.map((p) => ({
    id: p.id,
    membroId: p.membroId,
    socio: p.socio,
    profissao: p.profissao ?? '',
    forma: p.forma ?? '',
    custo: reais(p.custoMensalCentavos),
    horas: inteiro(p.horasNoMes),
    diaria: reais(p.custoDiariaCentavos),
    horasDiaria: inteiro(p.horasPorDiaria),
    dias: inteiro(p.diasNoMes),
    projeto: reais(p.custoProjetoCentavos),
    horasProjeto: inteiro(p.horasDoProjeto),
  }))
}

export function novaPessoa(): LinhaPessoa {
  return {
    id: crypto.randomUUID(),
    membroId: '',
    socio: false,
    profissao: '',
    forma: 'clt',
    custo: '',
    horas: '',
    diaria: '',
    horasDiaria: '',
    dias: '',
    projeto: '',
    horasProjeto: '',
  }
}

/** Reais digitados; vazio é nulo (desconhecido); inválido é undefined. */
export const lerReaisOuNulo = lerEstimativa

/** Inteiro digitado; vazio é nulo (desconhecido); inválido é undefined. */
export function lerInteiroOuNulo(texto: string): number | null | undefined {
  const limpo = texto.trim()
  if (limpo === '') return null
  return /^\d{1,6}$/.test(limpo) ? Number(limpo) : undefined
}

/** Os números da linha conforme a forma; só os campos da forma escolhida contam. */
export function remuneracaoDaLinha(l: LinhaPessoa): RemuneracaoDaPessoa | string {
  const forma = l.forma === '' ? null : l.forma
  const custo = lerReaisOuNulo(l.custo)
  const horas = lerInteiroOuNulo(l.horas)
  const diaria = lerReaisOuNulo(l.diaria)
  const horasDiaria = lerInteiroOuNulo(l.horasDiaria)
  const dias = lerInteiroOuNulo(l.dias)
  const projeto = lerReaisOuNulo(l.projeto)
  const horasProjeto = lerInteiroOuNulo(l.horasProjeto)
  const r: RemuneracaoDaPessoa = {
    forma,
    custoMensalCentavos: null,
    horasNoMes: null,
    custoDiariaCentavos: null,
    horasPorDiaria: null,
    diasNoMes: null,
    custoProjetoCentavos: null,
    horasDoProjeto: null,
  }
  if (forma === 'diaria') {
    if (diaria === undefined) return 'custo da diária inválido'
    if (horasDiaria === undefined || (horasDiaria ?? 0) > HORAS_MAXIMAS_POR_DIARIA)
      return `horas por diária de 0 a ${String(HORAS_MAXIMAS_POR_DIARIA)}`
    if (dias === undefined || (dias ?? 0) > DIAS_MAXIMOS_NO_MES)
      return `dias no mês de 0 a ${String(DIAS_MAXIMOS_NO_MES)}`
    return { ...r, custoDiariaCentavos: diaria, horasPorDiaria: horasDiaria, diasNoMes: dias }
  }
  if (forma === 'projeto') {
    if (projeto === undefined) return 'custo do projeto inválido'
    if (horasProjeto === undefined || (horasProjeto ?? 0) > HORAS_MAXIMAS_DO_PROJETO)
      return 'horas do projeto inválidas'
    if (horas === undefined || (horas ?? 0) > 744) return 'horas no mês de 0 a 744'
    return { ...r, custoProjetoCentavos: projeto, horasDoProjeto: horasProjeto, horasNoMes: horas }
  }
  if (custo === undefined) return 'custo mensal inválido'
  if (horas === undefined || (horas ?? 0) > 744) return 'horas no mês de 0 a 744'
  return { ...r, custoMensalCentavos: custo, horasNoMes: horas }
}

/** A conta da hora de custo, para conferir: custo ÷ horas = hora (o domínio arredonda igual). */
export function contaDaHoraDeCusto(r: RemuneracaoDaPessoa, horaCentavos: number): string {
  const hora = formatarCentavos(horaCentavos)
  if (r.forma === 'diaria' && r.custoDiariaCentavos !== null && r.horasPorDiaria !== null)
    return `${formatarCentavos(r.custoDiariaCentavos)} ÷ ${String(r.horasPorDiaria)} h por diária = ${hora}`
  if (r.forma === 'projeto' && r.custoProjetoCentavos !== null && r.horasDoProjeto !== null)
    return `${formatarCentavos(r.custoProjetoCentavos)} ÷ ${String(r.horasDoProjeto)} h do projeto = ${hora}`
  if (r.custoMensalCentavos !== null && r.horasNoMes !== null)
    return `${formatarCentavos(r.custoMensalCentavos)} ÷ ${String(r.horasNoMes)} h no mês = ${hora}`
  return hora
}

/**
 * Profissão de cada membro que tem uma definida (ADR-0021): o rótulo da lista ou, se a pessoa
 * ainda está cursando, "Estudante de …", que fica num grupo à parte no custo por profissão.
 */
export function profissoesDosMembros(
  membros: readonly { id: string; profissao: CodigoProfissao | null; profissaoEmCurso: boolean }[],
): ReadonlyMap<string, string> {
  return new Map(
    membros.flatMap((m) =>
      m.profissao
        ? [[m.id, rotuloDaProfissaoNoCusto(m.profissao, m.profissaoEmCurso)] as const]
        : [],
    ),
  )
}

/**
 * Lê a equipe digitada. Devolve a primeira mensagem de erro, se houver. A profissão vem do membro
 * quando ele tem uma (o banco faz o mesmo); sem ela, fica o texto antigo da linha.
 */
export function lerEquipe(
  linhas: readonly LinhaPessoa[],
  profissaoDoMembro: ReadonlyMap<string, string> = new Map(),
): PessoaDaBase[] | string {
  const equipe: PessoaDaBase[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const r = remuneracaoDaLinha(l)
    if (!l.membroId) return `Equipe, linha ${n}: escolha a pessoa.`
    if (equipe.some((p) => p.membroId === l.membroId))
      return `Equipe, linha ${n}: a pessoa já está em outra linha.`
    if (typeof r === 'string') return `Equipe, linha ${n}: ${r}.`
    try {
      resumoDaPessoa(r)
    } catch {
      return `Equipe, linha ${n}: confira os números (o mês tem até 744 horas).`
    }
    equipe.push({
      ...r,
      id: l.id,
      membroId: l.membroId,
      descricao: '',
      socio: l.socio,
      profissao: profissaoDoMembro.get(l.membroId) ?? (l.profissao.trim() || null),
    })
  }
  return equipe
}

/** Média e horas da equipe: só quem tem custo e horas do mês conhecidos. */
export function composicaoDe(equipe: readonly PessoaDaBase[]): ComposicaoDaEquipe {
  return composicaoDaEquipe(linhasMensaisDaEquipe(equipe))
}

// ---------------------------------------------------------------------------
// Visita técnica e deslocamento (decisão do Eduardo, 13/11/2026)
// ---------------------------------------------------------------------------

/** Campos do deslocamento, como texto enquanto a pessoa digita. Só os do modo escolhido contam. */
export interface CamposDeDeslocamento {
  modo: ModoDeDeslocamento
  /** Valor de uma visita (modo "visita"). */
  visita: string
  /** Consumo do carro em km por litro (modo "km"). */
  consumo: string
  /** Preço do litro do combustível (modo "km"). */
  combustivel: string
  /** Acréscimo por km, opcional (modo "km"). */
  acrescimo: string
}

/** O deslocamento lido: o que vai para a base ou para o rascunho. Ausente fica nulo. */
export interface DeslocamentoLido {
  deslocamentoModo: ModoDeDeslocamento
  valorVisitaCentavos: number | null
  /** Derivado (o banco recalcula). */
  custoKmCentavos: number
  consumoKmPorLitro: number | null
  precoCombustivelCentavos: number | null
  acrescimoKmCentavos: number | null
}

/** "12", "12,5" ou "12.5" km/l. Vazio é nulo; inválido (zero, negativo, 3 casas…) é undefined. */
export function lerConsumo(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpo)) return undefined
  const valor = Number(limpo)
  return valor > 0 && valor <= CONSUMO_MAXIMO_KM_POR_LITRO ? valor : undefined
}

function textoDoConsumo(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',')
}

/**
 * Campos a partir dos números salvos (base ou rascunho). Base antiga sem modo: deduz pelos valores.
 * Km antigo sem combustível: o valor do km aparece como acréscimo, para não se perder ao salvar.
 * `zeroEmBranco`: na base, 0 quer dizer "não cadastrado" e fica em branco.
 */
export function camposDeDeslocamentoDe(
  d: {
    deslocamentoModo?: ModoDeDeslocamento | null
    valorVisitaCentavos: number | null
    custoKmCentavos: number | null
    consumoKmPorLitro?: number | null
    precoCombustivelCentavos?: number | null
    acrescimoKmCentavos?: number | null
  } | null,
  { zeroEmBranco }: { zeroEmBranco: boolean },
): CamposDeDeslocamento {
  if (!d) return { modo: 'visita', visita: '', consumo: '', combustivel: '', acrescimo: '' }
  const reais = (v: number | null | undefined) =>
    v === null || v === undefined || (zeroEmBranco && v === 0) ? '' : formatarCentavos(v)
  const consumo = d.consumoKmPorLitro ?? null
  const combustivel = d.precoCombustivelCentavos ?? null
  const kmAntigo =
    consumo === null && combustivel === null && (d.acrescimoKmCentavos ?? null) === null
      ? (d.custoKmCentavos ?? 0)
      : 0
  return {
    modo: modoDeDeslocamento({
      deslocamentoModo: d.deslocamentoModo ?? null,
      valorVisitaCentavos: d.valorVisitaCentavos ?? 0,
      custoKmCentavos: d.custoKmCentavos ?? 0,
    }),
    visita: reais(d.valorVisitaCentavos),
    consumo: textoDoConsumo(consumo),
    combustivel: reais(combustivel),
    acrescimo: kmAntigo > 0 ? formatarCentavos(kmAntigo) : reais(d.acrescimoKmCentavos),
  }
}

/** Campos do passo 3 dos primeiros passos a partir do rascunho (nulo continua em branco). */
export function camposDeDeslocamentoDoRascunho(p: PassoPrecos): CamposDeDeslocamento {
  return camposDeDeslocamentoDe(p, { zeroEmBranco: false })
}

/**
 * Lê o deslocamento. Só os campos do modo escolhido valem; os do outro vão nulos. O consumo e o
 * preço do litro andam juntos (os dois ou nenhum). Devolve a mensagem de erro, se houver.
 */
export function lerDeslocamento(c: CamposDeDeslocamento): DeslocamentoLido | string {
  if (c.modo === 'visita') {
    const visita = lerEstimativa(c.visita)
    if (visita === undefined) return 'Valor de uma visita técnica: valor inválido.'
    return {
      deslocamentoModo: 'visita',
      valorVisitaCentavos: visita,
      custoKmCentavos: 0,
      consumoKmPorLitro: null,
      precoCombustivelCentavos: null,
      acrescimoKmCentavos: null,
    }
  }
  const consumo = lerConsumo(c.consumo)
  if (consumo === undefined) return 'Consumo do carro: use km por litro, de 0,01 a 999,99.'
  const combustivel = lerEstimativa(c.combustivel)
  if (combustivel === undefined) return 'Preço do combustível: valor inválido.'
  const acrescimo = lerEstimativa(c.acrescimo)
  if (acrescimo === undefined) return 'Acréscimo por km: valor inválido.'
  if ((consumo === null) !== (combustivel === null))
    return 'Informe o consumo do carro e o preço do combustível, ou deixe os dois em branco.'
  const custoKm = valorDoKm({
    consumoKmPorLitro: consumo,
    precoCombustivelCentavos: combustivel,
    acrescimoKmCentavos: acrescimo,
  })
  if (custoKm === null) return 'Confira o consumo do carro e o preço do combustível.'
  return {
    deslocamentoModo: 'km',
    valorVisitaCentavos: null,
    custoKmCentavos: custoKm,
    consumoKmPorLitro: consumo,
    precoCombustivelCentavos: combustivel,
    acrescimoKmCentavos: acrescimo,
  }
}

/** Valor do km a mostrar enquanto a pessoa digita; nulo se ainda não dá para calcular. */
export function valorDoKmDigitado(c: CamposDeDeslocamento): number | null {
  if (c.consumo.trim() === '' && c.combustivel.trim() === '' && c.acrescimo.trim() === '')
    return null
  const lido = lerDeslocamento({ ...c, modo: 'km' })
  return typeof lido === 'string' ? null : lido.custoKmCentavos
}
