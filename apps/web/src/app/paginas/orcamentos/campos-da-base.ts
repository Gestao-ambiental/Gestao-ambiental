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
  MAXIMO_DE_FAIXAS,
  mesmaProfissao,
  problemaDasFaixas,
  resumoDaPessoa,
  UNIDADES_COM_FAIXAS,
  type ComposicaoDaEquipe,
  type FaixaDePreco,
  type FormaDeRecebimento,
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

/** Linha da tabela de preços, com os números como texto enquanto a pessoa digita. */
export interface LinhaHora {
  id: string
  profissao: string
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

/**
 * Tabela ACEAMB (2015) corrigida pelo IPCA até ago/2026 (fator 1,784883), itens 1.16 (hora técnica)
 * e 1.11 (avaliação e perícia ambiental), enviada pelo Eduardo em 12/11/2026. Só preenche quando a
 * pessoa pede; dá para editar depois. Outras profissões (biólogo, eng. civil, arquiteto) entram com
 * os valores das tabelas que a consultoria informar: nada é inventado aqui.
 */
export const FONTE_ACEAMB = 'ACEAMB 2015 corrigida pelo IPCA (ago/2026)'
export const HORAS_ACEAMB_2026 = [
  { profissao: 'Eng. ambiental e sanitarista', atividade: 'Júnior', valor: '214,19' },
  { profissao: 'Eng. ambiental e sanitarista', atividade: 'Sênior', valor: '356,98' },
  { profissao: 'Eng. ambiental e sanitarista', atividade: 'Máster', valor: '446,22' },
  {
    profissao: 'Eng. ambiental e sanitarista',
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

/** Lê as faixas da linha; devolve o problema em texto, se houver. */
export function lerFaixas(l: LinhaHora, n: string): FaixaDePreco[] | string {
  if (!usaFaixas(l)) return []
  const faixas: FaixaDePreco[] = []
  for (const [i, f] of l.faixas.entries()) {
    const k = String(i + 1)
    const ultima = i === l.faixas.length - 1
    const ate = ultima ? null : lerQuantidade(f.ate)
    const valor = lerEstimativa(f.valor)
    if (!ultima && (ate === null || ate === undefined || ate === 0))
      return `Tabela de preços, linha ${n}: informe até quanto vale a faixa ${k}.`
    if (valor === null || valor === undefined)
      return `Tabela de preços, linha ${n}: informe o valor por unidade da faixa ${k}.`
    faixas.push({ ateDezMilesimos: ate ?? null, valorCentavos: valor })
  }
  const problema = problemaDasFaixas(faixas, l.unidade)
  if (problema === 'faixas_demais')
    return `Tabela de preços, linha ${n}: use até ${String(MAXIMO_DE_FAIXAS)} faixas.`
  if (problema !== null)
    return `Tabela de preços, linha ${n}: os limites das faixas precisam crescer (ex.: até 500, até 1.000, acima).`
  return faixas
}

/** Lê a tabela de hora de venda: profissão e atividade obrigatórias, sem repetir a dupla. */
export function lerHorasDeVenda(linhas: readonly LinhaHora[]): HoraDeVenda[] | string {
  const horas: HoraDeVenda[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const faixas = lerFaixas(l, n)
    if (typeof faixas === 'string') return faixas
    // Com faixas, o preço da linha é o da primeira faixa (só para mostrar; o cálculo usa as faixas).
    const valor = faixas[0]?.valorCentavos ?? lerReaisOuZero(l.valor)
    const minimo = l.unidade === 'pacote' ? null : lerEstimativa(l.minimo)
    const minutos = l.tempo.trim() === '' ? null : lerDuracao(l.tempo)
    if (minimo === undefined) return `Tabela de preços, linha ${n}: preço mínimo inválido.`
    if (!l.profissao.trim()) return `Tabela de preços, linha ${n}: informe a profissão.`
    if (!l.atividade.trim())
      return `Tabela de preços, linha ${n}: informe o serviço, a atividade ou o nível.`
    if (valor === null) return `Tabela de preços, linha ${n}: valor inválido.`
    if (minutos === null && l.tempo.trim() !== '')
      return `Tabela de preços, linha ${n}: tempo por unidade inválido. Use 1h30, 1:30 ou 1,5.`
    const repetida = horas.some(
      (h) =>
        mesmaProfissao(h.profissao, l.profissao) &&
        h.atividade.toLowerCase() === l.atividade.trim().toLowerCase(),
    )
    if (repetida)
      return `Tabela de preços: "${l.profissao.trim()} · ${l.atividade.trim()}" aparece duas vezes.`
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

/** Lê a equipe digitada. Devolve a primeira mensagem de erro, se houver. */
export function lerEquipe(linhas: readonly LinhaPessoa[]): PessoaDaBase[] | string {
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
      profissao: l.profissao.trim() || null,
    })
  }
  return equipe
}

/** Média e horas da equipe: só quem tem custo e horas do mês conhecidos. */
export function composicaoDe(equipe: readonly PessoaDaBase[]): ComposicaoDaEquipe {
  return composicaoDaEquipe(linhasMensaisDaEquipe(equipe))
}
