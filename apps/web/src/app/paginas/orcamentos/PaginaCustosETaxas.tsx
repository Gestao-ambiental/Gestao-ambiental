import {
  acrescimoEquivalente,
  composicaoDaEquipe,
  custoFixoPorHora,
  custoHoraPorProfissao,
  DIAS_MAXIMOS_NO_MES,
  FORMAS_DE_RECEBIMENTO,
  HORAS_MAXIMAS_DO_PROJETO,
  HORAS_MAXIMAS_POR_DIARIA,
  linhasMensaisDaEquipe,
  MAXIMO_DE_FAIXAS,
  mesmaProfissao,
  problemaDasFaixas,
  UNIDADES_COM_FAIXAS,
  formatarCentavos,
  formatarPontosBase,
  formatarDuracao,
  formatarReais,
  lerDuracao,
  resumoDaPessoa,
  UNIDADES_DE_COBRANCA,
  type ComposicaoDaEquipe,
  type FaixaDePreco,
  type FormaDeRecebimento,
  type RemuneracaoDaPessoa,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  obterBaseDeCustos,
  salvarBaseDeCustos,
  type BaseDeCustosDaConsultoria,
  type ContaDoMes,
  type CustoDaProfissao,
  type HoraDeVenda,
  type PessoaDaBase,
} from '@/lib/api/orcamentos'
import { listarMembrosAtivos, type MembroAtivo } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import {
  lerEstimativa,
  lerHoras,
  lerPercentual,
  lerReaisOuZero,
  textoDasHoras,
  textoDoPercentual,
} from './calculo'
import {
  ROTULO_DA_UNIDADE,
  SUFIXO_DA_UNIDADE,
  campoDaQuantidade,
  classeCabecalho,
  classeCampo,
  classeCelula,
  lerQuantidade,
} from './comum'

interface Campos {
  horaTecnica: string
  custosFixos: string
  horas: string
  margemDesejada: string
  margemMinima: string
  tributos: string
  taxas: string
  taxaPorCobranca: string
  taxaPorAssinatura: string
  valorVisita: string
  custoKm: string
}

