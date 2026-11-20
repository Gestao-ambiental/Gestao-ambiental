// /orcamentos/primeiros-passos (ADR-0020): configuração inicial do orçamento em seis passos, com os
// mesmos campos e regras de Custos e taxas e de Dados da proposta. Cada passo é salvo num rascunho
// da consultoria (dá para parar e voltar, inclusive outra pessoa da Gestão). A base usada nos
// cálculos só muda quando a pessoa publica no resumo. Ausente fica em branco, nunca vira zero.

import {
  custoFixoPorHora,
  custoHoraPorProfissao,
  formatarCentavos,
  formatarReais,
  horasDaEquipe,
  linhasMensaisDaEquipe,
  PASSO_DA_PENDENCIA,
  pendenciasDaConfiguracao,
  resumoDaConfiguracao,
  type ComposicaoDaEquipe,
  type ModoDoCusto,
  type PassoContas,
  type PassoEquipe,
  type PassoPrecos,
  type PassoTributos,
  type PendenciaDaConfiguracao,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { AvisoDeSaida } from '@/components/aviso-de-saida'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import {
  obterBaseDeCustos,
  type BaseDeCustosDaConsultoria,
  type HoraDeVenda,
} from '@/lib/api/orcamentos'
import { listarMembrosAtivos, type MembroAtivo } from '@/lib/api/perfil'
import {
  descartarConfiguracao,
  dispensarConfiguracao,
  obterConfiguracao,
  publicarConfiguracao,
  salvarPasso,
  type DadosDoRascunho,
  type EstadoDaConfiguracao,
  type PassoSalvo,
  type RascunhoDaConfiguracao,
} from '@/lib/api/primeiros-passos'
import { formatarInstanteComHora } from '@/lib/datas'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { lerEstimativa, lerHoras, lerPercentual, textoDasHoras, textoDoPercentual } from './calculo'
import {
  camposDeDeslocamentoDe,
  composicaoDe,
  lerDeslocamento,
  lerEquipe,
  lerHorasDeVenda,
  linhasDeContaDe,
  linhasDePessoaDe,
  linhasDePrecoDe,
  novaPessoa,
  profissoesDosMembros,
  rotuloDaLinhaDePreco,
  usaFaixas,
  type CamposDeDeslocamento,
  type LinhaConta,
  type LinhaHora,
  type LinhaPessoa,
} from './campos-da-base'
import { classeCampo, reaisDigitados } from './comum'
import { DadosDaProposta } from './PaginaDadosDaProposta'
import { AvisoDeMargemBaixa, ContasDoMes, Equipe, Linha } from './PecasDaBase'
import { Deslocamento, TabelaDePrecos } from './PecasDeCobranca'

type Etapa = 1 | 2 | 3 | 4 | 5 | 6

const ETAPAS: readonly Etapa[] = [1, 2, 3, 4, 5, 6]

const TITULO_DA_ETAPA: Record<Etapa, string> = {
  1: 'Sua equipe',
  2: 'Contas do mês',
  3: 'Como vocês cobram',
  4: 'Tributos e margens',
  5: 'Sua proposta',
  6: 'Resumo',
}

const ROTULO_DA_PENDENCIA: Record<PendenciaDaConfiguracao, string> = {
  equipe: 'Custo da equipe: ao menos uma pessoa com custo e horas do mês, ou o custo da hora',
  horas: 'Horas faturáveis por mês',
  contas: 'Contas do mês (pode ser 0, se digitar)',
  precos: 'Tabela de preços (ao menos uma linha)',
  tributos: 'Tributos sobre o faturamento (pode ser 0, se digitar)',
  taxas: 'Taxas de cobrança e por documento assinado (pode ser 0, se digitar)',
  margens: 'Margens confirmadas',
}

const CHAVE_DA_CONFIGURACAO = 'configuracao-orcamento'

export function PaginaPrimeirosPassos() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Primeiros passos do orçamento">
        <SemPermissao descricao="Custos, preços e margens são dados restritos: só a gestão configura." />
      </Pagina>
    )
  }
  return <Carregador />
}

/** Carrega o rascunho, a base atual e os membros; recarregar monta o fluxo de novo. */
function Carregador() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [geracao, setGeracao] = useState(0)
  const estado = useQuery({
    queryKey: [CHAVE_DA_CONFIGURACAO, cid],
    queryFn: () => obterConfiguracao(cid),
  })
  const base = useQuery({
    queryKey: ['base-de-custos', cid],
    queryFn: () => obterBaseDeCustos(cid),
  })

  async function recarregar() {
    await Promise.all([estado.refetch(), base.refetch()])
    setGeracao((g) => g + 1)
  }

  if (estado.isPending || base.isPending) {
    return <Carregando rotulo="Carregando os primeiros passos" linhas={6} />
  }
  if (estado.isError || base.isError) {
    return (
      <Pagina titulo="Primeiros passos do orçamento">
        <EstadoErro
          titulo="Não foi possível carregar a configuração."
          aoTentarDeNovo={() => void recarregar()}
        />
      </Pagina>
    )
  }
  return (
    <Fluxo
      key={geracao}
      consultoriaId={cid}
      fuso={atual.fuso}
      estado={estado.data}
      base={base.data}
      aoRecarregar={recarregar}
      aoConferirBase={() => void estado.refetch()}
    />
  )
}

// ---------------------------------------------------------------------------
// Estado de cada passo enquanto a pessoa digita (texto)
// ---------------------------------------------------------------------------

interface FormEquipe {
  modo: ModoDoCusto
  /** Guardadas também no modo manual: voltar a calcular pela equipe não perde ninguém. */
  linhas: LinhaPessoa[]
  horaTecnica: string
}

interface FormContas {
  contas: LinhaConta[]
  total: string
  /** Só no modo manual. */
  horas: string
}

interface FormPrecos {
  horas: LinhaHora[]
  deslocamento: CamposDeDeslocamento
}

interface FormTributos {
  tributos: string
  taxas: string
  cobranca: string
  assinatura: string
  desejada: string
  minima: string
  confirmadas: boolean
}

function reaisOuBranco(v: number | null): string {
  return v === null ? '' : formatarCentavos(v)
}
function percentualOuBranco(v: number | null): string {
  return v === null ? '' : textoDoPercentual(v)
}

/** Do rascunho, se o passo já foi salvo; senão, da base publicada; senão, em branco. */
function formEquipeDe(d: DadosDoRascunho, base: BaseDeCustosDaConsultoria | null): FormEquipe {
  if (d.equipe) {
    return {
      modo: d.equipe.modo,
      linhas: linhasDePessoaDe(d.equipe.equipe),
      horaTecnica: reaisOuBranco(d.equipe.horaTecnicaCentavos),
    }
  }
  if (base) {
    const manual = base.equipe.length === 0
    return {
      modo: manual ? 'manual' : 'equipe',
      linhas: manual ? [] : linhasDePessoaDe(base.equipe),
      horaTecnica: manual ? formatarCentavos(base.horaTecnicaCentavos) : '',
    }
  }
  return { modo: 'equipe', linhas: [novaPessoa()], horaTecnica: '' }
}

function formContasDe(d: DadosDoRascunho, base: BaseDeCustosDaConsultoria | null): FormContas {
  if (d.contas) {
    return {
      contas: linhasDeContaDe(d.contas.contas),
      total: reaisOuBranco(d.contas.custosFixosMensaisCentavos),
      horas: d.contas.horasFaturaveisMes === null ? '' : textoDasHoras(d.contas.horasFaturaveisMes),
    }
  }
  if (base) {
    return {
      contas: linhasDeContaDe(base.contas),
      total: formatarCentavos(base.custosFixosMensaisCentavos),
      horas: base.equipe.length === 0 ? textoDasHoras(base.horasFaturaveisMes) : '',
    }
  }
  return { contas: [], total: '', horas: '' }
}

function formPrecosDe(d: DadosDoRascunho, base: BaseDeCustosDaConsultoria | null): FormPrecos {
  if (d.precos) {
    return {
      horas: linhasDePrecoDe(d.precos.horasVenda),
      deslocamento: camposDeDeslocamentoDe(d.precos, { zeroEmBranco: false }),
    }
  }
  // Na base, visita e km 0 querem dizer "não cadastrado" (como em Custos e taxas).
  return {
    horas: linhasDePrecoDe(base?.horasVenda ?? []),
    deslocamento: camposDeDeslocamentoDe(base, { zeroEmBranco: true }),
  }
}

function formTributosDe(d: DadosDoRascunho, base: BaseDeCustosDaConsultoria | null): FormTributos {
  if (d.tributos) {
    const t = d.tributos
    return {
      tributos: percentualOuBranco(t.tributosPb),
      taxas: percentualOuBranco(t.taxasPb),
      cobranca: reaisOuBranco(t.taxaPorCobrancaCentavos),
      assinatura: reaisOuBranco(t.taxaPorAssinaturaCentavos),
      desejada: percentualOuBranco(t.margemDesejadaPb),
      minima: percentualOuBranco(t.margemMinimaPb),
      confirmadas: t.margensConfirmadas,
    }
  }
  if (base) {
    return {
      tributos: textoDoPercentual(base.tributosPb),
      taxas: textoDoPercentual(base.taxasPb),
      cobranca: formatarCentavos(base.taxaPorCobrancaCentavos),
      assinatura: formatarCentavos(base.taxaPorAssinaturaCentavos),
      desejada: textoDoPercentual(base.margemDesejadaPb),
      minima: textoDoPercentual(base.margemMinimaPb),
      confirmadas: true,
    }
  }
  // Base nova: margens só para começar (pedem confirmação); tributos e taxas em branco.
  return {
    tributos: '',
    taxas: '',
    cobranca: '',
    assinatura: '',
    desejada: '30',
    minima: '25',
    confirmadas: false,
  }
}

// ---------------------------------------------------------------------------
// Leitura de cada passo: mesmas regras de Custos e taxas; em branco fica nulo
// ---------------------------------------------------------------------------

function lerPercentualOuNulo(texto: string): number | null | undefined {
  if (texto.trim() === '') return null
  return lerPercentual(texto) ?? undefined
}

function lerFormEquipe(
  f: FormEquipe,
  profissaoDoMembro: ReadonlyMap<string, string>,
): PassoEquipe | string {
  if (f.modo === 'manual') {
    const hora = lerEstimativa(f.horaTecnica)
    if (hora === undefined) return 'Custo da hora técnica: valor inválido. Use, por exemplo, 95,00.'
    return { modo: 'manual', equipe: [], horaTecnicaCentavos: hora }
  }
  const equipe = lerEquipe(f.linhas, profissaoDoMembro)
  if (typeof equipe === 'string') return equipe
  return { modo: 'equipe', equipe, horaTecnicaCentavos: null }
}

function lerFormContas(f: FormContas, modo: ModoDoCusto): PassoContas | string {
  const contas: PassoContas['contas'] = []
  for (const [indice, l] of f.contas.entries()) {
    const n = String(indice + 1)
    if (!l.descricao.trim()) return `Contas do mês, linha ${n}: informe a conta.`
    const valor = lerEstimativa(l.valor)
    if (valor === undefined) return `Contas do mês, linha ${n}: valor inválido.`
    contas.push({ descricao: l.descricao.trim(), valorCentavos: valor })
  }
  const total = contas.length > 0 ? null : lerEstimativa(f.total)
  if (total === undefined) return 'Total das contas por mês: valor inválido.'
  let horas: number | null = null
  if (modo === 'manual' && f.horas.trim() !== '') {
    horas = lerHoras(f.horas)
    if (horas === null) return 'Horas faturáveis por mês: use um número, como 160 ou 120,5.'
  }
  return { custosFixosMensaisCentavos: total, contas, horasFaturaveisMes: horas }
}

function lerFormPrecos(f: FormPrecos): PassoPrecos<HoraDeVenda> | string {
  // Preço em branco não vira zero: a linha precisa do preço digitado (0 se não cobra).
  for (const [indice, l] of f.horas.entries()) {
    if (!usaFaixas(l) && l.valor.trim() === '') {
      return `${rotuloDaLinhaDePreco(f.horas, indice)}: informe o preço (digite 0 se não cobra).`
    }
  }
  const horasVenda = lerHorasDeVenda(f.horas)
  if (typeof horasVenda === 'string') return horasVenda
  const d = lerDeslocamento(f.deslocamento)
  if (typeof d === 'string') return d
  // Por visita, o km não se aplica: fica nulo no rascunho (o banco deriva na publicação).
  return {
    horasVenda,
    ...d,
    custoKmCentavos: d.deslocamentoModo === 'km' ? d.custoKmCentavos : null,
  }
}