/** Linha da tabela de preços, com os números como texto enquanto a pessoa digita. */
interface LinhaHora {
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

interface LinhaFaixa {
  id: string
  /** Até quanto (na unidade da linha); vazio na última. */
  ate: string
  valor: string
}

/** Duas faixas para começar: a primeira com o preço da linha e a última aberta. */
function faixasIniciais(valor: string): LinhaFaixa[] {
  return [
    { id: crypto.randomUUID(), ate: '', valor },
    { id: crypto.randomUUID(), ate: '', valor: '' },
  ]
}

function usaFaixas(l: LinhaHora): boolean {
  return UNIDADES_COM_FAIXAS.includes(l.unidade) && l.faixas.length > 0
}

/**
 * Tabela ACEAMB (2015) corrigida pelo IPCA até ago/2026 (fator 1,784883), itens 1.16 (hora técnica)
 * e 1.11 (avaliação e perícia ambiental), enviada pelo Eduardo em 12/11/2026. Só preenche quando a
 * pessoa pede; dá para editar depois. Outras profissões (biólogo, eng. civil, arquiteto) entram com
 * os valores das tabelas que a consultoria informar: nada é inventado aqui.
 */
const FONTE_ACEAMB = 'ACEAMB 2015 corrigida pelo IPCA (ago/2026)'
const HORAS_ACEAMB_2026 = [
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
interface LinhaConta {
  id: string
  descricao: string
  valor: string
}

/** Nomes sugeridos para começar a lista. Os valores ficam em branco: nunca inventamos valor. */
const CONTAS_SUGERIDAS = [
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
interface LinhaPessoa {
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
const ROTULO_DA_FORMA: Record<FormaDeRecebimento, string> = {
  clt: 'Salário (CLT)',
  pro_labore: 'Pró-labore',
  estagio: 'Bolsa de estágio',
  diaria: 'Por diária',
  projeto: 'Por projeto',
}

function camposDe(base: BaseDeCustosDaConsultoria | null): Campos {
  if (!base) {
    return {
      horaTecnica: '',
      custosFixos: '',
      horas: '',
      margemDesejada: '30',
      margemMinima: '25',
      tributos: '',
      taxas: '0',
      taxaPorCobranca: '',
      taxaPorAssinatura: '',
      valorVisita: '',
      custoKm: '',
    }
  }
  return {
    horaTecnica: formatarCentavos(base.horaTecnicaCentavos),
    custosFixos: formatarCentavos(base.custosFixosMensaisCentavos),
    horas: textoDasHoras(base.horasFaturaveisMes),
    margemDesejada: textoDoPercentual(base.margemDesejadaPb),
    margemMinima: textoDoPercentual(base.margemMinimaPb),
    tributos: textoDoPercentual(base.tributosPb),
    taxas: textoDoPercentual(base.taxasPb),
    taxaPorCobranca: formatarCentavos(base.taxaPorCobrancaCentavos),
    taxaPorAssinatura: formatarCentavos(base.taxaPorAssinaturaCentavos),
    valorVisita: base.valorVisitaCentavos ? formatarCentavos(base.valorVisitaCentavos) : '',
    custoKm: base.custoKmCentavos ? formatarCentavos(base.custoKmCentavos) : '',
  }
}

function horasDe(base: BaseDeCustosDaConsultoria | null): LinhaHora[] {
  return (base?.horasVenda ?? []).map((h) => ({
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
function lerFaixas(l: LinhaHora, n: string): FaixaDePreco[] | string {
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
function lerHorasDeVenda(linhas: readonly LinhaHora[]): HoraDeVenda[] | string {
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

function contasDe(base: BaseDeCustosDaConsultoria | null): LinhaConta[] {
  return (base?.contas ?? []).map((c) => ({
    id: crypto.randomUUID(),
    descricao: c.descricao,
    valor: formatarCentavos(c.valorCentavos),
  }))
}

/** Lê as contas do mês. Valor em branco conta como zero. Devolve a primeira mensagem de erro. */
function lerContas(linhas: readonly LinhaConta[]): ContaDoMes[] | string {
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

function linhasDe(base: BaseDeCustosDaConsultoria | null): LinhaPessoa[] {
  const reais = (v: number | null) => (v === null ? '' : formatarCentavos(v))
  const inteiro = (v: number | null) => (v === null ? '' : String(v))
  return (base?.equipe ?? []).map((p) => ({
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

function novaPessoa(): LinhaPessoa {
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
const lerReaisOuNulo = lerEstimativa

/** Inteiro digitado; vazio é nulo (desconhecido); inválido é undefined. */
function lerInteiroOuNulo(texto: string): number | null | undefined {
  const limpo = texto.trim()
  if (limpo === '') return null
  return /^\d{1,6}$/.test(limpo) ? Number(limpo) : undefined
}

/** Os números da linha conforme a forma; só os campos da forma escolhida contam. */
function remuneracaoDaLinha(l: LinhaPessoa): RemuneracaoDaPessoa | string {
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

/** Lê a equipe digitada. Devolve a primeira mensagem de erro, se houver. */
function lerEquipe(linhas: readonly LinhaPessoa[]): PessoaDaBase[] | string {
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
function composicaoDe(equipe: readonly PessoaDaBase[]): ComposicaoDaEquipe {
  return composicaoDaEquipe(linhasMensaisDaEquipe(equipe))
}

function lerCampos(
  c: Campos,
  linhas: readonly LinhaPessoa[],
  linhasDeContas: readonly LinhaConta[],
  linhasDeHoras: readonly LinhaHora[],
): { base: BaseDeCustosDaConsultoria; composicao: ComposicaoDaEquipe | null } | string {
  const contas = lerContas(linhasDeContas)
  if (typeof contas === 'string') return contas
  const horasVenda = lerHorasDeVenda(linhasDeHoras)
  if (typeof horasVenda === 'string') return horasVenda
  // Com contas, o custo fixo do mês é a soma delas; sem contas, vale o total digitado.
  const custosFixos =
    contas.length > 0
      ? contas.reduce((soma, conta) => soma + conta.valorCentavos, 0)
      : lerReaisOuZero(c.custosFixos)
  const taxaPorCobranca = lerReaisOuZero(c.taxaPorCobranca)
  const taxaPorAssinatura = lerReaisOuZero(c.taxaPorAssinatura)
  const valorVisita = lerReaisOuZero(c.valorVisita)
  const custoKm = lerReaisOuZero(c.custoKm)
  if (valorVisita === null || custoKm === null) return 'Confira o valor da visita e o custo por km.'
  const margemDesejada = lerPercentual(c.margemDesejada)
  const margemMinima = lerPercentual(c.margemMinima)
  const tributos = lerPercentual(c.tributos || '0')
  const taxas = lerPercentual(c.taxas || '0')
  if (custosFixos === null || taxaPorCobranca === null || taxaPorAssinatura === null)
    return 'Confira os valores em reais.'

  let horaTecnica: number | null
  let horas: number | null
  let equipe: PessoaDaBase[] = []
  let composicao: ComposicaoDaEquipe | null = null
  if (linhas.length > 0) {
    const lida = lerEquipe(linhas)
    if (typeof lida === 'string') return lida
    equipe = lida
    composicao = composicaoDe(equipe)
    if (composicao.horaTecnicaCentavos === null)
      return 'A média da equipe precisa de alguém com custo e horas do mês (CLT, pró-labore, estágio ou diária com os dias no mês).'
    horaTecnica = composicao.horaTecnicaCentavos
    horas = composicao.horasFaturaveisMes
  } else {
    horaTecnica = lerReaisOuZero(c.horaTecnica)
    horas = lerHoras(c.horas)
    if (horaTecnica === null) return 'Confira os valores em reais.'
  }
  if (horas === null || horas <= 0) return 'Informe as horas faturáveis por mês (maior que zero).'
  if (margemDesejada === null || margemMinima === null || tributos === null || taxas === null)
    return 'Percentuais vão de 0 a 100.'
  if (margemDesejada + tributos + taxas >= 10_000)
    return 'Margem, tributos e taxas somados precisam ficar abaixo de 100%.'
  return {
    composicao,
    base: {
      horaTecnicaCentavos: horaTecnica,
      custosFixosMensaisCentavos: custosFixos,
      custosFixosEquipeCentavos: 0,
      horasFaturaveisMes: horas,
      margemDesejadaPb: margemDesejada,
      margemMinimaPb: margemMinima,
      tributosPb: tributos,
      taxasPb: taxas,
      taxaPorCobrancaCentavos: taxaPorCobranca,
      taxaPorAssinaturaCentavos: taxaPorAssinatura,
      equipe,
      contas,
      valorVisitaCentavos: valorVisita,
      custoKmCentavos: custoKm,
      horasVenda,
      custoHoraPorProfissao: custoHoraPorProfissao(linhasMensaisDaEquipe(equipe)),
    },
  }
}

/**
 * /configuracoes/custos (onda 5). Base do preço sugerido: hora técnica, custos fixos e
 * capacidade (rateio por hora), margens, tributos e taxas. Só a Gestão. Rascunhos passam a usar
 * a base nova ao serem salvos; propostas enviadas guardam a que usaram.
 *
 * A hora técnica e as horas faturáveis podem ser digitadas ou calculadas pela equipe: cada linha é
 * um membro com login, com custo do mês e horas no mês (12/11/2026). A hora de custo de cada um é
 * custo ÷ horas; quanto vira serviço é decidido no orçamento, no responsável de cada serviço.
 */
export function PaginaCustosETaxas() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const consulta = useQuery({
    queryKey: ['base-de-custos', cid],
    queryFn: () => obterBaseDeCustos(cid),
    enabled: atual.papel === 'gestao',
  })

  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Custos e taxas">
        <SemPermissao descricao="Custos e margens são dados restritos: só a gestão acessa." />
      </Pagina>
    )
  }
  if (consulta.isPending) return <Carregando rotulo="Carregando custos e taxas" linhas={6} />
  if (consulta.isError) {
    return (
      <Pagina titulo="Custos e taxas">
        <EstadoErro
          titulo="Não foi possível carregar custos e taxas."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      </Pagina>
    )
  }
  return <Formulario consultoriaId={cid} base={consulta.data} />
}

function Formulario({
  consultoriaId,
  base,
}: {
  consultoriaId: string
  base: BaseDeCustosDaConsultoria | null
}) {
  const queryClient = useQueryClient()
  const membros = useQuery({
    queryKey: ['membros-ativos', consultoriaId],
    queryFn: () => listarMembrosAtivos(consultoriaId),
  })
  const [c, setC] = useState<Campos>(() => camposDe(base))
  const [equipe, setEquipe] = useState<LinhaPessoa[]>(() => linhasDe(base))
  const [contas, setContas] = useState<LinhaConta[]>(() => contasDe(base))
  const [horas, setHoras] = useState<LinhaHora[]>(() => horasDe(base))
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const pelaEquipe = equipe.length > 0
  const lido = lerCampos(c, equipe, contas, horas)
  // Profissões já usadas, para sugerir o mesmo nome na tabela e na equipe.
  const profissoes = [
    ...new Set(
      [...horas.map((h) => h.profissao.trim()), ...equipe.map((p) => p.profissao.trim())].filter(
        Boolean,
      ),
    ),
  ]
  const custoPorProfissao = typeof lido === 'string' ? [] : lido.base.custoHoraPorProfissao
  const totalDasContas = contas.reduce((soma, l) => soma + (lerReaisOuZero(l.valor) ?? 0), 0)
  // Prévia da composição mesmo com algum campo ainda incompleto (linhas inválidas ficam de fora).
  const previa = pelaEquipe
    ? (() => {
        const lida = lerEquipe(equipe)
        return typeof lida === 'string' ? null : composicaoDe(lida)
      })()
    : null
  const porHora =
    typeof lido === 'string'
      ? null
      : custoFixoPorHora({
          horaTecnicaCentavos: lido.base.horaTecnicaCentavos,
          custosFixosMensaisCentavos:
            lido.base.custosFixosMensaisCentavos + lido.base.custosFixosEquipeCentavos,
          horasFaturaveisMes: lido.base.horasFaturaveisMes,
        })
  const margem = lerPercentual(c.margemDesejada)
  const minima = lerPercentual(c.margemMinima)

  function campo(nome: keyof Campos) {
    return {
      value: c[nome],
      onChange: (e: { target: { value: string } }) => {
        const valor = e.target.value
        setC((a) => ({ ...a, [nome]: valor }))
        setAviso(null)
      },
    }
  }

  function mudarPessoa(id: string, alterar: (p: LinhaPessoa) => LinhaPessoa) {
    setEquipe((a) => a.map((p) => (p.id === id ? alterar(p) : p)))
    setAviso(null)
  }

  function voltarADigitar() {
    // Leva os valores calculados para os campos, para a troca não perder o que já se via.
    if (previa?.horaTecnicaCentavos != null) {
      const hora = previa.horaTecnicaCentavos
      const horas = previa.horasFaturaveisMes
      const fixos = contas.length > 0 ? totalDasContas : (lerReaisOuZero(c.custosFixos) ?? 0)
      setC((a) => ({
        ...a,
        horaTecnica: formatarCentavos(hora),
        horas: textoDasHoras(horas),
        custosFixos: formatarCentavos(fixos),
      }))
      // O total passa a ser digitado.
      setContas([])
    }
    setEquipe([])
    setAviso(null)
  }

  async function salvar() {
    if (typeof lido === 'string') {
      setFalha(lido)
      return
    }
    setFalha(null)
    setSalvando(true)
    try {
      await salvarBaseDeCustos(consultoriaId, lido.base)
      await queryClient.invalidateQueries({ queryKey: ['base-de-custos', consultoriaId] })
      setAviso('Custos e taxas salvos. Rascunhos usam os valores novos ao serem salvos.')
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-(--space-200)">
      <div className="flex flex-wrap items-end justify-between gap-(--space-150)">
        <Pagina titulo="Custos e taxas">{null}</Pagina>
        <Botao
          aparencia="primario"
          disabled={salvando}
          aria-busy={salvando || undefined}
          onClick={() => void salvar()}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}
      {!base ? (
        <MensagemSecao tom="atencao">
          Ainda não configurado: enquanto isso, os orçamentos ficam sem preço sugerido.
        </MensagemSecao>
      ) : null}

      <div className="overflow-hidden rounded-(--radius-large) border bg-(--surface) shadow-cartao">
        <Grupo titulo="Custos e capacidade">
          {pelaEquipe ? (
            <Equipe
              linhas={equipe}
              membros={membros.data ?? []}
              membrosCarregando={membros.isPending}
              custoPorProfissao={custoPorProfissao}
              previa={previa}
              aoMudar={mudarPessoa}
              aoAdicionar={() => {
                setEquipe((a) => [...a, novaPessoa()])
              }}
              aoRemover={(id) => {
                setEquipe((a) => a.filter((p) => p.id !== id))
              }}
              aoVoltar={voltarADigitar}
            />
          ) : (
            <>
              <Linha
                id="base-hora"
                rotulo="Custo da hora técnica (R$)"
                apoio="Salários, pró-labore técnico e encargos ÷ horas faturáveis, sem custos fixos"
              >
                <input
                  id="base-hora"
                  inputMode="decimal"
                  className={`${classeCampo} text-right tabular-nums`}
                  {...campo('horaTecnica')}
                />
              </Linha>
              <Linha
                id="base-horas"
                rotulo="Horas faturáveis por mês"
                apoio="Só as que viram serviço vendido, não as horas pagas"
              >
                <input
                  id="base-horas"
                  inputMode="decimal"
                  className={`${classeCampo} text-right tabular-nums`}
                  {...campo('horas')}
                />
              </Linha>
              <div>
                <Botao
                  aparencia="link"
                  iconeAntes="plus"
                  onClick={() => {
                    setEquipe([novaPessoa()])
                    setAviso(null)
                  }}
                >
                  Calcular pela equipe
                </Botao>
              </div>
            </>
          )}
          <ContasDoMes
            linhas={contas}
            pelaEquipe={pelaEquipe}
            total={totalDasContas}
            aoMudar={(id, alterar) => {
              setContas((a) => a.map((l) => (l.id === id ? alterar(l) : l)))
              setAviso(null)
            }}
            aoAdicionar={(descricao) => {
              setContas((a) => [...a, { id: crypto.randomUUID(), descricao, valor: '' }])
              setAviso(null)
            }}
            aoSugerir={() => {
              setContas((a) => [
                ...a,
                ...CONTAS_SUGERIDAS.filter((nome) => !a.some((l) => l.descricao === nome)).map(
                  (descricao) => ({ id: crypto.randomUUID(), descricao, valor: '' }),
                ),
              ])
              setAviso(null)
            }}
            aoRemover={(id) => {
              setContas((a) => a.filter((l) => l.id !== id))
              setAviso(null)
            }}
          >
            <Linha
              id="base-fixos"
              rotulo={pelaEquipe ? 'Outros custos fixos por mês (R$)' : 'Custos fixos por mês (R$)'}
              apoio={
                pelaEquipe
                  ? 'Total das contas do mês, sem a remuneração de quem está na equipe. Ou detalhe conta por conta'
                  : 'Total das contas do mês e do pró-labore que não está na hora técnica. Ou detalhe conta por conta'
              }
            >
              <input
                id="base-fixos"
                inputMode="decimal"
                className={`${classeCampo} text-right tabular-nums`}
                {...campo('custosFixos')}
              />
            </Linha>
          </ContasDoMes>
          <p className="corpo text-(--text-subtle)">
            Contas do mês por hora:{' '}
            <span className="corpo-medio text-(--text)">
              {porHora === null ? 'pendente' : `${formatarReais(porHora)} por hora`}
            </span>
            . Já entra no custo de cada serviço do orçamento, pelas horas dele.
          </p>
        </Grupo>

        <Grupo titulo="Visita técnica e deslocamento">
          <Linha
            id="base-visita"
            rotulo="Valor de uma visita técnica (R$)"
            apoio="Quanto vocês cobram por visita. Entra no orçamento por visita, com preço fixo, sem margem"
          >
            <input
              id="base-visita"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('valorVisita')}
            />
          </Linha>
          <Linha
            id="base-km"
            rotulo="Valor por km rodado (R$)"
            apoio="Cobrado quando a visita é longe: km de ida e volta × este valor. Deixe em branco se não cobram"
          >
            <input
              id="base-km"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('custoKm')}
            />
          </Linha>
        </Grupo>

        <Grupo titulo="Tabela de preços">
          <p className="max-w-3xl text-xs text-(--text-subtle)">
            Quanto vocês cobram do cliente, do jeito que cobram: por hora, por m², por hectare, por
            diária ou campanha de campo, ou um pacote com preço fechado (ex.: Eng. ambiental ·
            Júnior por hora; Arquiteta · Projeto por m²; Bióloga · Campo por diária). Cada serviço
            do orçamento escolhe uma linha. O tempo por unidade é opcional: ele sugere as horas do
            serviço, que estimam o custo e a carga da equipe.
          </p>
          <datalist id="profissoes-da-consultoria">
            {profissoes.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
          {horas.length > 0 ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse corpo">
                <thead>
                  <tr>
                    <th scope="col" className={classeCabecalho}>
                      Profissão
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Serviço, atividade ou nível
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-44`}>
                      Unidade
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
                      Preço (R$)
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
                      Preço mínimo (R$)
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                      Tempo por unidade
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Fonte
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-12`}>
                      <span className="sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {horas.map((l, indice) => {
                    const n = String(indice + 1)
                    const mudarHora = (alterar: (x: LinhaHora) => LinhaHora) => {
                      setHoras((a) => a.map((x) => (x.id === l.id ? alterar(x) : x)))
                      setAviso(null)
                    }
                    const comFaixas = usaFaixas(l)
                    const sufixo = SUFIXO_DA_UNIDADE[l.unidade]
                    const mudarFaixas = (alterar: (f: LinhaFaixa[]) => LinhaFaixa[]) => {
                      mudarHora((x) => ({ ...x, faixas: alterar(x.faixas) }))
                    }
                    return (
                      <Fragment key={l.id}>
                        <tr>
                          <td className={classeCelula}>
                            <input
                              aria-label={`Profissão da hora ${n}`}
                              list="profissoes-da-consultoria"
                              className={classeCampo}
                              value={l.profissao}
                              onChange={(e) => {
                                const valor = e.target.value
                                mudarHora((x) => ({ ...x, profissao: valor }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <input
                              aria-label={`Atividade ou nível da hora ${n}`}
                              className={classeCampo}
                              value={l.atividade}
                              onChange={(e) => {
                                const valor = e.target.value
                                mudarHora((x) => ({ ...x, atividade: valor }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <select
                              aria-label={`Unidade da linha ${n}`}
                              className={classeCampo}
                              value={l.unidade}
                              onChange={(e) => {
                                const valor = e.target.value as UnidadeDeCobranca
                                // Faixas só em m², ha, diária e campanha; mínimo nunca no pacote.
                                mudarHora((x) => ({
                                  ...x,
                                  unidade: valor,
                                  faixas: UNIDADES_COM_FAIXAS.includes(valor) ? x.faixas : [],
                                  minimo: valor === 'pacote' ? '' : x.minimo,
                                }))
                              }}
                            >
                              {UNIDADES_DE_COBRANCA.map((u) => (
                                <option key={u} value={u}>
                                  {ROTULO_DA_UNIDADE[u]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={classeCelula}>
                            {comFaixas ? (
                              <span className="block text-right text-(--text-subtle)">
                                Por faixas
                              </span>
                            ) : (
                              <input
                                aria-label={`Preço da linha ${n}`}
                                inputMode="decimal"
                                aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                                className={`${classeCampo} text-right tabular-nums`}
                                value={l.valor}
                                onChange={(e) => {
                                  const valor = e.target.value
                                  mudarHora((x) => ({ ...x, valor }))
                                }}
                              />
                            )}
                            {UNIDADES_COM_FAIXAS.includes(l.unidade) && !comFaixas ? (
                              <Botao
                                aparencia="link"
                                className="mt-(--space-050) text-xs"
                                onClick={() => {
                                  mudarHora((x) => ({ ...x, faixas: faixasIniciais(x.valor) }))
                                }}
                              >
                                Usar faixas{' '}
                                <span className="sr-only">de quantidade na linha {n}</span>
                              </Botao>
                            ) : null}
                          </td>
                          <td className={classeCelula}>
                            {l.unidade === 'pacote' ? (
                              <span className="block text-right text-(--text-subtle)">—</span>
                            ) : (
                              <input
                                aria-label={`Preço mínimo da linha ${n}`}
                                inputMode="decimal"
                                placeholder="Opcional"
                                aria-invalid={lerEstimativa(l.minimo) === undefined || undefined}
                                className={`${classeCampo} text-right tabular-nums`}
                                value={l.minimo}
                                onChange={(e) => {
                                  const valor = e.target.value
                                  mudarHora((x) => ({ ...x, minimo: valor }))
                                }}
                              />
                            )}
                          </td>
                          <td className={classeCelula}>
                            {l.unidade === 'hora' ? (
                              <span className="block text-right text-(--text-subtle)">—</span>
                            ) : (
                              <input
                                aria-label={`Tempo por unidade da linha ${n}`}
                                inputMode="decimal"
                                placeholder="Opcional"
                                aria-invalid={
                                  (l.tempo.trim() !== '' && lerDuracao(l.tempo) === null) ||
                                  undefined
                                }
                                className={`${classeCampo} text-right tabular-nums`}
                                value={l.tempo}
                                onChange={(e) => {
                                  const valor = e.target.value
                                  mudarHora((x) => ({ ...x, tempo: valor }))
                                }}
                              />
                            )}
                          </td>
                          <td className={classeCelula}>
                            <input
                              aria-label={`Fonte da hora ${n}`}
                              placeholder="Opcional"
                              className={classeCampo}
                              value={l.fonte}
                              onChange={(e) => {
                                const valor = e.target.value
                                mudarHora((x) => ({ ...x, fonte: valor }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <BotaoIcone
                              icone="trash-2"
                              rotulo={`Remover preço ${n}`}
                              onClick={() => {
                                setHoras((a) => a.filter((x) => x.id !== l.id))
                                setAviso(null)
                              }}
                            />
                          </td>
                        </tr>
                        {comFaixas ? (
                          <tr>
                            <td colSpan={8} className={classeCelula}>
                              {/* Fica à esquerda, visível, mesmo com a tabela rolada de lado (celular). */}
                              <fieldset className="sticky left-0 flex max-w-[calc(100vw-5rem)] flex-col gap-(--space-075) border-l-2 border-(--border-input) pl-(--space-150) sm:max-w-none">
                                <legend className="mb-(--space-050) text-xs text-(--text-subtle)">
                                  Faixas de quantidade da linha {n}: progressivas, cada trecho paga
                                  o valor da sua faixa.
                                </legend>
                                {l.faixas.map((f, i) => {
                                  const k = String(i + 1)
                                  const ultima = i === l.faixas.length - 1
                                  const ateAnterior = (l.faixas[i - 1]?.ate ?? '').trim()
                                  const anterior =
                                    i === 0 ? '0' : ateAnterior === '' ? '…' : ateAnterior
                                  const ateInvalido =
                                    !ultima && f.ate.trim() !== '' && !lerQuantidade(f.ate)
                                  return (
                                    <div
                                      key={f.id}
                                      className="flex flex-wrap items-center gap-(--space-100) text-xs"
                                    >
                                      {ultima ? (
                                        <span className="w-48">
                                          Acima de {anterior} {sufixo.slice(1)}
                                        </span>
                                      ) : (
                                        <label className="flex w-48 items-center gap-(--space-050)">
                                          Até
                                          <input
                                            aria-label={`Até quanto vale a faixa ${k} da linha ${n}`}
                                            inputMode="decimal"
                                            aria-invalid={ateInvalido || undefined}
                                            className={`${classeCampo} w-24 text-right tabular-nums`}
                                            value={f.ate}
                                            onChange={(e) => {
                                              const valor = e.target.value
                                              mudarFaixas((a) =>
                                                a.map((x) =>
                                                  x.id === f.id ? { ...x, ate: valor } : x,
                                                ),
                                              )
                                            }}
                                          />
                                          {sufixo.slice(1)}
                                        </label>
                                      )}
                                      <label className="flex items-center gap-(--space-050)">
                                        R$
                                        <input
                                          aria-label={`Valor por unidade da faixa ${k} da linha ${n}`}
                                          inputMode="decimal"
                                          aria-invalid={
                                            lerEstimativa(f.valor) === undefined || undefined
                                          }
                                          className={`${classeCampo} w-28 text-right tabular-nums`}
                                          value={f.valor}
                                          onChange={(e) => {
                                            const valor = e.target.value
                                            mudarFaixas((a) =>
                                              a.map((x) => (x.id === f.id ? { ...x, valor } : x)),
                                            )
                                          }}
                                        />
                                        {sufixo}
                                      </label>
                                      {!ultima && l.faixas.length > 2 ? (
                                        <BotaoIcone
                                          icone="trash-2"
                                          rotulo={`Remover faixa ${k} da linha ${n}`}
                                          onClick={() => {
                                            mudarFaixas((a) => a.filter((x) => x.id !== f.id))
                                          }}
                                        />
                                      ) : null}
                                    </div>
                                  )
                                })}
                                <div className="flex flex-wrap gap-(--space-150)">
                                  {l.faixas.length < MAXIMO_DE_FAIXAS ? (
                                    <Botao
                                      aparencia="link"
                                      iconeAntes="plus"
                                      onClick={() => {
                                        // A nova entra antes da última, que continua aberta.
                                        mudarFaixas((a) => [
                                          ...a.slice(0, -1),
                                          { id: crypto.randomUUID(), ate: '', valor: '' },
                                          ...a.slice(-1),
                                        ])
                                      }}
                                    >
                                      Adicionar faixa <span className="sr-only">na linha {n}</span>
                                    </Botao>
                                  ) : null}
                                  <Botao
                                    aparencia="link"
                                    onClick={() => {
                                      mudarHora((x) => ({
                                        ...x,
                                        valor: x.faixas[0]?.valor ?? x.valor,
                                        faixas: [],
                                      }))
                                    }}
                                  >
                                    Usar preço único <span className="sr-only">na linha {n}</span>
                                  </Botao>
                                </div>
                              </fieldset>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-(--space-150)">
            <Botao
              aparencia="link"
              iconeAntes="plus"
              onClick={() => {
                setHoras((a) => [
                  ...a,
                  {
                    id: crypto.randomUUID(),
                    profissao: '',
                    atividade: '',
                    unidade: 'hora',
                    valor: '',
                    tempo: '',
                    fonte: '',
                    minimo: '',
                    faixas: [],
                  },
                ])
                setAviso(null)
              }}
            >
              Adicionar preço
            </Botao>
            {horas.every((h) => h.fonte !== FONTE_ACEAMB) ? (
              <Botao
                aparencia="link"
                iconeAntes="list"
                onClick={() => {
                  setHoras((a) => [
                    ...a,
                    ...HORAS_ACEAMB_2026.map((h) => ({
                      id: crypto.randomUUID(),
                      ...h,
                      fonte: FONTE_ACEAMB,
                    })),
                  ])
                  setAviso(null)
                }}
              >
                Usar tabela ACEAMB corrigida (ago/2026)
              </Botao>
            ) : null}
          </div>
        </Grupo>

        <Grupo titulo="Margens">
          <p className="max-w-3xl text-xs text-(--text-subtle)">
            Desejada: meta usada no cálculo pela margem. Mínima: referência de alerta, não bloqueia.
            Que sobra: resultado estimado de cada orçamento depois de custos, tributos e taxas.
          </p>
          {margem !== null && minima !== null && margem < minima ? (
            <MensagemSecao tom="atencao">
              A margem desejada ({formatarPontosBase(margem)}) está abaixo da mínima (
              {formatarPontosBase(minima)}): os orçamentos calculados pela margem vão nascer com o
              aviso de margem baixa.
            </MensagemSecao>
          ) : null}
          <Linha
            id="base-margem"
            rotulo="Margem desejada (%)"
            apoio={
              margem === null || margem >= 10_000
                ? 'Sobre o preço de venda. Vem preenchida no fim de cada orçamento, que pode mudar'
                : `Sobre o preço de venda · equivale a ${formatarPontosBase(acrescimoEquivalente(margem))} sobre o custo. Cada orçamento pode mudar no fim`
            }
          >
            <input
              id="base-margem"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('margemDesejada')}
            />
          </Linha>
          <Linha
            id="base-minima"
            rotulo="Margem mínima (%)"
            apoio="Vale para o total do orçamento; item abaixo é só aviso"
          >
            <input
              id="base-minima"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('margemMinima')}
            />
          </Linha>
        </Grupo>

        <Grupo titulo="Tributos e taxas">
          <Linha
            id="base-tributos"
            rotulo="Tributos sobre o faturamento (%)"
            apoio="Peça à contabilidade a alíquota efetiva; imposto pago ÷ faturamento é só uma aproximação, e ela varia por período e regime"
          >
            <input
              id="base-tributos"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('tributos')}
            />
          </Linha>
          <Linha
            id="base-taxas"
            rotulo="Taxa percentual de cobrança (%)"
            apoio="Só a que é percentual do preço, como a do cartão"
          >
            <input
              id="base-taxas"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('taxas')}
            />
          </Linha>
          <Linha
            id="base-cobranca"
            rotulo="Taxa fixa por cobrança (R$)"
            apoio="Pix ou boleto, por parcela"
          >
            <input
              id="base-cobranca"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('taxaPorCobranca')}
            />
          </Linha>
          <Linha
            id="base-assinatura"
            rotulo="Taxa por documento assinado (R$)"
            apoio="O que a plataforma de assinatura digital cobra por proposta assinada. Em branco se não usa"
          >
            <input
              id="base-assinatura"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('taxaPorAssinatura')}
            />
          </Linha>
        </Grupo>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composição pela equipe
// ---------------------------------------------------------------------------

function Equipe({
  linhas,
  membros,
  membrosCarregando,
  custoPorProfissao,
  previa,
  aoMudar,
  aoAdicionar,
  aoRemover,
  aoVoltar,
}: {
  linhas: LinhaPessoa[]
  membros: readonly MembroAtivo[]
  membrosCarregando: boolean
  custoPorProfissao: readonly CustoDaProfissao[]
  previa: ComposicaoDaEquipe | null
  aoMudar: (id: string, alterar: (p: LinhaPessoa) => LinhaPessoa) => void
  aoAdicionar: () => void
  aoRemover: (id: string) => void
  aoVoltar: () => void
}) {
  return (
    <div className="flex flex-col gap-(--space-150)">
      <p className="max-w-3xl text-xs text-(--text-subtle)">
        Uma linha por pessoa da equipe, dizendo como ela recebe: salário (CLT), pró-labore, bolsa de
        estágio, por diária ou por projeto. Informe os custos da sua empresa; confirme encargos com
        a contabilidade. A hora de custo de cada um sai dessas informações. Horas no mês são a
        jornada real: por exemplo, 40 h por semana ≈ 173 h por mês. Use o mês que deseja estimar e
        atualize quando souber. Para o sócio, as horas que ele de fato trabalha na consultoria. Só
        membros com login entram: quem ainda não tem conta precisa ser convidado em Equipe.
      </p>
      {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Pessoa
              </th>
              <th scope="col" className={`${classeCabecalho} w-44`}>
                Profissão
              </th>
              <th scope="col" className={`${classeCabecalho} w-16 text-center`}>
                Sócio
              </th>
              <th scope="col" className={`${classeCabecalho} w-44`}>
                Como recebe
              </th>
              <th scope="col" className={`${classeCabecalho} w-40 text-right`}>
                Custo (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                Horas
              </th>
              <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                Hora de custo
              </th>
              <th scope="col" className={`${classeCabecalho} w-12`}>
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p, indice) => {
              const n = String(indice + 1)
              const lida = remuneracaoDaLinha(p)
              const resumo = typeof lida === 'string' ? null : resumoDaPessoa(lida)
              // Cada membro uma vez: os já escolhidos em outras linhas saem da lista.
              const escolhidos = new Set(linhas.filter((x) => x.id !== p.id).map((x) => x.membroId))
              const opcoes = membros.filter((m) => !escolhidos.has(m.id))
              const membroSumiu = p.membroId !== '' && !membros.some((m) => m.id === p.membroId)
              const numero = (
                rotulo: string,
                chave:
                  | 'custo'
                  | 'horas'
                  | 'diaria'
                  | 'horasDiaria'
                  | 'dias'
                  | 'projeto'
                  | 'horasProjeto',
                opcoesDoCampo: {
                  reais?: boolean
                  placeholder?: string
                  legenda?: string
                  /** Aviso ligado ao campo (ex.: capacidade não calculada). */
                  aviso?: string | null
                },
              ) => {
                const valor = p[chave]
                const invalido = opcoesDoCampo.reais
                  ? lerReaisOuNulo(valor) === undefined
                  : lerInteiroOuNulo(valor) === undefined
                const idAviso = `aviso-${chave}-${p.id}`
                const campoDaPessoa = (
                  <label className="flex items-center justify-end gap-(--space-050)">
                    <input
                      aria-label={`${rotulo} da linha ${n}`}
                      aria-describedby={opcoesDoCampo.aviso ? idAviso : undefined}
                      inputMode={opcoesDoCampo.reais ? 'decimal' : 'numeric'}
                      placeholder={opcoesDoCampo.placeholder}
                      aria-invalid={invalido || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={valor}
                      onChange={(e) => {
                        const novo = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, [chave]: novo }))
                      }}
                    />
                    {opcoesDoCampo.legenda ? (
                      <span className="w-14 shrink-0 text-xs text-(--text-subtle)">
                        {opcoesDoCampo.legenda}
                      </span>
                    ) : null}
                  </label>
                )
                // Estrutura sempre igual: o campo não é recriado quando o aviso aparece ou some
                // (senão a digitação se perde no meio). O aviso não é erro.
                return (
                  <div className="flex flex-col items-end gap-(--space-050)">
                    {campoDaPessoa}
                    {opcoesDoCampo.aviso ? (
                      <span
                        id={idAviso}
                        className="max-w-56 text-right text-xs text-(--text-subtle)"
                      >
                        {opcoesDoCampo.aviso}
                      </span>
                    ) : null}
                  </div>
                )
              }
              const semCapacidade = resumo?.capacidadeHorasMes === null
              const avisoCapacidade = (oQueFalta: string) =>
                semCapacidade
                  ? `${oQueFalta} não informados; capacidade não calculada. Fica fora da média e do rateio; a hora de custo continua válida.`
                  : null
              let custo: ReactNode
              let horas: ReactNode
              if (p.forma === 'diaria') {
                custo = numero('Custo por diária', 'diaria', { reais: true, legenda: 'diária' })
                horas = (
                  <div className="flex flex-col gap-(--space-050)">
                    {numero('Horas por diária', 'horasDiaria', { legenda: 'h/diária' })}
                    {numero('Dias no mês', 'dias', {
                      placeholder: 'Opcional',
                      legenda: 'dias/mês',
                      aviso: avisoCapacidade('Dias no mês'),
                    })}
                  </div>
                )
              } else if (p.forma === 'projeto') {
                custo = numero('Custo do projeto', 'projeto', { reais: true, legenda: 'projeto' })
                horas = (
                  <div className="flex flex-col gap-(--space-050)">
                    {numero('Horas do projeto', 'horasProjeto', { legenda: 'h/projeto' })}
                    {numero('Horas no mês', 'horas', {
                      placeholder: 'Opcional',
                      legenda: 'h/mês',
                      aviso: avisoCapacidade('Horas no mês'),
                    })}
                  </div>
                )
              } else {
                custo = numero('Custo mensal', 'custo', { reais: true, legenda: 'mês' })
                horas = numero('Horas no mês', 'horas', {
                  placeholder: '173',
                  legenda: 'h/mês',
                  aviso: avisoCapacidade('Horas no mês'),
                })
              }
              return (
                <tr key={p.id} className="align-top">
                  <td className={classeCelula}>
                    <select
                      aria-label={`Pessoa da linha ${n}`}
                      className={classeCampo}
                      value={p.membroId}
                      aria-invalid={p.membroId === '' || membroSumiu || undefined}
                      aria-busy={membrosCarregando || undefined}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, membroId: valor }))
                      }}
                    >
                      <option value="">{membrosCarregando ? 'Carregando…' : 'Escolha'}</option>
                      {membroSumiu ? <option value={p.membroId}>Membro desligado</option> : null}
                      {opcoes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Profissão da linha ${n}`}
                      list="profissoes-da-consultoria"
                      placeholder="Ex.: Biólogo"
                      className={classeCampo}
                      value={p.profissao}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, profissao: valor }))
                      }}
                    />
                  </td>
                  <td className={`${classeCelula} text-center`}>
                    <CaixaSelecao
                      rotulo={<span className="sr-only">Sócio, com pró-labore, na linha {n}</span>}
                      checked={p.socio}
                      onChange={(e) => {
                        const marcado = e.target.checked
                        aoMudar(p.id, (x) => ({ ...x, socio: marcado }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <select
                      aria-label={`Como recebe na linha ${n}`}
                      className={classeCampo}
                      value={p.forma}
                      aria-invalid={p.forma === '' || undefined}
                      aria-describedby={p.forma === '' ? `forma-pendente-${n}` : undefined}
                      onChange={(e) => {
                        const valor = e.target.value as FormaDeRecebimento | ''
                        aoMudar(p.id, (x) => ({ ...x, forma: valor }))
                      }}
                    >
                      {p.forma === '' ? <option value="">Ainda não informado</option> : null}
                      {FORMAS_DE_RECEBIMENTO.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_DA_FORMA[f]}
                        </option>
                      ))}
                    </select>
                    {p.forma === '' ? (
                      <span
                        id={`forma-pendente-${n}`}
                        className="mt-(--space-025) block text-xs text-(--text-subtle)"
                      >
                        Confirme como esta pessoa recebe
                      </span>
                    ) : null}
                  </td>
                  <td className={classeCelula}>{custo}</td>
                  <td className={classeCelula}>{horas}</td>
                  <td className={`${classeCelula} text-right tabular-nums text-(--text-subtle)`}>
                    {resumo?.horaDeCustoCentavos == null
                      ? '—'
                      : formatarCentavos(resumo.horaDeCustoCentavos)}{' '}
                    <span className="sr-only">por hora, na linha {n}</span>
                  </td>
                  <td className={classeCelula}>
                    <BotaoIcone
                      icone="trash-2"
                      rotulo={`Remover linha ${n} da equipe`}
                      onClick={() => {
                        aoRemover(p.id)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Botao aparencia="link" iconeAntes="plus" onClick={aoAdicionar}>
          Adicionar pessoa
        </Botao>
        <Botao aparencia="link" onClick={aoVoltar}>
          Digitar o custo da hora e as horas
        </Botao>
      </div>
      <dl
        aria-label="Resultado da equipe"
        className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo"
      >
        <dt className="text-(--text-subtle)">Custo médio por hora da equipe</dt>
        <dd className="text-right tabular-nums">
          {previa?.horaTecnicaCentavos == null
            ? 'pendente'
            : formatarReais(previa.horaTecnicaCentavos)}
        </dd>
        <dt className="text-(--text-subtle)">Horas da equipe por mês</dt>
        <dd className="text-right tabular-nums">
          {previa ? `${textoDasHoras(previa.horasFaturaveisMes)} h` : 'pendente'}
        </dd>
        <dt className="text-(--text-subtle)">Remuneração dos sócios (pró-labore)</dt>
        <dd className="text-right tabular-nums">
          {previa ? formatarReais(previa.remuneracaoDosSociosCentavos) : 'pendente'}
        </dd>
        {custoPorProfissao.map((c) => (
          <Fragment key={c.profissao}>
            <dt className="text-(--text-subtle)">Custo por hora de {c.profissao}</dt>
            <dd className="text-right tabular-nums">{formatarReais(c.horaTecnicaCentavos)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="max-w-3xl text-xs text-(--text-subtle)">
        A média e o rateio das contas usam quem tem custo e horas do mês conhecidos; quem recebe por
        projeto, ou por diária sem os dias no mês, fica de fora deles, mas tem a própria hora de
        custo. No orçamento, o custo de cada serviço usa a hora do responsável.
      </p>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-(--space-150) border-b p-(--space-200) last:border-b-0"
    >
      <h2 className="titulo-secao text-(--text)">{titulo}</h2>
      {children}
    </section>
  )
}

function Linha({
  id,
  rotulo,
  apoio,
  children,
}: {
  id: string
  rotulo: string
  apoio?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid items-center gap-(--space-100) sm:grid-cols-[260px_160px_1fr]">
      <label htmlFor={id} className="corpo text-(--text)">
        {rotulo}
      </label>
      {children}
      {apoio ? <span className="text-xs text-(--text-subtle)">{apoio}</span> : <span />}
    </div>
  )
}

function ContasDoMes({
  linhas,
  pelaEquipe,
  total,
  aoMudar,
  aoAdicionar,
  aoSugerir,
  aoRemover,
  children,
}: {
  linhas: readonly LinhaConta[]
  pelaEquipe: boolean
  total: number
  aoMudar: (id: string, alterar: (l: LinhaConta) => LinhaConta) => void
  aoAdicionar: (descricao: string) => void
  aoSugerir: () => void
  aoRemover: (id: string) => void
  /** Campo do total, mostrado enquanto não há contas detalhadas. */
  children: React.ReactNode
}) {
  if (linhas.length === 0) {
    return (
      <>
        {children}
        <div className="flex flex-wrap gap-(--space-100)">
          <Botao aparencia="link" iconeAntes="list" onClick={aoSugerir}>
            Detalhar contas do mês
          </Botao>
        </div>
      </>
    )
  }
  return (
    <section aria-label="Contas do mês" className="flex flex-col gap-(--space-100)">
      <div className="flex flex-col gap-(--space-025)">
        <h3 className="corpo-medio text-(--text)">Contas do mês</h3>
        <p className="text-xs text-(--text-subtle)">
          {pelaEquipe
            ? 'Sem a remuneração de quem está na equipe: ela já entra pela composição.'
            : 'Inclua o pró-labore que não está na hora técnica.'}{' '}
          Use o valor do último mês (fatura ou extrato); a que não souber, deixe em branco e
          complete depois. Conta sem valor conta como zero. Cada orçamento mostra quanto cobre de
          cada conta.
        </p>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Conta
              </th>
              <th scope="col" className={`${classeCabecalho} w-40 text-right`}>
                Valor por mês (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-12`}>
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, indice) => {
              const n = String(indice + 1)
              return (
                <tr key={l.id}>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Conta ${n}`}
                      className={classeCampo}
                      value={l.descricao}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(l.id, (x) => ({ ...x, descricao: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Valor por mês da conta ${n}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={l.valor}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(l.id, (x) => ({ ...x, valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <BotaoIcone
                      icone="trash-2"
                      rotulo={`Remover conta ${n}`}
                      onClick={() => {
                        aoRemover(l.id)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={`${classeCelula} text-left corpo-medio`}>
                Total do mês
              </th>
              <td className={`${classeCelula} text-right corpo-medio tabular-nums`}>
                {formatarCentavos(total)}
              </td>
              <td className={classeCelula} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div>
        <Botao
          aparencia="link"
          iconeAntes="plus"
          onClick={() => {
            aoAdicionar('')
          }}
        >
          Adicionar conta
        </Botao>
      </div>
    </section>
  )
}