function lerFormTributos(f: FormTributos): PassoTributos | string {
  const tributos = lerPercentualOuNulo(f.tributos)
  const taxas = lerPercentualOuNulo(f.taxas)
  const desejada = lerPercentualOuNulo(f.desejada)
  const minima = lerPercentualOuNulo(f.minima)
  if (tributos === undefined) return 'Tributos sobre o faturamento: use um percentual de 0 a 100.'
  if (taxas === undefined) return 'Taxa percentual de cobrança: use um percentual de 0 a 100.'
  if (desejada === undefined) return 'Margem desejada: use um percentual de 0 a 100.'
  if (minima === undefined) return 'Margem mínima: use um percentual de 0 a 100.'
  const cobranca = lerEstimativa(f.cobranca)
  if (cobranca === undefined) return 'Taxa fixa por cobrança: valor inválido.'
  const assinatura = lerEstimativa(f.assinatura)
  if (assinatura === undefined) return 'Taxa por documento assinado: valor inválido.'
  if ((desejada ?? 0) + (tributos ?? 0) + (taxas ?? 0) >= 10_000)
    return 'Margem, tributos e taxas somados precisam ficar abaixo de 100%.'
  return {
    tributosPb: tributos,
    taxasPb: taxas,
    taxaPorCobrancaCentavos: cobranca,
    taxaPorAssinaturaCentavos: assinatura,
    margemDesejadaPb: desejada,
    margemMinimaPb: minima,
    margensConfirmadas: f.confirmadas,
  }
}

// ---------------------------------------------------------------------------
// O fluxo
// ---------------------------------------------------------------------------

interface Falha {
  texto: string
  codigo?: string
}

function Fluxo({
  consultoriaId,
  fuso,
  estado,
  base,
  aoRecarregar,
  aoConferirBase,
}: {
  consultoriaId: string
  fuso: string
  estado: EstadoDaConfiguracao
  base: BaseDeCustosDaConsultoria | null
  aoRecarregar: () => Promise<void>
  aoConferirBase: () => void
}) {
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const membros = useQuery({
    queryKey: ['membros-ativos', consultoriaId],
    queryFn: () => listarMembrosAtivos(consultoriaId),
  })
  // A profissão de cada pessoa vem do cadastro dela em Equipe (ADR-0021).
  const profissaoDoMembro = profissoesDosMembros(membros.data ?? [])

  const [rascunho, setRascunho] = useState<RascunhoDaConfiguracao | null>(estado.rascunho)
  const dados: DadosDoRascunho = rascunho?.dados ?? {}
  // A tela copiou os valores desta versão da base; o banco confere ao criar e ao publicar.
  const baseInicial = rascunho?.baseRowVersion ?? base?.rowVersion ?? 0

  const [etapa, setEtapa] = useState<Etapa>(() => (rascunho?.etapa ?? 1) as Etapa)
  const [equipe, setEquipe] = useState<FormEquipe>(() => formEquipeDe(dados, base))
  const [contas, setContas] = useState<FormContas>(() => formContasDe(dados, base))
  const [precos, setPrecos] = useState<FormPrecos>(() => formPrecosDe(dados, base))
  const [tributos, setTributos] = useState<FormTributos>(() => formTributosDe(dados, base))
  const [alterados, setAlteradosNoEstado] = useState<ReadonlySet<Etapa>>(new Set())
  const [propostaAlterada, setPropostaAlteradaNoEstado] = useState(false)
  // Cópias em ref: o aviso de saída lê o valor de agora, não o da última renderização (ex.: sair
  // logo depois de salvar).
  const alteradosAgora = useRef<ReadonlySet<Etapa>>(new Set())
  const propostaAlteradaAgora = useRef(false)
  function setAlterados(alterar: (a: ReadonlySet<Etapa>) => ReadonlySet<Etapa>) {
    alteradosAgora.current = alterar(alteradosAgora.current)
    setAlteradosNoEstado(alteradosAgora.current)
  }
  function setPropostaAlterada(alterada: boolean) {
    propostaAlteradaAgora.current = alterada
    setPropostaAlteradaNoEstado(alterada)
  }
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<Falha | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const operacao = useRef<{ chave: string; id: string } | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const resumoDaFalha = useRef<HTMLDivElement>(null)
  const primeiraVez = useRef(true)

  // Ao trocar de passo, o foco vai para o título (leitor de tela anuncia o passo novo).
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false
      return
    }
    titulo.current?.focus()
  }, [etapa])

  useEffect(() => {
    if (falha) resumoDaFalha.current?.focus()
  }, [falha])

  const algoNaoSalvo = alterados.size > 0 || propostaAlterada

  function marcarAlterado(e: Etapa) {
    setAlterados((a) => (a.has(e) ? a : new Set([...a, e])))
    setAviso(null)
  }

  function irPara(e: Etapa) {
    setFalha(null)
    setAviso(null)
    setEtapa(e)
    if (e === 6) aoConferirBase()
  }

  /** O passo lido do formulário, ou a mensagem do primeiro problema. */
  function passoAtual(e: Etapa): PassoSalvo | string {
    switch (e) {
      case 1: {
        const lido = lerFormEquipe(equipe, profissaoDoMembro)
        return typeof lido === 'string' ? lido : { etapa: 1, dados: lido }
      }
      case 2: {
        const lido = lerFormContas(contas, equipe.modo)
        return typeof lido === 'string' ? lido : { etapa: 2, dados: lido }
      }
      case 3: {
        const lido = lerFormPrecos(precos)
        return typeof lido === 'string' ? lido : { etapa: 3, dados: lido }
      }
      case 4: {
        const lido = lerFormTributos(tributos)
        return typeof lido === 'string' ? lido : { etapa: 4, dados: lido }
      }
      default:
        return { etapa: 5 }
    }
  }

  async function salvar(e: Etapa, proxima: Etapa, depois?: () => void) {
    if (e === 6) return
    if (e === 5 && propostaAlterada) {
      setFalha({
        texto:
          'Os dados da proposta têm mudanças não salvas. Clique em "Salvar dados da proposta" ou desfaça antes de continuar.',
      })
      return
    }
    const passo = passoAtual(e)
    if (typeof passo === 'string') {
      setFalha({ texto: passo })
      return
    }
    // A mesma tentativa (mesmo conteúdo e versão) repete a mesma operação: o banco não grava duas vezes.
    const versao = rascunho?.rowVersion ?? 0
    const chave = JSON.stringify([passo, proxima, versao])
    const id = operacao.current?.chave === chave ? operacao.current.id : crypto.randomUUID()
    operacao.current = { chave, id }
    setSalvando(true)
    setFalha(null)
    setAviso(null)
    try {
      const novo = await salvarPasso(consultoriaId, {
        rowVersion: versao,
        passo,
        proximaEtapa: proxima,
        baseRowVersion: baseInicial,
        operacao: id,
      })
      operacao.current = null
      setRascunho(novo)
      setAlterados((a) => new Set([...a].filter((x) => x !== e)))
      queryClient.setQueryData<EstadoDaConfiguracao>([CHAVE_DA_CONFIGURACAO, consultoriaId], (a) =>
        a ? { ...a, rascunho: novo } : a,
      )
      setAviso(`Passo ${String(e)} salvo.`)
      if (depois) depois()
      else irPara(proxima)
    } catch (erro) {
      setFalha({ texto: mensagemDoErro(erro), codigo: codigoDoErro(erro) })
    } finally {
      setSalvando(false)
    }
  }

  async function recomecar() {
    setSalvando(true)
    try {
      if (rascunho) await descartarConfiguracao(consultoriaId, rascunho.rowVersion)
      setAlterados(() => new Set())
      setPropostaAlterada(false)
      await queryClient.invalidateQueries({ queryKey: [CHAVE_DA_CONFIGURACAO, consultoriaId] })
      await aoRecarregar()
    } catch (erro) {
      setFalha({ texto: mensagemDoErro(erro), codigo: codigoDoErro(erro) })
      setSalvando(false)
    }
  }

  async function recarregar() {
    setAlterados(() => new Set())
    setPropostaAlterada(false)
    await aoRecarregar()
  }

  async function verOrcamentos() {
    // A escolha fica guardada para esta pessoa; se falhar, o convite só volta a aparecer.
    try {
      await dispensarConfiguracao(consultoriaId)
      await queryClient.invalidateQueries({ queryKey: [CHAVE_DA_CONFIGURACAO, consultoriaId] })
    } catch {
      // não bloqueia a lista
    }
    void navegar('/orcamentos')
  }

  async function publicar() {
    if (!rascunho) return
    setSalvando(true)
    setFalha(null)
    try {
      await publicarConfiguracao(consultoriaId, rascunho.rowVersion)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE_DA_CONFIGURACAO, consultoriaId] }),
        queryClient.invalidateQueries({ queryKey: ['base-de-custos', consultoriaId] }),
      ])
      void navegar('/orcamentos?novo=1')
    } catch (erro) {
      setFalha({ texto: mensagemDoErro(erro), codigo: codigoDoErro(erro) })
      setSalvando(false)
    }
  }

  // Leitura do passo atual para as pendências e prévias (o que ainda não foi salvo também conta).
  const lidoEquipe = lerFormEquipe(equipe, profissaoDoMembro)
  const equipeLida = typeof lidoEquipe === 'string' ? null : lidoEquipe
  const previa: ComposicaoDaEquipe | null =
    equipe.modo === 'equipe'
      ? (() => {
          const lida = lerEquipe(equipe.linhas, profissaoDoMembro)
          return typeof lida === 'string' ? null : composicaoDe(lida)
        })()
      : null

  function pendenciasDoPasso(e: Etapa): PendenciaDaConfiguracao[] {
    const atual = passoAtual(e)
    if (typeof atual === 'string' || atual.etapa === 5) return []
    const combinado: DadosDoRascunho = { ...dados, ...(equipeLida ? { equipe: equipeLida } : {}) }
    if (atual.etapa === 2) combinado.contas = atual.dados
    if (atual.etapa === 3) combinado.precos = atual.dados
    if (atual.etapa === 4) combinado.tributos = atual.dados
    return pendenciasDaConfiguracao(combinado).filter((p) => PASSO_DA_PENDENCIA[p] === e)
  }

  const salvoNoRascunho = (e: Etapa): boolean => rascunho?.passosSalvos.includes(e) ?? false

  let conteudo: ReactNode
  if (etapa === 1) {
    conteudo = (
      <PassoDaEquipe
        form={equipe}
        membros={membros.data ?? []}
        membrosCarregando={membros.isPending}
        previa={previa}
        aoMudar={(alterar) => {
          setEquipe(alterar)
          marcarAlterado(1)
        }}
        aoDigitarHoras={(horas) => {
          // Ao trocar para o custo digitado, as horas da equipe vão para o passo 2.
          setContas((c) => (c.horas.trim() === '' ? { ...c, horas } : c))
        }}
      />
    )
  } else if (etapa === 2) {
    conteudo = (
      <PassoDasContas
        form={contas}
        modo={equipe.modo}
        horasDaEquipe={equipe.modo === 'equipe' ? (previa?.horasFaturaveisMes ?? 0) : null}
        aoMudar={(alterar) => {
          setContas(alterar)
          marcarAlterado(2)
        }}
        aoIrParaEquipe={() => {
          irPara(1)
        }}
      />
    )
  } else if (etapa === 3) {
    conteudo = (
      <PassoDosPrecos
        form={precos}
        aoMudar={(alterar) => {
          setPrecos(alterar)
          marcarAlterado(3)
        }}
      />
    )
  } else if (etapa === 4) {
    conteudo = (
      <PassoDosTributos
        form={tributos}
        baseNova={base === null}
        aoMudar={(alterar) => {
          setTributos(alterar)
          marcarAlterado(4)
        }}
      />
    )
  } else if (etapa === 5) {
    conteudo = (
      <div className="flex flex-col gap-(--e-4)">
        <DadosDaProposta
          consultoriaId={consultoriaId}
          nivelDosTitulos={3}
          rotuloSalvar="Salvar dados da proposta"
          aoAlterar={(alterada) => {
            setPropostaAlterada(alterada)
            // Dados salvos: o aviso de "mudanças não salvas" deixa de valer.
            if (!alterada) setFalha(null)
          }}
        />
      </div>
    )
  } else {
    conteudo = (
      <PassoDoResumo
        rascunho={rascunho}
        baseConfigurada={estado.baseConfigurada}
        baseMudou={rascunho !== null && estado.baseRowVersion !== rascunho.baseRowVersion}
        naoSalvos={ETAPAS.filter((e) => alterados.has(e) || (e === 5 && propostaAlterada))}
        publicando={salvando}
        aoIrPara={irPara}
        aoPublicar={() => void publicar()}
        aoRecomecar={() => void recomecar()}
        aoCriarSemPreco={() => void navegar('/orcamentos?novo=1')}
      />
    )
  }

  const pendencias = etapa <= 4 ? pendenciasDoPasso(etapa) : []

  return (
    <Pagina
      titulo="Primeiros passos do orçamento"
      meta={
        rascunho?.atualizadoPorNome && rascunho.atualizadoEm ? (
          <span className="numero">
            Última alteração por {rascunho.atualizadoPorNome} em{' '}
            {formatarInstanteComHora(rascunho.atualizadoEm, fuso)}
          </span>
        ) : undefined
      }
      acao={
        <Botao aparencia="sutil" onClick={() => void verOrcamentos()}>
          Ver orçamentos mesmo assim
        </Botao>
      }
    >
      <ProgressoDosPassos
        atual={etapa}
        salvo={salvoNoRascunho}
        alterado={(e) => alterados.has(e) || (e === 5 && propostaAlterada)}
        aoIrPara={irPara}
      />

      <section
        aria-labelledby="titulo-do-passo"
        className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) md:p-(--e-5)"
      >
        <h2
          id="titulo-do-passo"
          ref={titulo}
          tabIndex={-1}
          className="titulo-secao text-(--tinta) outline-none"
        >
          Passo {String(etapa)} de 6: {TITULO_DA_ETAPA[etapa]}
          {etapa === 5 ? ' (opcional)' : ''}
        </h2>

        {falha ? (
          <div ref={resumoDaFalha} tabIndex={-1} className="outline-none">
            <MensagemSecao
              role="alert"
              tom="perigo"
              acoes={
                falha.codigo === 'base_alterada' ? (
                  <Botao disabled={salvando} onClick={() => void recomecar()}>
                    Recomeçar com os valores atuais
                  </Botao>
                ) : falha.codigo === 'conflito_de_versao' ? (
                  <Botao disabled={salvando} onClick={() => void recarregar()}>
                    Recarregar
                  </Botao>
                ) : null
              }
            >
              {falha.texto}
              {falha.codigo === 'conflito_de_versao'
                ? ' Outra pessoa da gestão salvou esta configuração. Recarregar traz o que ela salvou; o que você digitou e não salvou se perde.'
                : null}
            </MensagemSecao>
          </div>
        ) : null}

        {conteudo}

        {pendencias.length > 0 ? (
          <div className="flex flex-col gap-(--e-1)">
            <p className="corpo-medio text-(--tinta)">Ainda falta neste passo</p>
            <ul className="flex flex-col gap-(--e-1) corpo">
              {pendencias.map((p) => (
                <li key={p} className="flex items-center gap-(--e-15)">
                  <Icone nome="circle-alert" className="text-(--tinta)" />
                  {ROTULO_DA_PENDENCIA[p]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {etapa <= 5 ? (
          <div className="flex flex-col-reverse gap-(--e-2) border-t pt-(--e-4) sm:flex-row sm:flex-wrap sm:items-center">
            {etapa > 1 ? (
              <Botao
                iconeAntes="arrow-left"
                disabled={salvando}
                onClick={() => {
                  irPara((etapa - 1) as Etapa)
                }}
              >
                Voltar
              </Botao>
            ) : null}
            <span className="min-w-0 flex-1 text-xs text-(--tinta-2)" aria-live="polite">
              {salvando
                ? 'Salvando…'
                : (aviso ?? (alterados.has(etapa) ? 'Alterado, não salvo.' : ''))}
            </span>
            {etapa <= 4 ? (
              <Botao
                disabled={salvando}
                onClick={() =>
                  void salvar(etapa, etapa, () => {
                    void navegar('/orcamentos')
                  })
                }
              >
                Salvar e continuar depois
              </Botao>
            ) : null}
            <Botao
              aparencia="primario"
              iconeDepois="arrow-right"
              disabled={salvando}
              aria-busy={salvando || undefined}
              onClick={() => void salvar(etapa, (etapa + 1) as Etapa)}
            >
              {etapa === 5 ? 'Continuar' : 'Salvar e continuar'}
            </Botao>
          </div>
        ) : null}
      </section>

      <AvisoDeSaida
        bloquear={() => alteradosAgora.current.size > 0 || propostaAlteradaAgora.current}
        sujo={algoNaoSalvo}
        descricao="Há passos com mudanças que ainda não foram salvas. Se sair agora, elas se perdem; o que já foi salvo continua guardado."
      />
    </Pagina>
  )
}

/** "Passo N de 6" em lista: o atual, os salvos e os alterados, em texto e não só por cor. */
function ProgressoDosPassos({
  atual,
  salvo,
  alterado,
  aoIrPara,
}: {
  atual: Etapa
  salvo: (e: Etapa) => boolean
  alterado: (e: Etapa) => boolean
  aoIrPara: (e: Etapa) => void
}) {
  return (
    <nav aria-label="Passos da configuração" className="overflow-x-auto">
      {/* Linha de trajeto como a Trilha: estação lima com aro (atual), cheia com check (salvo),
          vazada (não salvo). Cada estação é um botão: dá para ir e voltar à vontade. */}
      <ol className="flex items-center gap-(--e-2)">
        {ETAPAS.map((e) => {
          const ehAtual = e === atual
          const feito = salvo(e) && !alterado(e)
          const situacao = ehAtual
            ? 'atual'
            : alterado(e)
              ? 'alterado, não salvo'
              : feito
                ? 'salvo'
                : e === 6
                  ? ''
                  : 'não salvo'
          return (
            <li key={e} className="flex min-w-0 flex-1 items-center gap-(--e-2) last:flex-none">
              <button
                type="button"
                aria-current={ehAtual ? 'step' : undefined}
                onClick={() => {
                  aoIrPara(e)
                }}
                className="flex min-w-0 cursor-pointer items-center gap-(--e-2) rounded-(--raio) px-(--e-1) py-(--e-1) text-left transicao-estado hover:bg-(--toque) max-md:min-h-(--controle-toque)"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-(--raio-redondo) text-xs font-[800] numero',
                    ehAtual &&
                      'bg-(--sinal) text-(--sinal-texto) shadow-[0_0_0_2px_var(--folha),0_0_0_4px_var(--marca-linha)]',
                    !ehAtual && feito && 'bg-(--marca-linha) text-(--folha)',
                    !ehAtual &&
                      !feito &&
                      'border-2 border-(--regra-forte) bg-(--folha) text-(--tinta-2)',
                  )}
                >
                  {feito && !ehAtual ? <Icone nome="check" tamanho={12} /> : e}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-col',
                    ehAtual ? 'flex' : 'sr-only lg:not-sr-only lg:flex',
                  )}
                >
                  <span
                    className={cn(
                      'truncate',
                      ehAtual ? 'corpo-medio text-(--tinta)' : 'corpo text-(--tinta)',
                    )}
                  >
                    {/* Espaços fora do sr-only: dentro dele, somem do nome acessível. */}
                    <span className="sr-only">Passo {e}:</span> {TITULO_DA_ETAPA[e]}
                    {situacao ? <span className="sr-only">,</span> : null}
                  </span>{' '}
                  {situacao ? (
                    <span
                      className={cn(
                        'truncate text-xs',
                        alterado(e) && !ehAtual ? 'text-(--alerta-texto)' : 'text-(--tinta-2)',
                      )}
                    >
                      {situacao}
                    </span>
                  ) : null}
                </span>
              </button>
              {e < 6 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-[3px] min-w-(--e-3) flex-1 rounded-full',
                    feito
                      ? 'bg-(--marca-linha)'
                      : 'bg-[repeating-linear-gradient(90deg,var(--regra-forte)_0_6px,transparent_6px_10px)]',
                  )}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Passo 1: Sua equipe
// ---------------------------------------------------------------------------

function PassoDaEquipe({
  form,
  membros,
  membrosCarregando,
  previa,
  aoMudar,
  aoDigitarHoras,
}: {
  form: FormEquipe
  membros: readonly MembroAtivo[]
  membrosCarregando: boolean
  previa: ComposicaoDaEquipe | null
  aoMudar: (alterar: (f: FormEquipe) => FormEquipe) => void
  aoDigitarHoras: (horas: string) => void
}) {
  const lida = form.modo === 'equipe' ? lerEquipe(form.linhas, profissoesDosMembros(membros)) : null
  const custoPorProfissao =
    lida && typeof lida !== 'string' ? custoHoraPorProfissao(linhasMensaisDaEquipe(lida)) : []
  return (
    <div className="flex flex-col gap-(--e-3)">
      {form.modo === 'equipe' ? (
        <Equipe
          linhas={form.linhas}
          membros={membros}
          membrosCarregando={membrosCarregando}
          custoPorProfissao={custoPorProfissao}
          previa={previa}
          aoMudar={(id, alterar) => {
            aoMudar((f) => ({ ...f, linhas: f.linhas.map((p) => (p.id === id ? alterar(p) : p)) }))
          }}
          aoAdicionar={() => {
            aoMudar((f) => ({ ...f, linhas: [...f.linhas, novaPessoa()] }))
          }}
          aoRemover={(id) => {
            aoMudar((f) => ({ ...f, linhas: f.linhas.filter((p) => p.id !== id) }))
          }}
          aoVoltar={() => {
            // Leva o que já se via para os campos; a equipe fica guardada para voltar a ela.
            if (previa?.horaTecnicaCentavos != null) {
              const hora = previa.horaTecnicaCentavos
              aoMudar((f) => ({ ...f, modo: 'manual', horaTecnica: formatarCentavos(hora) }))
              aoDigitarHoras(textoDasHoras(previa.horasFaturaveisMes))
            } else {
              aoMudar((f) => ({ ...f, modo: 'manual' }))
            }
          }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-(--e-15)">
            <div>
              <Botao
                iconeAntes="users"
                onClick={() => {
                  aoMudar((f) => ({
                    ...f,
                    modo: 'equipe',
                    linhas: f.linhas.length > 0 ? f.linhas : [novaPessoa()],
                  }))
                }}
              >
                Calcular pela equipe
              </Botao>
            </div>
          </div>
          <Linha id="pp-hora" rotulo="Custo da hora técnica (R$)">
            <input
              id="pp-hora"
              inputMode="decimal"
              aria-invalid={lerEstimativa(form.horaTecnica) === undefined || undefined}
              className={`${classeCampo} text-right numero`}
              value={form.horaTecnica}
              onChange={(e) => {
                const valor = reaisDigitados(e)
                aoMudar((f) => ({ ...f, horaTecnica: valor }))
              }}
            />
          </Linha>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passo 2: Contas do mês
// ---------------------------------------------------------------------------

function PassoDasContas({
  form,
  modo,
  horasDaEquipe: horasEquipe,
  aoMudar,
  aoIrParaEquipe,
}: {
  form: FormContas
  modo: ModoDoCusto
  /** Com equipe: as horas dela (0 = ninguém com custo e horas do mês). */
  horasDaEquipe: number | null
  aoMudar: (alterar: (f: FormContas) => FormContas) => void
  aoIrParaEquipe: () => void
}) {
  const fixos =
    form.contas.length > 0
      ? form.contas.every((l) => lerEstimativa(l.valor) != null)
        ? form.contas.reduce((soma, l) => soma + (lerEstimativa(l.valor) ?? 0), 0)
        : null
      : (lerEstimativa(form.total) ?? null)
  const horas =
    modo === 'equipe' ? horasEquipe : form.horas.trim() === '' ? null : lerHoras(form.horas)
  const porHora =
    fixos === null || horas === null || horas <= 0
      ? null
      : custoFixoPorHora({
          horaTecnicaCentavos: 0,
          custosFixosMensaisCentavos: fixos,
          horasFaturaveisMes: horas,
        })
  const total = form.contas.reduce((soma, l) => soma + (lerEstimativa(l.valor) ?? 0), 0)
  return (
    <div className="flex flex-col gap-(--e-3)">
      <ContasDoMes
        linhas={form.contas}
        total={total}
        aoMudarLinhas={(alterar) => {
          aoMudar((f) => ({ ...f, contas: alterar(f.contas) }))
        }}
      >
        <Linha id="pp-total" rotulo="Total das contas por mês (R$)">
          <input
            id="pp-total"
            inputMode="decimal"
            aria-invalid={lerEstimativa(form.total) === undefined || undefined}
            className={`${classeCampo} text-right numero`}
            value={form.total}
            onChange={(e) => {
              const valor = reaisDigitados(e)
              aoMudar((f) => ({ ...f, total: valor }))
            }}
          />
        </Linha>
      </ContasDoMes>

      {modo === 'equipe' ? (
        <div className="flex flex-col gap-(--e-1)">
          <p className="corpo text-(--tinta)">
            Horas faturáveis por mês:{' '}
            <span className="corpo-medio">
              {horasEquipe && horasEquipe > 0 ? `${textoDasHoras(horasEquipe)} h` : 'pendente'}
            </span>
          </p>
          <Botao aparencia="link" className="self-start text-xs" onClick={aoIrParaEquipe}>
            Ajustar as horas no passo 1
          </Botao>
        </div>
      ) : (
        <Linha id="pp-horas" rotulo="Horas faturáveis por mês">
          <input
            id="pp-horas"
            inputMode="decimal"
            aria-invalid={(form.horas.trim() !== '' && lerHoras(form.horas) === null) || undefined}
            className={`${classeCampo} text-right numero`}
            value={form.horas}
            onChange={(e) => {
              const valor = e.target.value
              aoMudar((f) => ({ ...f, horas: valor }))
            }}
          />
        </Linha>
      )}

      <p className="corpo text-(--tinta-2)">
        Contas do mês por hora:{' '}
        <span className="corpo-medio text-(--tinta)">
          {porHora === null ? 'pendente' : `${formatarReais(porHora)} por hora`}
        </span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passo 3: Como vocês cobram
// ---------------------------------------------------------------------------

function PassoDosPrecos({
  form,
  aoMudar,
}: {
  form: FormPrecos
  aoMudar: (alterar: (f: FormPrecos) => FormPrecos) => void
}) {
  return (
    <div className="flex flex-col gap-(--e-3)">
      <TabelaDePrecos
        horas={form.horas}
        comAtalhoAceamb={false}
        aoMudar={(alterar) => {
          aoMudar((f) => ({ ...f, horas: alterar(f.horas) }))
        }}
      />
      <section
        aria-labelledby="pp-visitas"
        className="flex flex-col gap-(--e-2) border-t pt-(--e-3)"
      >
        <h3 id="pp-visitas" className="corpo-medio text-(--tinta)">
          Visita técnica e deslocamento (opcional)
        </h3>
        <Deslocamento
          campos={form.deslocamento}
          prefixo="pp"
          aoMudar={(alterar) => {
            aoMudar((f) => ({ ...f, deslocamento: alterar(f.deslocamento) }))
          }}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passo 4: Tributos e margens
// ---------------------------------------------------------------------------

function PassoDosTributos({
  form,
  baseNova,
  aoMudar,
}: {
  form: FormTributos
  baseNova: boolean
  aoMudar: (alterar: (f: FormTributos) => FormTributos) => void
}) {
  const desejada = lerPercentualOuNulo(form.desejada)
  const minima = lerPercentualOuNulo(form.minima)
  function campo(nome: Exclude<keyof FormTributos, 'confirmadas'>, reais: boolean) {
    const valor = form[nome]
    const invalido = reais
      ? lerEstimativa(valor) === undefined
      : lerPercentualOuNulo(valor) === undefined
    return {
      value: valor,
      inputMode: 'decimal' as const,
      'aria-invalid': invalido || undefined,
      className: `${classeCampo} text-right numero`,
      onChange: (e: { target: { value: string } }) => {
        const novo = e.target.value
        aoMudar((f) => ({
          ...f,
          [nome]: novo,
          // Mudar a margem também confirma (como em Custos e taxas).
          confirmadas: nome === 'desejada' || nome === 'minima' ? true : f.confirmadas,
        }))
      },
    }
  }
  return (
    <div className="flex flex-col gap-(--e-4)">
      <div className="flex flex-col gap-(--e-3)">
        <h3 className="corpo-medio text-(--tinta)">Tributos</h3>
        <Linha id="pp-tributos" rotulo="Tributos sobre o faturamento (%)">
          <input id="pp-tributos" {...campo('tributos', false)} />
        </Linha>
      </div>

      <div className="flex flex-col gap-(--e-3)">
        <h3 className="corpo-medio text-(--tinta)">Taxas de cobrança e assinatura</h3>
        <Botao
          aparencia="link"
          className="self-start text-xs"
          onClick={() => {
            aoMudar((f) => ({ ...f, taxas: '0', cobranca: '0,00', assinatura: '0,00' }))
          }}
        >
          Não pagamos nenhuma destas taxas
        </Botao>
        <Linha id="pp-taxas" rotulo="Taxa percentual de cobrança (%)">
          <input id="pp-taxas" {...campo('taxas', false)} />
        </Linha>
        <Linha id="pp-cobranca" rotulo="Taxa fixa por cobrança (R$)">
          <input id="pp-cobranca" {...campo('cobranca', true)} />
        </Linha>
        <Linha id="pp-assinatura" rotulo="Taxa por documento assinado (R$)">
          <input id="pp-assinatura" {...campo('assinatura', true)} />
        </Linha>
      </div>

      <div className="flex flex-col gap-(--e-3)">
        <h3 className="corpo-medio text-(--tinta)">Margens</h3>
        {baseNova ? (
          <div className="flex flex-col gap-(--e-1)">
            <CaixaSelecao
              rotulo="Confirmo que estas margens são da minha consultoria"
              checked={form.confirmadas}
              onChange={(e) => {
                const marcado = e.target.checked
                aoMudar((f) => ({ ...f, confirmadas: marcado }))
              }}
            />
          </div>
        ) : null}
        <AvisoDeMargemBaixa desejada={desejada} minima={minima} />
        <Linha id="pp-desejada" rotulo="Margem desejada (%)">
          <input id="pp-desejada" {...campo('desejada', false)} />
        </Linha>
        <Linha id="pp-minima" rotulo="Margem mínima (%)">
          <input id="pp-minima" {...campo('minima', false)} />
        </Linha>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passo 6: Resumo e publicação
// ---------------------------------------------------------------------------

function PassoDoResumo({
  rascunho,
  baseConfigurada,
  baseMudou,
  naoSalvos,
  publicando,
  aoIrPara,
  aoPublicar,
  aoRecomecar,
  aoCriarSemPreco,
}: {
  rascunho: RascunhoDaConfiguracao | null
  baseConfigurada: boolean
  baseMudou: boolean
  naoSalvos: readonly Etapa[]
  publicando: boolean
  aoIrPara: (e: Etapa) => void
  aoPublicar: () => void
  aoRecomecar: () => void
  aoCriarSemPreco: () => void
}) {
  const dados = rascunho?.dados ?? {}
  const resumo = resumoDaConfiguracao(dados)
  const pendencias = pendenciasDaConfiguracao(dados)
  const pelaEquipe = dados.equipe?.modo !== 'manual'
  const horas = dados.equipe?.modo === 'equipe' ? horasDaEquipe(dados.equipe.equipe) : null
  const pronto = rascunho !== null && pendencias.length === 0 && !baseMudou
  return (
    <div className="flex flex-col gap-(--e-4)">
      <Placar
        rotulo="Resumo da configuração"
        tamanho="compacto"
        moldura={false}
        className="border-t"
      >
        <ItemDoPlacar
          rotulo={pelaEquipe ? 'Custo médio por hora da equipe' : 'Custo da hora técnica'}
          valor={
            resumo.horaTecnicaCentavos === null
              ? 'pendente'
              : formatarReais(resumo.horaTecnicaCentavos)
          }
          apagado={resumo.horaTecnicaCentavos === null}
        />
        <ItemDoPlacar
          rotulo="Horas faturáveis por mês"
          valor={
            resumo.horasFaturaveisMes === null
              ? 'pendente'
              : `${textoDasHoras(resumo.horasFaturaveisMes)} h${horas !== null ? ', pela equipe' : ''}`
          }
          apagado={resumo.horasFaturaveisMes === null}
        />
        <ItemDoPlacar
          rotulo="Contas do mês por hora"
          valor={
            resumo.contasPorHoraCentavos === null
              ? 'pendente'
              : `${formatarReais(resumo.contasPorHoraCentavos)} por hora`
          }
          apagado={resumo.contasPorHoraCentavos === null}
        />
        <ItemDoPlacar
          rotulo="Preços cadastrados"
          valor={
            resumo.quantidadeDePrecos === 0
              ? 'nenhum'
              : resumo.quantidadeDePrecos === 1
                ? '1 linha'
                : `${String(resumo.quantidadeDePrecos)} linhas`
          }
          apagado={resumo.quantidadeDePrecos === 0}
        />
      </Placar>

      {naoSalvos.length > 0 ? (
        <MensagemSecao tom="atencao">
          {naoSalvos.length === 1 ? 'O passo' : 'Os passos'}{' '}
          {naoSalvos.map((e) => String(e)).join(', ')} {naoSalvos.length === 1 ? 'tem' : 'têm'}{' '}
          mudanças não salvas. O resumo mostra só o que foi salvo.
        </MensagemSecao>
      ) : null}

      {baseMudou ? (
        <MensagemSecao
          tom="atencao"
          acoes={
            <Botao disabled={publicando} onClick={aoRecomecar}>
              Recomeçar com os valores atuais
            </Botao>
          }
        >
          Custos e taxas foram salvos por outra pessoa depois que esta configuração começou. Para
          não sobrescrever o que ela salvou, recomece a partir dos valores atuais.
        </MensagemSecao>
      ) : null}

      {pendencias.length > 0 ? (
        <section aria-labelledby="pendencias-do-resumo" className="flex flex-col gap-(--e-2)">
          <h3 id="pendencias-do-resumo" className="corpo-medio text-(--tinta)">
            Falta configurar para calcular o preço
          </h3>
          <ul className="flex flex-col gap-(--e-15) corpo">
            {pendencias.map((p) => (
              <li key={p} className="flex flex-wrap items-center gap-(--e-15)">
                <Icone nome="circle-alert" className="text-(--tinta)" />
                <span className="corpo-medio">Falta:</span> {ROTULO_DA_PENDENCIA[p]}
                <Botao
                  aparencia="link"
                  onClick={() => {
                    aoIrPara(PASSO_DA_PENDENCIA[p] as Etapa)
                  }}
                >
                  Ir ao passo {PASSO_DA_PENDENCIA[p]}
                </Botao>
              </li>
            ))}
          </ul>
          <div>
            <Botao onClick={aoCriarSemPreco}>Criar orçamento sem preço calculado</Botao>
          </div>
        </section>
      ) : null}

      {pronto ? (
        <div className="flex flex-col gap-(--e-2) border-t pt-(--e-4)">
          <p id="aviso-publicar" className="max-w-3xl text-(--tinta)">
            {baseConfigurada
              ? 'Ao continuar, estes valores substituem os de Custos e taxas. Orçamentos em rascunho usam os valores novos ao serem salvos; propostas enviadas guardam os que usaram.'
              : 'Ao continuar, esta configuração passa a valer para o preço dos orçamentos. Depois, os ajustes ficam em Custos e taxas.'}
          </p>
          <div>
            <Botao
              aparencia="primario"
              iconeDepois="arrow-right"
              disabled={publicando}
              aria-busy={publicando || undefined}
              aria-describedby="aviso-publicar"
              onClick={aoPublicar}
            >
              {publicando
                ? 'Salvando…'
                : baseConfigurada
                  ? 'Usar estes valores e criar orçamento'
                  : 'Criar o primeiro orçamento'}
            </Botao>
          </div>
        </div>
      ) : null}
      <Link to="/configuracoes/custos" className="self-start text-xs">
        Abrir Custos e taxas
      </Link>
    </div>
  )
}
