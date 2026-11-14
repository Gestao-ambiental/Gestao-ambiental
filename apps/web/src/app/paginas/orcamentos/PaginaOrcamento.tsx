import {
  cargaDoMes,
  ESCALA_DA_QUANTIDADE,
  formatarCentavos,
  formatarDuracao,
  hojeNoFuso,
  mesesDeExecucao,
  rotuloDoMes,
  formatarPontosBase,
  formatarReais,
  lerDuracao,
  lerReais,
  MAXIMO_KM_POR_VISITA,
  MAXIMO_VISITAS,
  type PendenciaDoPreco,
  type UnidadeDeCobranca,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Trilha } from '@/components/ui/trilha'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_DO_TRATAMENTO,
  cadastrarEmpreendimentoDoProspecto,
  obterCargaDaEquipe,
  obterOrcamento,
  restaurarOrcamento,
  salvarOrcamento,
  type DadosDoRascunho,
  type FormaDePreco,
  type Orcamento,
  ROTULO_DA_SITUACAO,
  type HoraDeVenda,
  type ResponsabilidadeTecnica,
  type TratamentoDespesa,
} from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'
import { listarMembrosAtivos } from '@/lib/api/perfil'
import { mascararDocumento } from '@gestao-ambiental/domain'

import {
  calcularOrcamento,
  lerDias,
  lerEstimativa,
  lerPercentual,
  lerReaisOuZero,
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
  numeroComRevisao,
  reaisDigitados,
  textoDaQuantidade,
} from './comum'
import { AvisoDeSaida } from './AvisoDeSaida'
import { DialogoModelo, type SelecaoDoModelo } from './DialogoModelo'
import { DialogoDuplicar, DialogoSalvarModelo } from './DialogosDeCopia'
import { SituacaoDoOrcamento } from './SituacaoDoOrcamento'
import { camposDoProspecto, lerProspecto, type CamposDoProspecto } from './prospecto'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'

/** Texto longo quebra linha e o campo cresce com ele (Chromium e Safari; nos demais, rola). */
const classeTextoQueCresce = `${classeCampo} h-auto min-h-(--size-control) resize-none py-(--space-075) [field-sizing:content]`

/** Etapas do orçamento, na ordem em que ele se forma (pedido do Eduardo, 11/11/2026). */
const ETAPAS = [
  { id: 'servicos', titulo: 'Serviços' },
  { id: 'preco', titulo: 'Preço e margem' },
  { id: 'parcelas', titulo: 'Parcelas' },
] as const
type IdDaEtapa = (typeof ETAPAS)[number]['id']

/** Valor da opção "Preço digitado" na lista da tabela de preços (nunca é id de linha da tabela). */
const PRECO_DIGITADO = '__preco_digitado__'

/** Atalhos de margem, de 5 em 5 (as mais usadas); o campo aceita qualquer outra. */
const MARGENS_RAPIDAS = [10, 15, 20, 25, 30] as const

const MENSAGEM_DA_PENDENCIA: Record<PendenciaDoPreco, string> = {
  sem_itens: 'Adicione os serviços para calcular o preço.',
  sem_base: 'Custos e taxas ainda não configurados: digite o preço de cada serviço.',
  despesa_a_cotar:
    'Há despesa incluída no preço ainda a cotar: o preço fica pendente até ela ter valor.',
  percentuais_impossiveis:
    'Margem, tributos e taxas somam 100% ou mais: não há preço possível. Reduza a margem.',
  valor_invalido: 'O preço passou do limite. Confira as horas e os valores.',
  hora_sem_valor: 'Escolha um preço da tabela ou digite o preço de cada serviço.',
  quantidade_pendente:
    'Há serviço sem quantidade ou, no pacote, sem preço fechado: preencha para calcular o preço.',
}

// ---------------------------------------------------------------------------
// Rascunho da tela: números ficam como texto enquanto a pessoa digita
// ---------------------------------------------------------------------------

interface LinhaItem {
  id: string
  descricao: string
  /** Duração digitada: "1h30", "1:30", "1,5" ou "90min". */
  horas: string
  extra: string
  /** Linha da tabela de hora de venda: preço (forma "tabela") e profissão do custo. */
  horaVendaId: string
  /** Preço digitado (ADR-0023): sem linha da tabela; o preço fica em `precoFechado`. */
  digitado: boolean
  /** Membro responsável ('' = sem responsável): o custo usa a hora dele. */
  responsavelId: string
  /** Mês previsto (aaaa-mm-01; '' = sem mês). */
  mesPrevisto: string
  /** Quantidade na unidade da linha de preço (m², ha, diárias, campanhas), como digitada. */
  quantidade: string
  /** Preço fechado do pacote ou o preço digitado do serviço, como digitado. */
  precoFechado: string
  /** O serviço inclui ART ou RRT ('' = não informado). */
  responsabilidade: ResponsabilidadeTecnica | ''
}
/** Serviço novo: só nome, horas e linha da tabela (sem linha, preço digitado); o resto em branco. */
function novoItem(id: string, descricao: string, horas: string, horaVendaId: string): LinhaItem {
  return {
    id,
    descricao,
    horas,
    extra: '',
    horaVendaId,
    digitado: horaVendaId === '',
    responsavelId: '',
    mesPrevisto: '',
    quantidade: '',
    precoFechado: '',
    responsabilidade: '',
  }
}
interface LinhaDespesa {
  id: string
  descricao: string
  estimativa: string
  tratamento: TratamentoDespesa
}
interface LinhaParcela {
  id: string
  descricao: string
  dias: string
  percentual: string
}
interface Rascunho {
  objeto: string
  destinatario: string
  prazos: string
  validade: string
  premissas: string
  exclusoes: string
  /** Apresentação desta proposta; vazio = o padrão da identidade da consultoria. */
  apresentacao: string
  /** Margem sobre o preço de venda, escolhida no fim. */
  margem: string
  formaPreco: FormaDePreco
  visitas: string
  km: string
  outrosPorVisita: string
  itens: LinhaItem[]
  despesas: LinhaDespesa[]
  parcelas: LinhaParcela[]
  /** Só vale enquanto o orçamento é de prospecto. */
  prospecto: CamposDoProspecto
}

function rascunhoDe(o: Orcamento): Rascunho {
  const margem = o.margemPb ?? o.base?.margemDesejadaPb ?? null
  // Sem tabela de preços, todo serviço é de preço digitado; com ela, o que não tem linha e tem preço.
  const semTabela = (o.base?.horasVenda.length ?? 0) === 0
  const digitado = (i: Orcamento['itens'][number]) =>
    semTabela || (i.horaVendaId === null && i.precoFechadoCentavos !== null)
  return {
    objeto: o.objeto,
    destinatario: o.destinatario,
    prazos: o.prazos,
    validade: String(o.validadeDias),
    premissas: o.premissas.join('\n'),
    exclusoes: o.exclusoes.join('\n'),
    apresentacao: o.apresentacao,
    formaPreco: o.formaPreco,
    prospecto: camposDoProspecto(o.prospecto),
    margem: margem === null ? '' : textoDoPercentual(margem),
    visitas: o.visitas.quantidade ? String(o.visitas.quantidade) : '',
    km: o.visitas.kmPorVisita ? String(o.visitas.kmPorVisita) : '',
    outrosPorVisita: o.visitas.outrosPorVisitaCentavos
      ? formatarCentavos(o.visitas.outrosPorVisitaCentavos)
      : '',
    itens: o.itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      horas: i.minutos ? formatarDuracao(i.minutos) : '',
      extra: i.custoDiretoExtraCentavos ? formatarCentavos(i.custoDiretoExtraCentavos) : '',
      horaVendaId: digitado(i) ? '' : (i.horaVendaId ?? ''),
      digitado: digitado(i),
      responsavelId: i.responsavelId ?? '',
      mesPrevisto: i.mesPrevisto ?? '',
      quantidade:
        i.quantidadeDezMilesimos === null ? '' : campoDaQuantidade(i.quantidadeDezMilesimos),
      precoFechado: i.precoFechadoCentavos === null ? '' : formatarCentavos(i.precoFechadoCentavos),
      responsabilidade: i.responsabilidadeTecnica ?? '',
    })),
    despesas: o.despesas.map((d) => ({
      id: d.id,
      descricao: d.descricao,
      estimativa: d.estimativaCentavos === null ? '' : formatarCentavos(d.estimativaCentavos),
      tratamento: d.tratamento,
    })),
    parcelas: o.parcelas.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      dias: String(p.dias),
      percentual: textoDoPercentual(p.percentualPb),
    })),
  }
}

function linhasDeTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
}

/** Inteiro de 0 ao máximo; vazio é zero. `null` se não for. */
function lerInteiro(texto: string, maximo: number): number | null {
  const limpo = texto.trim()
  if (limpo === '') return 0
  if (!/^\d{1,6}$/.test(limpo)) return null
  const valor = Number(limpo)
  return valor <= maximo ? valor : null
}

function lerVisitas(r: Rascunho) {
  return {
    quantidade: lerInteiro(r.visitas, MAXIMO_VISITAS),
    kmPorVisita: lerInteiro(r.km, MAXIMO_KM_POR_VISITA),
    outrosPorVisitaCentavos: lerReaisOuZero(r.outrosPorVisita),
  }
}

/** Converte o rascunho para o formato da RPC. Devolve a primeira mensagem de erro, se houver. */
function paraSalvar(r: Rascunho, deProspecto: boolean): DadosDoRascunho | string {
  if (!r.objeto.trim()) return 'Diga o que está sendo orçado.'
  let prospecto: DadosDoRascunho['prospecto']
  if (deProspecto) {
    const lido = lerProspecto(r.prospecto)
    if ('erros' in lido) return `Prospecto: ${Object.values(lido.erros)[0] ?? 'confira os dados'}.`
    prospecto = lido.prospecto
  }
  if (r.apresentacao.trim().length > 4000) return 'Apresentação da proposta: até 4.000 caracteres.'
  const validade = Number(r.validade)
  if (!Number.isInteger(validade) || validade < 1 || validade > 365)
    return 'Validade: um número de 1 a 365 dias.'
  const margemPb = r.margem.trim() === '' ? null : lerPercentual(r.margem)
  if (r.margem.trim() !== '' && margemPb === null) return 'Margem: um percentual de 0 a 100.'
  const v = lerVisitas(r)
  if (v.quantidade === null) return `Visitas: um número de 0 a ${String(MAXIMO_VISITAS)}.`
  if (v.kmPorVisita === null)
    return `Km por visita: um número inteiro de 0 a ${String(MAXIMO_KM_POR_VISITA)}.`
  if (v.outrosPorVisitaCentavos === null) return 'Outros gastos por visita: valor inválido.'
  const itens: DadosDoRascunho['itens'] = []
  for (const [indice, i] of r.itens.entries()) {
    const minutos = lerDuracao(i.horas)
    const extra = lerReaisOuZero(i.extra)
    if (!i.descricao.trim()) return `Item ${String(indice + 1)}: informe o serviço.`
    if (minutos === null)
      return `Item ${String(indice + 1)}: horas inválidas. Use 1h30, 1:30 ou 1,5.`
    if (extra === null) return `Item ${String(indice + 1)}: valor inválido.`
    const quantidade = lerQuantidade(i.quantidade)
    const precoFechado = lerEstimativa(i.precoFechado)
    if (quantidade === undefined)
      return `Item ${String(indice + 1)}: quantidade inválida. Use até 4 casas, como 12,5.`
    if (precoFechado === undefined)
      return `Item ${String(indice + 1)}: ${i.digitado ? 'preço' : 'preço fechado'} inválido.`
    itens.push({
      id: i.id,
      descricao: i.descricao,
      minutos,
      custoDiretoExtraCentavos: extra,
      horaVendaId: i.digitado ? null : i.horaVendaId || null,
      responsavelId: i.responsavelId || null,
      mesPrevisto: i.mesPrevisto || null,
      quantidadeDezMilesimos: quantidade,
      precoFechadoCentavos: precoFechado,
      responsabilidadeTecnica: i.responsabilidade || null,
    })
  }
  const despesas: DadosDoRascunho['despesas'] = []
  for (const [indice, d] of r.despesas.entries()) {
    const estimativa = lerEstimativa(d.estimativa)
    if (!d.descricao.trim()) return `Despesa ${String(indice + 1)}: informe a despesa.`
    if (estimativa === undefined) return `Despesa ${String(indice + 1)}: valor inválido.`
    despesas.push({
      id: d.id,
      descricao: d.descricao,
      estimativaCentavos: estimativa,
      tratamento: d.tratamento,
    })
  }
  const parcelas: DadosDoRascunho['parcelas'] = []
  for (const [indice, p] of r.parcelas.entries()) {
    const percentual = lerPercentual(p.percentual)
    const dias = lerDias(p.dias)
    if (!p.descricao.trim()) return `Parcela ${String(indice + 1)}: informe o marco.`
    if (dias === null) return `Parcela ${String(indice + 1)}: dias após o marco, de 0 a 365.`
    if (percentual === null) return `Parcela ${String(indice + 1)}: percentual de 0 a 100.`
    parcelas.push({ id: p.id, descricao: p.descricao, dias, percentualPb: percentual })
  }
  return {
    objeto: r.objeto,
    destinatario: r.destinatario,
    prazos: r.prazos,
    validadeDias: validade,
    premissas: linhasDeTexto(r.premissas),
    exclusoes: linhasDeTexto(r.exclusoes),
    apresentacao: r.apresentacao.trim(),
    margemPb,
    formaPreco: r.formaPreco,
    ...(prospecto ? { prospecto } : {}),
    visitas: {
      quantidade: v.quantidade,
      kmPorVisita: v.kmPorVisita,
      outrosPorVisitaCentavos: v.outrosPorVisitaCentavos,
    },
    itens,
    despesas,
    parcelas,
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

/**
 * /orcamentos/:id (onda 5; ORC-02, ORC-03, ORC-04). Rascunho editável numa tela só, na ordem em que
 * o orçamento se forma: serviços (horas e custos), visitas técnicas, despesas de terceiros e, no
 * fim, a margem e o preço (decisão de 11/11/2026), seguidos das parcelas. Custo e margem são
 * internos e só a Gestão vê. Proposta enviada é só leitura.
 */
export function PaginaOrcamento() {
  const { atual } = useConsultoria()
  const { id = '' } = useParams()
  // O editor remonta quando chega versão nova; o aviso de sucesso mora aqui para não sumir.
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const consulta = useQuery({
    queryKey: ['orcamento', id],
    queryFn: () => obterOrcamento(id),
    enabled: atual.papel === 'gestao',
  })

  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Orçamento">
        <SemPermissao descricao="Orçamentos têm custo e margem: por enquanto, só a gestão acessa." />
      </Pagina>
    )
  }
  if (consulta.isPending) return <Carregando rotulo="Carregando orçamento" linhas={6} />
  if (consulta.isError) {
    return (
      <Pagina titulo="Orçamento">
        <EstadoErro
          titulo="Não foi possível carregar o orçamento."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      </Pagina>
    )
  }
  if (!consulta.data) {
    return (
      <Pagina titulo="Orçamento">
        <EstadoVazio
          icone="file-text"
          titulo="Orçamento não encontrado"
          descricao="Ele pode ter sido removido, ou você não tem acesso a ele."
        />
      </Pagina>
    )
  }
  // A chave remonta o editor quando outra versão chega do servidor.
  return (
    <Editor
      key={`${consulta.data.id}:${String(consulta.data.rowVersion)}`}
      orcamento={consulta.data}
      aviso={aviso}
      aoAvisar={(texto, comLinkDoEmpreendimento = false) => {
        setAviso(texto === null ? null : { texto, comLinkDoEmpreendimento })
      }}
    />
  )
}

/** Aviso de sucesso; o link do empreendimento só vale para o prospecto recém-cadastrado. */
interface Aviso {
  texto: string
  comLinkDoEmpreendimento: boolean
}

function Editor({
  orcamento,
  aviso,
  aoAvisar,
}: {
  orcamento: Orcamento
  aviso: Aviso | null
  /** comLinkDoEmpreendimento: só no aviso de prospecto que virou empreendimento. */
  aoAvisar: (texto: string | null, comLinkDoEmpreendimento?: boolean) => void
}) {
  const queryClient = useQueryClient()
  // Na lixeira, nada muda até restaurar (o banco também recusa).
  const naLixeira = orcamento.excluidoEm !== null
  const editavel = orcamento.situacao === 'rascunho' && !naLixeira
  const navegar = useNavigate()
  const base = orcamento.base
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(orcamento))
  const [alterado, setAlterado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const telaEstreita = useTelaEstreita()
  const [servicosAbertos, setServicosAbertos] = useState<Set<string>>(() => new Set())
  // Serviço novo no celular: depois que o cartão aparece, o foco vai para o nome.
  const focarServico = useRef<string | null>(null)
  useEffect(() => {
    if (!focarServico.current) return
    document.getElementById(`servico-${focarServico.current}`)?.focus()
    focarServico.current = null
  }, [r.itens])
  const [salvarModeloAberto, setSalvarModeloAberto] = useState(false)
  const [duplicarAberto, setDuplicarAberto] = useState(false)
  // A etapa fica na URL (?etapa=preco): recarregar ou voltar no navegador não perde o lugar.
  const [parametros, setParametros] = useSearchParams()
  const indiceDaUrl = ETAPAS.findIndex((e) => e.id === parametros.get('etapa'))
  const etapa = indiceDaUrl < 0 ? 0 : indiceDaUrl
  const areaDaEtapa = useRef<HTMLDivElement>(null)
  const trocouDeEtapa = useRef(false)

  function irPara(indice: number) {
    const id: IdDaEtapa = ETAPAS[indice]?.id ?? 'servicos'
    trocouDeEtapa.current = true
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        if (id === 'servicos') novos.delete('etapa')
        else novos.set('etapa', id)
        return novos
      },
      { replace: false },
    )
  }

  // Ao trocar de etapa, o foco (e a rolagem do navegador) vai para o conteúdo novo, sem ficar
  // perdido no botão que sumiu.
  useEffect(() => {
    if (!trocouDeEtapa.current) return
    trocouDeEtapa.current = false
    areaDaEtapa.current?.focus()
  }, [etapa])
  const [aplicado, setAplicado] = useState<string | null>(null)

  function mudar(alterar: (anterior: Rascunho) => Rascunho) {
    setR(alterar)
    setAlterado(true)
  }

  const margemLida = r.margem.trim() === '' ? null : lerPercentual(r.margem)
  const visitasLidas = lerVisitas(r)
  const calculo = useMemo(() => {
    const linhas = r.itens.map((i) => ({
      minutos: lerDuracao(i.horas) ?? 0,
      custoDiretoExtraCentavos: lerReaisOuZero(i.extra) ?? 0,
      horaVendaId: i.digitado ? null : i.horaVendaId || null,
      responsavelId: i.responsavelId || null,
      quantidadeDezMilesimos: lerQuantidade(i.quantidade) ?? null,
      precoFechadoCentavos: lerEstimativa(i.precoFechado) ?? null,
    }))
    const incluidas = r.despesas
      .filter((d) => d.tratamento === 'incluida')
      .map((d) => {
        const valor = lerEstimativa(d.estimativa)
        return valor === undefined ? 0 : valor
      })
    const percentuais = r.parcelas.map((p) => lerPercentual(p.percentual) ?? 0)
    return calcularOrcamento(
      linhas,
      {
        quantidade: visitasLidas.quantidade ?? 0,
        kmPorVisita: visitasLidas.kmPorVisita ?? 0,
        outrosPorVisitaCentavos: visitasLidas.outrosPorVisitaCentavos ?? 0,
      },
      incluidas,
      percentuais,
      margemLida ?? base?.margemDesejadaPb ?? 0,
      base,
      r.formaPreco,
    )
  }, [
    r.formaPreco,
    r.itens,
    r.despesas,
    r.parcelas,
    visitasLidas.quantidade,
    visitasLidas.kmPorVisita,
    visitasLidas.outrosPorVisitaCentavos,
    margemLida,
    base,
  ])

  const horas = base?.horasVenda ?? []
  // Tabela agrupada por profissão, para a lista de cada serviço. Serviço sem "Quem faz" fica no
  // grupo "Serviços", no fim.
  const horasPorProfissao = [
    ...[...new Set(horas.map((h) => h.profissao.trim()).filter((p) => p !== ''))].map(
      (profissao) => ({
        profissao,
        horas: horas.filter((h) => h.profissao.trim() === profissao),
      }),
    ),
    ...(horas.some((h) => h.profissao.trim() === '')
      ? [{ profissao: 'Serviços', horas: horas.filter((h) => h.profissao.trim() === '') }]
      : []),
  ]
  const pelaTabela = r.formaPreco === 'tabela'
  const horaPadrao = horas[0]?.id ?? ''

  // Responsável: só quem está na equipe de Custos e taxas (tem hora de custo). Nome vem dos
  // membros ativos; a carga do mês vem dos orçamentos aprovados mais este.
  const { atual } = useConsultoria()
  const membros = useQuery({
    queryKey: ['membros-ativos', atual.consultoriaId],
    queryFn: () => listarMembrosAtivos(atual.consultoriaId),
    enabled: editavel,
  })
  const carga = useQuery({
    queryKey: ['carga-da-equipe', atual.consultoriaId],
    queryFn: () => obterCargaDaEquipe(atual.consultoriaId),
    enabled: editavel,
  })
  const horaDoMembro = new Map(
    (base?.custoHoraPorMembro ?? []).map((c) => [c.membroId, c.horaCentavos]),
  )
  const responsaveis = (membros.data ?? []).filter((m) => horaDoMembro.has(m.id))
  const nomeDoMembro = new Map((membros.data ?? []).map((m) => [m.id, m.nome]))
  const meses = mesesDeExecucao(hojeNoFuso(new Date(), atual.fuso))
  const servicosDoOrcamento = r.itens.map((i) => ({
    responsavelId: i.responsavelId || null,
    mesPrevisto: i.mesPrevisto || null,
    minutos: lerDuracao(i.horas) ?? 0,
  }))

  function mudarItem(id: string, alterar: (item: LinhaItem) => LinhaItem) {
    mudar((a) => ({ ...a, itens: a.itens.map((x) => (x.id === id ? alterar(x) : x)) }))
  }
  function mudarDespesa(id: string, alterar: (d: LinhaDespesa) => LinhaDespesa) {
    mudar((a) => ({ ...a, despesas: a.despesas.map((x) => (x.id === id ? alterar(x) : x)) }))
  }
  function mudarParcela(id: string, alterar: (p: LinhaParcela) => LinhaParcela) {
    mudar((a) => ({ ...a, parcelas: a.parcelas.map((x) => (x.id === id ? alterar(x) : x)) }))
  }

  function aplicarModelo(selecao: SelecaoDoModelo) {
    mudar((a) => ({
      ...a,
      itens: [
        ...a.itens,
        ...selecao.etapas.map((e) => {
          const horasDoModelo =
            e.horasSugeridas === null ? '' : formatarDuracao(Math.round(e.horasSugeridas * 60))
          // Modelo da consultoria com preço digitado: o mesmo preço, sem linha da tabela.
          if (e.precoDigitadoCentavos != null) {
            return {
              ...novoItem(crypto.randomUUID(), e.nome, horasDoModelo, ''),
              precoFechado: formatarCentavos(e.precoDigitadoCentavos),
            }
          }
          // Modelo da consultoria: a mesma linha da tabela, se ela ainda existir.
          return novoItem(
            crypto.randomUUID(),
            e.nome,
            horasDoModelo,
            e.horaVendaId && horas.some((h) => h.id === e.horaVendaId) ? e.horaVendaId : horaPadrao,
          )
        }),
      ],
      despesas: [
        ...a.despesas,
        ...selecao.despesas.map((d) => ({
          id: crypto.randomUUID(),
          descricao: d.nome,
          estimativa: '',
          tratamento: d.tratamento ?? ('cliente_direto' as const),
        })),
      ],
      premissas: juntarLinhas(a.premissas, selecao.premissas),
      exclusoes: juntarLinhas(a.exclusoes, selecao.exclusoes),
    }))
    setAplicado(
      `Modelo "${selecao.modelo}" aplicado: ${String(selecao.etapas.length)} etapas e ${String(selecao.despesas.length)} despesas. Revise o escopo e informe as horas.`,
    )
  }

  const deProspecto = orcamento.empreendimentoId === null
  const [cadastrando, setCadastrando] = useState(false)

  async function cadastrarProspecto() {
    setFalha(null)
    setCadastrando(true)
    try {
      await cadastrarEmpreendimentoDoProspecto(orcamento.id, crypto.randomUUID())
      aoAvisar(
        `${orcamento.prospecto?.nome ?? 'O prospecto'} agora é um empreendimento cadastrado, e este orçamento está ligado a ele.`,
        true,
      )
      await queryClient.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      await queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setCadastrando(false)
    }
  }

  function campoDoProspecto(nome: keyof CamposDoProspecto) {
    return {
      value: r.prospecto[nome],
      disabled: !editavel,
      onChange: (evento: { target: { value: string } }) => {
        const valor = nome === 'cnpj' ? mascararDocumento(evento.target.value) : evento.target.value
        mudar((a) => ({ ...a, prospecto: { ...a.prospecto, [nome]: valor } }))
      },
    }
  }

  async function salvar() {
    const dados = paraSalvar(r, deProspecto)
    if (typeof dados === 'string') {
      setFalha(dados)
      return
    }
    setFalha(null)
    setSalvando(true)
    try {
      await salvarOrcamento(orcamento.id, orcamento.rowVersion, dados)
      setAlterado(false)
      await queryClient.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      await queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  const [restaurando, setRestaurando] = useState(false)
  async function restaurar() {
    setFalha(null)
    setRestaurando(true)
    try {
      await restaurarOrcamento(orcamento.id, orcamento.rowVersion)
      aoAvisar('Orçamento restaurado: voltou para a lista e pode ser editado.')
      await queryClient.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
      await queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setRestaurando(false)
    }
  }

  /** A proposta mostra o que está salvo: com mudanças pendentes, pede para salvar antes. */
  function verProposta(aparencia: 'padrao' | 'primario') {
    return (
      <Botao
        aparencia={aparencia}
        iconeAntes="eye"
        disabled={alterado}
        title={alterado ? 'Salve antes: a proposta mostra o que está salvo.' : undefined}
        onClick={() => {
          void navegar(`/orcamentos/${orcamento.id}/proposta`)
        }}
      >
        Ver proposta pronta
      </Botao>
    )
  }

  /**
   * Os campos de um serviço, usados pela tabela (notebook) e pelos cartões (celular): o mesmo
   * estado e as mesmas regras nas duas formas (ADR-0019 §4).
   */
  function camposDoItem(item: LinhaItem, indice: number) {
    const n = String(indice + 1)
    const custo = calculo.custosDosItens[indice]?.totalCentavos ?? null
    const linha = horas.find((h) => h.id === item.horaVendaId) ?? null
    const preco = calculo.pendencia === null ? (calculo.precosDosItens[indice] ?? 0) : null
    return {
      n,
      linha,
      custo,
      preco,
      rotuloDoPreco: horas.length > 0 ? 'Tabela de preços' : 'Preço digitado (R$)',
      servico: (
        <textarea
          id={`servico-${item.id}`}
          aria-label={`Serviço do item ${n}`}
          rows={1}
          className={classeTextoQueCresce}
          value={item.descricao}
          disabled={!editavel}
          onChange={(e) => {
            const valor = e.target.value
            mudarItem(item.id, (x) => ({ ...x, descricao: valor }))
          }}
        />
      ),
      art: (
        <div className="mt-(--space-050)">
          <select
            aria-label={`ART ou RRT do item ${n}`}
            className={`${classeCampo} w-full py-0 text-xs`}
            value={item.responsabilidade}
            disabled={!editavel}
            onChange={(e) => {
              const valor = e.target.value as ResponsabilidadeTecnica | ''
              mudarItem(item.id, (x) => ({ ...x, responsabilidade: valor }))
            }}
          >
            <option value="">Sem ART/RRT</option>
            <option value="art">Com ART</option>
            <option value="rrt">Com RRT</option>
          </select>
        </div>
      ),
      horas: (
        <CampoNumero
          rotulo={`Horas do item ${n}`}
          duracao
          valor={item.horas}
          placeholder="1h30"
          invalido={lerDuracao(item.horas) === null}
          desabilitado={!editavel}
          aoMudar={(valor) => {
            mudarItem(item.id, (x) => ({ ...x, horas: valor }))
          }}
        />
      ),
      tabela: (
        <div className="flex flex-col gap-(--space-050)">
          {horas.length > 0 ? (
            <select
              aria-label={`Preço do item ${n}`}
              className={classeCampo}
              value={item.digitado ? PRECO_DIGITADO : item.horaVendaId}
              disabled={!editavel}
              aria-invalid={
                (!item.digitado && !horas.some((h) => h.id === item.horaVendaId)) || undefined
              }
              onChange={(e) => {
                const valor = e.target.value
                if (valor === PRECO_DIGITADO) {
                  // O preço fechado do pacote, se havia, fica como ponto de partida.
                  mudarItem(item.id, (x) => ({
                    ...x,
                    horaVendaId: '',
                    digitado: true,
                    quantidade: '',
                  }))
                  return
                }
                const linha = horas.find((h) => h.id === valor)
                mudarItem(item.id, (x) => ({
                  ...x,
                  horaVendaId: valor,
                  digitado: false,
                  // Só fica o campo que a unidade usa; o pacote já vem
                  // com o preço da tabela, que dá para mudar.
                  quantidade:
                    linha && linha.unidade !== 'hora' && linha.unidade !== 'pacote'
                      ? x.quantidade
                      : '',
                  precoFechado:
                    linha?.unidade === 'pacote'
                      ? x.precoFechado || formatarCentavos(linha.valorCentavos)
                      : '',
                }))
              }}
            >
              {item.digitado || horas.some((h) => h.id === item.horaVendaId) ? null : (
                <option value={item.horaVendaId}>
                  {item.horaVendaId ? 'Preço que não existe mais' : 'Escolha o preço'}
                </option>
              )}
              {horasPorProfissao.map((grupo) => (
                <optgroup key={grupo.profissao} label={grupo.profissao}>
                  {grupo.horas.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.atividade} ·{' '}
                      {h.unidade === 'pacote'
                        ? `pacote ${formatarCentavos(h.valorCentavos)}`
                        : h.faixas.length > 0
                          ? `preço por faixas${SUFIXO_DA_UNIDADE[h.unidade]}`
                          : `${formatarCentavos(h.valorCentavos)}${SUFIXO_DA_UNIDADE[h.unidade]}`}
                      {h.minimoCentavos !== null
                        ? ` · mínimo ${formatarCentavos(h.minimoCentavos)}`
                        : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={PRECO_DIGITADO}>Preço digitado</option>
            </select>
          ) : null}
          {item.digitado ? (
            <CampoNumero
              rotulo={`Preço digitado do item ${n}`}
              reais
              milhar
              valor={item.precoFechado}
              placeholder="0,00"
              invalido={
                item.precoFechado.trim() === '' || lerEstimativa(item.precoFechado) === undefined
              }
              desabilitado={!editavel}
              aoMudar={(valor) => {
                mudarItem(item.id, (x) => ({ ...x, precoFechado: valor }))
              }}
            />
          ) : (
            <CampoDaUnidade
              n={n}
              linha={linha}
              item={item}
              desabilitado={!editavel}
              aoMudar={(alterar) => {
                mudarItem(item.id, alterar)
              }}
            />
          )}
        </div>
      ),
      responsavel: (
        <CelulaResponsavel
          n={n}
          valor={item.responsavelId}
          opcoes={responsaveis.map((m) => ({
            id: m.id,
            rotulo: `${m.nome} · ${formatarCentavos(horaDoMembro.get(m.id) ?? 0)}/h`,
          }))}
          nomeDoValor={nomeDoMembro.get(item.responsavelId) ?? null}
          carregando={membros.isPending && editavel}
          desabilitado={!editavel}
          carga={
            editavel && item.responsavelId && item.mesPrevisto && carga.data
              ? cargaDoMes(
                  item.responsavelId,
                  item.mesPrevisto,
                  carga.data.jornada,
                  carga.data.comprometido,
                  servicosDoOrcamento,
                )
              : null
          }
          mes={item.mesPrevisto}
          aoMudar={(valor) => {
            mudarItem(item.id, (x) => ({ ...x, responsavelId: valor }))
          }}
        />
      ),
      mes: (
        <select
          aria-label={`Mês previsto do item ${n}`}
          className={classeCampo}
          value={item.mesPrevisto}
          disabled={!editavel}
          onChange={(e) => {
            const valor = e.target.value
            mudarItem(item.id, (x) => ({ ...x, mesPrevisto: valor }))
          }}
        >
          <option value="">Sem mês</option>
          {item.mesPrevisto && !meses.includes(item.mesPrevisto as never) ? (
            <option value={item.mesPrevisto}>{rotuloDoMes(item.mesPrevisto)}</option>
          ) : null}
          {meses.map((m) => (
            <option key={m} value={m}>
              {rotuloDoMes(m)}
            </option>
          ))}
        </select>
      ),
      outros: (
        <CampoNumero
          rotulo={`Outros custos do item ${n}`}
          reais
          valor={item.extra}
          invalido={lerReaisOuZero(item.extra) === null}
          desabilitado={!editavel}
          aoMudar={(valor) => {
            mudarItem(item.id, (x) => ({ ...x, extra: valor }))
          }}
        />
      ),
      remover: () => {
        mudar((a) => ({
          ...a,
          itens: a.itens.filter((x) => x.id !== item.id),
        }))
      },
    }
  }

  const precoTotal = calculo.precoTotalCentavos
  const quantidadeDeVisitas = visitasLidas.quantidade ?? 0
  // Modo da visita copiado da base: por visita, o km não entra (e o campo some); por km, o valor
  // fixo da visita não entra. Sem modo (orçamento antigo), os dois, como na época.
  const modoDasVisitas = base?.deslocamentoModo ?? null
  const temVisitas = calculo.valorVisitasCentavos > 0
  const d = calculo.divisao
  const temDigitado = r.itens.some((i) => i.digitado && i.precoFechado.trim() !== '')

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Link to="/orcamentos" className="text-xs text-(--text-subtle) no-underline hover:underline">
        Orçamentos
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-(--space-150)">
        <div className="flex flex-col gap-(--space-050)">
          <Pagina titulo={orcamento.empreendimentoNome}>{null}</Pagina>
          <p className="flex flex-wrap items-center gap-(--space-100) text-(--text-subtle)">
            <span className="tabular-nums">
              {numeroComRevisao(orcamento.ano, orcamento.sequencia, orcamento.revisao)}
            </span>
            <SeloSituacaoOrcamento situacao={orcamento.situacao} />
            {deProspecto ? <Selo tom="revisao">Prospecto</Selo> : null}
            {orcamento.duplicadoDe ? (
              <span>
                Cópia de{' '}
                <Link to={`/orcamentos/${orcamento.duplicadoDe.id}`} className="tabular-nums">
                  {numeroComRevisao(
                    orcamento.duplicadoDe.ano,
                    orcamento.duplicadoDe.sequencia,
                    orcamento.duplicadoDe.revisao,
                  )}
                </Link>
              </span>
            ) : null}
            {alterado ? <span>Alterações não salvas</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-(--space-100)">
          {naLixeira ? null : (
            <>
              <Botao
                iconeAntes="copy"
                disabled={alterado}
                title={alterado ? 'Salve antes: a cópia parte do que está salvo.' : undefined}
                onClick={() => {
                  setDuplicarAberto(true)
                }}
              >
                Duplicar
              </Botao>
              <Botao
                iconeAntes="star"
                disabled={alterado}
                title={alterado ? 'Salve antes: o modelo parte do que está salvo.' : undefined}
                onClick={() => {
                  setSalvarModeloAberto(true)
                }}
              >
                Salvar como modelo
              </Botao>
            </>
          )}
          {verProposta('padrao')}
          {editavel ? (
            <Botao
              aparencia="primario"
              disabled={salvando || !alterado}
              aria-busy={salvando || undefined}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          ) : null}
        </div>
      </div>

      {naLixeira ? null : (
        <SituacaoDoOrcamento
          orcamento={orcamento}
          alterado={alterado}
          fuso={atual.fuso}
          aoMudar={(para) => {
            aoAvisar(`Situação: ${ROTULO_DA_SITUACAO[para]}.`)
            void queryClient.invalidateQueries({ queryKey: ['orcamento', orcamento.id] })
            void queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
            void queryClient.invalidateQueries({ queryKey: ['carga-da-equipe'] })
          }}
        />
      )}

      {naLixeira ? (
        <MensagemSecao tom="atencao">
          <span className="flex flex-wrap items-center justify-between gap-(--space-100)">
            <span>Este orçamento está na lixeira. Nada muda até ele ser restaurado.</span>
            <Botao
              tamanho="compacto"
              disabled={restaurando}
              aria-busy={restaurando || undefined}
              onClick={() => void restaurar()}
            >
              {restaurando ? 'Restaurando…' : 'Restaurar'}
            </Botao>
          </span>
        </MensagemSecao>
      ) : null}

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso.texto}{' '}
          {aviso.comLinkDoEmpreendimento && orcamento.empreendimentoId ? (
            <Link to={`/empreendimentos/${orcamento.empreendimentoId}`}>Abrir empreendimento</Link>
          ) : null}
        </MensagemSecao>
      ) : null}
      {!editavel ? (
        <MensagemSecao tom="informacao">
          Proposta enviada não é editada no lugar. Mudanças viram uma nova revisão.
        </MensagemSecao>
      ) : null}

      <Trilha
        rotulo="Etapas do orçamento"
        atual={etapa}
        aoEscolher={irPara}
        passos={ETAPAS.map((e) => ({
          id: e.id,
          titulo: e.titulo,
          detalhe:
            e.id === 'servicos'
              ? `${String(r.itens.length)} ${r.itens.length === 1 ? 'serviço' : 'serviços'}`
              : e.id === 'preco'
                ? precoTotal === null
                  ? 'preço pendente'
                  : formatarReais(precoTotal)
                : `${String(r.parcelas.length)} ${r.parcelas.length === 1 ? 'parcela' : 'parcelas'}`,
        }))}
      />

      <div
        ref={areaDaEtapa}
        role="group"
        tabIndex={-1}
        aria-label={`Etapa ${String(etapa + 1)} de ${String(ETAPAS.length)}: ${ETAPAS[etapa]?.titulo ?? ''}`}
        className="scroll-mt-(--space-200) overflow-hidden rounded-(--radius-large) border bg-(--surface) shadow-cartao outline-none"
      >
        {/* Números principais: custo e preço. A margem se escolhe na etapa 2. */}
        <div className="grid gap-(--space-200) border-b p-(--space-200) sm:grid-cols-2">
          <Numero rotulo="Custo do orçamento">
            {calculo.custoTotalCentavos === null ? (
              <span className="text-(--text-subtle)">{base ? 'pendente' : 'não calculado'}</span>
            ) : (
              formatarReais(calculo.custoTotalCentavos)
            )}
          </Numero>
          <Numero
            rotulo="Preço"
            apoio={
              precoTotal === null || !base
                ? undefined
                : pelaTabela
                  ? `pela tabela · sobra ${formatarPontosBase(calculo.margemResultantePb ?? 0)}`
                  : `com acréscimo de ${formatarPontosBase(calculo.margemPb)} sobre horas de venda e contas`
            }
          >
            {precoTotal === null ? (
              <span className="text-(--text-subtle)">pendente</span>
            ) : (
              formatarReais(precoTotal)
            )}
          </Numero>
        </div>

        {calculo.pendencia && calculo.pendencia !== 'sem_itens' ? (
          <div className="border-b p-(--space-200)">
            <MensagemSecao tom="atencao">
              {MENSAGEM_DA_PENDENCIA[calculo.pendencia]}
              {calculo.pendencia === 'sem_base' ? (
                <>
                  {' '}
                  <Link to="/configuracoes/custos">Configurar custos e taxas</Link>
                </>
              ) : null}
            </MensagemSecao>
          </div>
        ) : null}

        {etapa === 0 ? (
          <>
            {deProspecto ? (
              <Secao
                titulo="Prospecto"
                acoes={
                  <Botao
                    tamanho="compacto"
                    iconeAntes="folder-plus"
                    disabled={alterado || cadastrando}
                    aria-busy={cadastrando || undefined}
                    onClick={() => void cadastrarProspecto()}
                  >
                    {cadastrando ? 'Cadastrando…' : 'Cadastrar como empreendimento'}
                  </Botao>
                }
              >
                <div className="flex flex-col gap-(--space-150) px-(--space-150) pb-(--space-150)">
                  <p className="text-xs text-(--text-subtle)">
                    {alterado
                      ? 'Salve as alterações antes de cadastrar o prospecto.'
                      : 'Quem pediu o orçamento ainda não está cadastrado. Ao cadastrar, um CNPJ ou CPF que já existe é ligado ao empreendimento existente, sem duplicar.'}
                  </p>
                  <div className="grid gap-(--space-150) sm:grid-cols-2 lg:grid-cols-3">
                    <CampoTexto
                      rotulo="Nome da empresa ou do cliente"
                      required
                      {...campoDoProspecto('nome')}
                    />
                    <CampoTexto
                      rotulo="CNPJ ou CPF"
                      ajuda="Opcional"
                      {...campoDoProspecto('cnpj')}
                    />
                    <CampoTexto
                      rotulo="Contato"
                      ajuda="Opcional"
                      {...campoDoProspecto('contato')}
                    />
                    <CampoTexto
                      rotulo="E-mail"
                      type="email"
                      ajuda="Opcional"
                      {...campoDoProspecto('email')}
                    />
                    <CampoTexto
                      rotulo="Telefone"
                      type="tel"
                      ajuda="Opcional"
                      {...campoDoProspecto('telefone')}
                    />
                  </div>
                </div>
              </Secao>
            ) : null}
            {/* Serviços */}
            <Secao
              titulo="Serviços"
              acoes={
                editavel ? (
                  <Botao
                    tamanho="compacto"
                    iconeAntes="list"
                    onClick={() => {
                      setCatalogoAberto(true)
                    }}
                  >
                    Escolher modelo
                  </Botao>
                ) : null
              }
            >
              {aplicado ? (
                <div className="px-(--space-150) pb-(--space-100)">
                  <MensagemSecao role="status" tom="sucesso">
                    {aplicado}
                  </MensagemSecao>
                </div>
              ) : null}
              {telaEstreita ? (
                <ServicosEmCartoes
                  itens={r.itens}
                  camposDoItem={camposDoItem}
                  editavel={editavel}
                  abertos={servicosAbertos}
                  aoAlternar={(id) => {
                    setServicosAbertos((a) => {
                      const novo = new Set(a)
                      if (novo.has(id)) novo.delete(id)
                      else novo.add(id)
                      return novo
                    })
                  }}
                />
              ) : (
                /* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse corpo">
                    <thead>
                      <tr>
                        <th scope="col" className={`${classeCabecalho} min-w-56`}>
                          Serviço
                        </th>
                        <th scope="col" className={`${classeCabecalho} w-20 text-right`}>
                          Horas
                        </th>
                        <th scope="col" className={`${classeCabecalho} w-44`}>
                          {horas.length > 0 ? 'Tabela de preços' : 'Preço digitado (R$)'}
                        </th>
                        <th scope="col" className={`${classeCabecalho} w-44`}>
                          Responsável
                        </th>
                        <th scope="col" className={`${classeCabecalho} w-36`}>
                          Mês
                        </th>
                        <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                          Custo (R$)
                        </th>
                        {pelaTabela ? (
                          <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                            Preço (R$)
                          </th>
                        ) : null}
                        {editavel ? (
                          <th scope="col" className={`${classeCabecalho} w-12`}>
                            <span className="sr-only">Remover</span>
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {r.itens.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7 + (pelaTabela ? 1 : 0)}
                            className={`${classeCelula} text-(--text-subtle)`}
                          >
                            Nenhum serviço ainda. Escolha um modelo ou adicione os itens.
                          </td>
                        </tr>
                      ) : null}
                      {r.itens.map((item, indice) => {
                        const campos = camposDoItem(item, indice)
                        return (
                          <tr key={item.id}>
                            <td className={classeCelula}>
                              {campos.servico}
                              {/* Notebook: outros custos e ART/RRT recolhidos, para o nome e o mês
                                  terem espaço; o resumo diz o que há dentro (ADR-0019 §3). */}
                              <details className="mt-(--space-050)">
                                <summary className="cursor-pointer text-xs text-(--text-subtle)">
                                  {resumoDosDetalhes(item)}{' '}
                                  <span className="sr-only">do item {campos.n}</span>
                                </summary>
                                <div className="mt-(--space-075) flex flex-col gap-(--space-100)">
                                  <CampoDoCartao rotulo="Outros custos (R$)">
                                    {campos.outros}
                                  </CampoDoCartao>
                                  <CampoDoCartao rotulo="ART/RRT">{campos.art}</CampoDoCartao>
                                </div>
                              </details>
                            </td>
                            <td className={classeCelula}>{campos.horas}</td>
                            <td className={classeCelula}>{campos.tabela}</td>
                            <td className={classeCelula}>{campos.responsavel}</td>
                            <td className={classeCelula}>{campos.mes}</td>
                            <td className={`${classeCelula} text-right tabular-nums`}>
                              {campos.custo === null ? (
                                <span className="text-(--text-subtle)">—</span>
                              ) : (
                                formatarCentavos(campos.custo)
                              )}
                            </td>
                            {pelaTabela ? (
                              <td className={`${classeCelula} text-right tabular-nums`}>
                                {campos.preco === null ? (
                                  <span className="text-(--text-subtle)">—</span>
                                ) : (
                                  formatarCentavos(campos.preco)
                                )}
                              </td>
                            ) : null}
                            {editavel ? (
                              <td className={classeCelula}>
                                <BotaoIcone
                                  icone="trash-2"
                                  rotulo={`Remover item ${campos.n}`}
                                  onClick={campos.remover}
                                />
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
                {editavel ? (
                  <Botao
                    aparencia="link"
                    iconeAntes="plus"
                    onClick={() => {
                      const novoId = crypto.randomUUID()
                      if (telaEstreita) {
                        setServicosAbertos((a) => new Set(a).add(novoId))
                        focarServico.current = novoId
                      }
                      mudar((a) => ({
                        ...a,
                        itens: [...a.itens, novoItem(novoId, '', '', horaPadrao)],
                      }))
                    }}
                  >
                    Adicionar item
                  </Botao>
                ) : (
                  <span />
                )}
                <p className="text-xs text-(--text-subtle)">
                  Custo = horas × hora do responsável (sem responsável, a da profissão ou a média) +
                  outros custos + contas da consultoria pelas horas.
                </p>
              </div>
            </Secao>

            {/* Visitas técnicas */}
            <Secao titulo="Visitas técnicas">
              <div className="flex flex-col gap-(--space-150) px-(--space-150) pb-(--space-150)">
                <div className="grid gap-(--space-150) sm:grid-cols-3">
                  <CampoRotulado id="visitas-quantidade" rotulo="Quantidade de visitas">
                    <input
                      id="visitas-quantidade"
                      inputMode="numeric"
                      placeholder="0"
                      aria-invalid={visitasLidas.quantidade === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={r.visitas}
                      disabled={!editavel}
                      onChange={(e) => {
                        const valor = e.target.value
                        mudar((a) => ({ ...a, visitas: valor }))
                      }}
                    />
                  </CampoRotulado>
                  {!base || modoDasVisitas === 'visita' ? null : (
                    <CampoRotulado id="visitas-km" rotulo="Km por visita, ida e volta">
                      <input
                        id="visitas-km"
                        inputMode="numeric"
                        placeholder="0"
                        aria-invalid={visitasLidas.kmPorVisita === null || undefined}
                        className={`${classeCampo} text-right tabular-nums`}
                        value={r.km}
                        disabled={!editavel}
                        onChange={(e) => {
                          const valor = e.target.value
                          mudar((a) => ({ ...a, km: valor }))
                        }}
                      />
                    </CampoRotulado>
                  )}
                  {/* Sem custos e taxas, o valor de cada visita é digitado aqui (ADR-0023). */}
                  <CampoRotulado
                    id="visitas-outros"
                    rotulo={base ? 'Outros gastos por visita (R$)' : 'Valor de cada visita (R$)'}
                    apoio={base ? 'Pedágio, estacionamento, alimentação' : undefined}
                  >
                    <CampoNumero
                      id="visitas-outros"
                      reais
                      milhar={!base}
                      valor={r.outrosPorVisita}
                      placeholder="0,00"
                      invalido={visitasLidas.outrosPorVisitaCentavos === null}
                      desabilitado={!editavel}
                      aoMudar={(valor) => {
                        mudar((a) => ({ ...a, outrosPorVisita: valor }))
                      }}
                    />
                  </CampoRotulado>
                </div>
                {base ? (
                  <p className="text-xs text-(--text-subtle)">
                    Cada visita:{' '}
                    {modoDasVisitas === 'km'
                      ? `km × ${formatarReais(base.custoKmCentavos)}`
                      : modoDasVisitas === 'visita'
                        ? formatarReais(base.valorVisitaCentavos)
                        : `${formatarReais(base.valorVisitaCentavos)}${
                            base.custoKmCentavos > 0
                              ? ` + km × ${formatarReais(base.custoKmCentavos)}`
                              : ''
                          }`}{' '}
                    + outros gastos. Preço fixo, sem margem.{' '}
                    {quantidadeDeVisitas > 0 ? (
                      <span className="corpo-medio text-(--text)">
                        Valor das visitas: {formatarReais(calculo.valorVisitasCentavos)}
                      </span>
                    ) : (
                      'Sem visitas, nada entra no preço.'
                    )}{' '}
                    {(modoDasVisitas === 'km' && base.custoKmCentavos === 0) ||
                    (modoDasVisitas === 'visita' && base.valorVisitaCentavos === 0) ||
                    (modoDasVisitas === null &&
                      base.valorVisitaCentavos === 0 &&
                      base.custoKmCentavos === 0) ? (
                      <Link to="/configuracoes/custos">
                        {modoDasVisitas === 'km'
                          ? 'Cadastrar o valor do km'
                          : modoDasVisitas === 'visita'
                            ? 'Cadastrar o valor da visita'
                            : 'Cadastrar o valor da visita e do km'}
                      </Link>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </Secao>

            {/* Despesas de terceiros */}
            <Secao titulo="Despesas de terceiros">
              {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse corpo">
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        Despesa
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-64`}>
                        Como é paga
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                        Estimativa (R$)
                      </th>
                      {editavel ? (
                        <th scope="col" className={`${classeCabecalho} w-12`}>
                          <span className="sr-only">Remover</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {r.despesas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={`${classeCelula} text-(--text-subtle)`}>
                          Nenhuma despesa de terceiros.
                        </td>
                      </tr>
                    ) : null}
                    {r.despesas.map((despesa, indice) => {
                      const n = String(indice + 1)
                      return (
                        <tr key={despesa.id}>
                          <td className={classeCelula}>
                            <textarea
                              aria-label={`Despesa ${n}`}
                              rows={1}
                              className={classeTextoQueCresce}
                              value={despesa.descricao}
                              disabled={!editavel}
                              onChange={(e) => {
                                const valor = e.target.value
                                mudarDespesa(despesa.id, (x) => ({ ...x, descricao: valor }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <select
                              aria-label={`Como é paga a despesa ${n}`}
                              className={classeCampo}
                              value={despesa.tratamento}
                              disabled={!editavel}
                              onChange={(e) => {
                                const valor = e.target.value as TratamentoDespesa
                                mudarDespesa(despesa.id, (x) => ({ ...x, tratamento: valor }))
                              }}
                            >
                              {(Object.keys(ROTULO_DO_TRATAMENTO) as TratamentoDespesa[]).map(
                                (t) => (
                                  <option key={t} value={t}>
                                    {ROTULO_DO_TRATAMENTO[t]}
                                  </option>
                                ),
                              )}
                            </select>
                          </td>
                          <td className={classeCelula}>
                            <CampoNumero
                              rotulo={`Estimativa da despesa ${n}`}
                              reais
                              valor={despesa.estimativa}
                              placeholder="A cotar"
                              invalido={lerEstimativa(despesa.estimativa) === undefined}
                              desabilitado={!editavel}
                              aoMudar={(valor) => {
                                mudarDespesa(despesa.id, (x) => ({ ...x, estimativa: valor }))
                              }}
                            />
                          </td>
                          {editavel ? (
                            <td className={classeCelula}>
                              <BotaoIcone
                                icone="trash-2"
                                rotulo={`Remover despesa ${n}`}
                                onClick={() => {
                                  mudar((a) => ({
                                    ...a,
                                    despesas: a.despesas.filter((x) => x.id !== despesa.id),
                                  }))
                                }}
                              />
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {editavel ? (
                <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
                  <Botao
                    aparencia="link"
                    iconeAntes="plus"
                    onClick={() => {
                      mudar((a) => ({
                        ...a,
                        despesas: [
                          ...a.despesas,
                          {
                            id: crypto.randomUUID(),
                            descricao: '',
                            estimativa: '',
                            tratamento: 'cliente_direto',
                          },
                        ],
                      }))
                    }}
                  >
                    Adicionar despesa
                  </Botao>
                  <p className="text-xs text-(--text-subtle)">
                    Sem valor ainda? Deixe a estimativa em branco: ela fica a cotar.
                  </p>
                </div>
              ) : null}
            </Secao>
          </>
        ) : null}

        {etapa === 1 ? (
          <>
            {/* Preço e margem: a margem entra só aqui, depois dos serviços */}
            <Secao titulo="Preço e margem">
              <div className="flex flex-col gap-(--space-200) px-(--space-150) pb-(--space-200)">
                {base ? (
                  <>
                    <fieldset className="flex flex-col gap-(--space-100)">
                      <legend className="mb-(--space-050) rotulo">Como o preço é formado</legend>
                      <div className="grid gap-(--space-100) sm:grid-cols-2">
                        <OpcaoRadio
                          name="forma-de-preco"
                          rotulo="Pela tabela (hora de venda)"
                          descricao="Horas × hora de venda do nível. A margem é o que sobra."
                          checked={pelaTabela}
                          disabled={!editavel}
                          onChange={() => {
                            mudar((a) => ({
                              ...a,
                              formaPreco: 'tabela',
                              itens: a.itens.map((x) =>
                                x.horaVendaId || x.digitado ? x : { ...x, horaVendaId: horaPadrao },
                              ),
                            }))
                          }}
                        />
                        <OpcaoRadio
                          name="forma-de-preco"
                          rotulo="Pela margem"
                          descricao="Acréscimo sobre as horas de venda e as contas da consultoria."
                          checked={!pelaTabela}
                          disabled={!editavel}
                          onChange={() => {
                            mudar((a) => ({ ...a, formaPreco: 'margem' }))
                          }}
                        />
                      </div>
                    </fieldset>
                    {horas.length === 0 ? (
                      <MensagemSecao tom="atencao">
                        Nenhuma hora de venda cadastrada.{' '}
                        <Link to="/configuracoes/custos">Cadastrar em Custos e taxas</Link>
                      </MensagemSecao>
                    ) : null}
                    {pelaTabela ? (
                      <p className="corpo">
                        Margem que sobra:{' '}
                        <span className="corpo-medio tabular-nums">
                          {calculo.margemResultantePb === null
                            ? 'pendente'
                            : formatarPontosBase(calculo.margemResultantePb)}
                        </span>
                        <span className="text-(--text-subtle)">
                          {' '}
                          · mínima {formatarPontosBase(base.margemMinimaPb)}
                        </span>
                      </p>
                    ) : (
                      <CampoRotulado
                        id="orcamento-margem"
                        rotulo="Acréscimo sobre horas de venda e contas (%)"
                        apoio={`Sobre as horas de venda e as contas · referência ${formatarPontosBase(base.margemDesejadaPb)} · mínima ${formatarPontosBase(base.margemMinimaPb)}`}
                      >
                        <div className="flex flex-wrap items-center gap-(--space-100)">
                          <input
                            id="orcamento-margem"
                            inputMode="decimal"
                            aria-invalid={
                              (r.margem.trim() !== '' && margemLida === null) || undefined
                            }
                            className={`${classeCampo} max-w-24 text-right tabular-nums`}
                            value={r.margem}
                            disabled={!editavel}
                            onChange={(e) => {
                              const valor = e.target.value
                              mudar((a) => ({ ...a, margem: valor }))
                            }}
                          />
                          <div
                            role="group"
                            aria-label="Margens mais usadas"
                            className="flex flex-wrap gap-(--space-050)"
                          >
                            {MARGENS_RAPIDAS.map((m) => (
                              <Botao
                                key={m}
                                tamanho="compacto"
                                selecionado={margemLida === m * 100}
                                aria-pressed={margemLida === m * 100}
                                disabled={!editavel}
                                onClick={() => {
                                  mudar((a) => ({ ...a, margem: String(m) }))
                                }}
                              >
                                {m}%
                              </Botao>
                            ))}
                          </div>
                        </div>
                      </CampoRotulado>
                    )}
                  </>
                ) : null}
                {base && !pelaTabela && temDigitado ? (
                  <p className="corpo">
                    Margem que sobra:{' '}
                    <span className="corpo-medio tabular-nums">
                      {calculo.margemResultantePb === null
                        ? 'pendente'
                        : formatarPontosBase(calculo.margemResultantePb)}
                    </span>
                  </p>
                ) : null}
                {d && d.lucroCentavos < 0 ? (
                  <MensagemSecao role="status" tom="perigo">
                    O preço não cobre o custo: faltam {formatarReais(-d.lucroCentavos)}.
                  </MensagemSecao>
                ) : calculo.situacaoDaMargem === 'abaixo_da_minima' ? (
                  <MensagemSecao role="status" tom="perigo">
                    A margem está abaixo da mínima da consultoria (
                    {base ? formatarPontosBase(base.margemMinimaPb) : ''}).
                  </MensagemSecao>
                ) : null}

                {!base ? (
                  <PrecoSemConfiguracao
                    itens={r.itens.map((item, indice) => ({
                      id: item.id,
                      rotulo: item.descricao || `Item ${String(indice + 1)}`,
                      precoCentavos: calculo.precosDosItens[indice] ?? 0,
                    }))}
                    visitas={
                      temVisitas
                        ? {
                            rotulo: `Visitas técnicas (${String(quantidadeDeVisitas)})`,
                            precoCentavos: calculo.precoVisitasCentavos,
                          }
                        : null
                    }
                    precoTotal={precoTotal}
                    pendencia={calculo.pendencia ? MENSAGEM_DA_PENDENCIA[calculo.pendencia] : null}
                  />
                ) : d && precoTotal !== null ? (
                  <div className="grid gap-(--space-300) lg:grid-cols-2">
                    {!pelaTabela ? (
                      <p className="corpo lg:col-span-2">
                        Sobre o que incide o acréscimo: {formatarReais(d.horasDeVendaCentavos)} da
                        venda dos serviços +{' '}
                        {formatarReais(d.baseDoAcrescimoCentavos - d.horasDeVendaCentavos)} das
                        contas da consultoria = {formatarReais(d.baseDoAcrescimoCentavos)}.
                        {d.precosFechadosCentavos > 0
                          ? ` Pacotes (${formatarReais(d.precosFechadosCentavos)}) têm preço fechado e ficam fora do acréscimo.`
                          : ''}
                        <span className="mt-(--space-050) block text-(--text-subtle)">
                          Exemplo fictício: base R$ 1.000, acréscimo de 20% = R$ 200, preço R$ 1.200
                          antes de tributos e taxas. É acréscimo sobre a base, não margem de 20%
                          sobre a venda.
                        </span>
                      </p>
                    ) : null}
                    <section aria-label="Divisão do valor">
                      <h3 className="mb-(--space-100) corpo-medio">Divisão do valor</h3>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
                        <Valor rotulo="Custo da equipe (horas × custo por hora)">
                          {d.trabalhoTecnicoCentavos}
                        </Valor>
                        {d.outrosCustosDiretosCentavos > 0 ? (
                          <Valor rotulo="Outros custos dos serviços">
                            {d.outrosCustosDiretosCentavos}
                          </Valor>
                        ) : null}
                        <Valor rotulo="Contas da consultoria (rateio pelas horas)">
                          {d.contasDaConsultoriaCentavos}
                        </Valor>
                        {d.visitasCentavos > 0 ? (
                          <Valor rotulo="Visitas técnicas (preço fixo, sem margem)">
                            {d.visitasCentavos}
                          </Valor>
                        ) : null}
                        {d.despesasIncluidasCentavos > 0 ? (
                          <Valor rotulo="Despesas incluídas no preço">
                            {d.despesasIncluidasCentavos}
                          </Valor>
                        ) : null}
                        <Valor rotulo="Tributos sobre o faturamento">{d.tributosCentavos}</Valor>
                        <Valor rotulo="Taxas de cobrança e assinatura">{d.taxasCentavos}</Valor>
                        <Valor rotulo="Lucro estimado" destaque>
                          {d.lucroCentavos}
                        </Valor>
                        <dt className="border-t pt-(--space-075) corpo-medio">Preço</dt>
                        <dd className="border-t pt-(--space-075) text-right corpo-medio tabular-nums">
                          {formatarReais(precoTotal)}
                        </dd>
                      </dl>
                    </section>

                    <section aria-label="Contas da consultoria neste orçamento">
                      <h3 className="mb-(--space-025) corpo-medio">
                        Contas da consultoria neste orçamento
                      </h3>
                      <p className="mb-(--space-100) text-xs text-(--text-subtle)">
                        Quanto este orçamento cobre de cada conta do mês, pelas horas estimadas.
                      </p>
                      {calculo.contas.length === 0 ? (
                        <p className="text-(--text-subtle)">
                          Nenhuma conta do mês cadastrada.{' '}
                          <Link to="/configuracoes/custos">Detalhar contas em Custos e taxas</Link>
                        </p>
                      ) : (
                        <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
                          {calculo.contas.map((conta) => (
                            <Valor key={conta.descricao} rotulo={conta.descricao}>
                              {conta.valorCentavos}
                            </Valor>
                          ))}
                        </dl>
                      )}
                    </section>

                    <section aria-label="Preço na proposta" className="lg:col-span-2">
                      <h3 className="mb-(--space-025) corpo-medio">Preço na proposta</h3>
                      <p className="mb-(--space-100) text-xs text-(--text-subtle)">
                        O preço é repartido entre os serviços proporcionalmente às horas de venda,
                        contas e outros custos. Custo e margem não aparecem para o cliente.
                      </p>
                      <dl className="grid max-w-2xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
                        {r.itens.map((item, indice) => (
                          <Valor
                            key={item.id}
                            rotulo={item.descricao || `Item ${String(indice + 1)}`}
                          >
                            {calculo.precosDosItens[indice] ?? 0}
                          </Valor>
                        ))}
                        {temVisitas ? (
                          <Valor
                            rotulo={`Visitas técnicas (${String(quantidadeDeVisitas)}) e deslocamento`}
                          >
                            {calculo.precoVisitasCentavos}
                          </Valor>
                        ) : null}
                      </dl>
                    </section>
                  </div>
                ) : (
                  <p className="text-(--text-subtle)">
                    {calculo.pendencia ? MENSAGEM_DA_PENDENCIA[calculo.pendencia] : null}
                  </p>
                )}
              </div>
            </Secao>

            {base ? (
              <Recolhido
                titulo="Como o preço é calculado"
                resumo={
                  pelaTabela
                    ? 'horas de venda + outros custos e despesas'
                    : 'horas de venda + contas + acréscimo + despesas e taxas'
                }
              >
                <ComoOPrecoECalculado
                  base={base}
                  fixos={calculo.fixosPorCobrancaCentavos}
                  pelaTabela={pelaTabela}
                />
              </Recolhido>
            ) : null}
          </>
        ) : null}

        {etapa === 2 ? (
          <>
            {/* Parcelas */}
            <Secao titulo="Parcelas">
              {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse corpo">
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        Marco
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                        Dias após
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                        %
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                        Valor (R$)
                      </th>
                      {editavel ? (
                        <th scope="col" className={`${classeCabecalho} w-12`}>
                          <span className="sr-only">Remover</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {r.parcelas.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${classeCelula} text-(--text-subtle)`}>
                          Nenhuma parcela. Adicione ao menos uma antes de enviar.
                        </td>
                      </tr>
                    ) : null}
                    {r.parcelas.map((p, indice) => {
                      const n = String(indice + 1)
                      const valor = calculo.parcelasCentavos[indice]
                      return (
                        <tr key={p.id}>
                          <td className={classeCelula}>
                            <input
                              aria-label={`Marco da parcela ${n}`}
                              placeholder="Ex.: Assinatura do contrato"
                              className={classeCampo}
                              value={p.descricao}
                              disabled={!editavel}
                              onChange={(e) => {
                                const texto = e.target.value
                                mudarParcela(p.id, (x) => ({ ...x, descricao: texto }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <CampoNumero
                              rotulo={`Dias após o marco da parcela ${n}`}
                              valor={p.dias}
                              placeholder="0"
                              invalido={lerDias(p.dias) === null}
                              desabilitado={!editavel}
                              aoMudar={(texto) => {
                                mudarParcela(p.id, (x) => ({ ...x, dias: texto }))
                              }}
                            />
                          </td>
                          <td className={classeCelula}>
                            <CampoNumero
                              rotulo={`Percentual da parcela ${n}`}
                              valor={p.percentual}
                              invalido={lerPercentual(p.percentual) === null}
                              desabilitado={!editavel}
                              aoMudar={(texto) => {
                                mudarParcela(p.id, (x) => ({ ...x, percentual: texto }))
                              }}
                            />
                          </td>
                          <td className={`${classeCelula} text-right tabular-nums`}>
                            {valor === undefined ? '—' : formatarCentavos(valor)}
                          </td>
                          {editavel ? (
                            <td className={classeCelula}>
                              <BotaoIcone
                                icone="trash-2"
                                rotulo={`Remover parcela ${n}`}
                                onClick={() => {
                                  mudar((a) => ({
                                    ...a,
                                    parcelas: a.parcelas.filter((x) => x.id !== p.id),
                                  }))
                                }}
                              />
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
                {editavel ? (
                  <Botao
                    aparencia="link"
                    iconeAntes="plus"
                    onClick={() => {
                      mudar((a) => ({
                        ...a,
                        parcelas: [
                          ...a.parcelas,
                          { id: crypto.randomUUID(), descricao: '', dias: '', percentual: '' },
                        ],
                      }))
                    }}
                  >
                    Adicionar parcela
                  </Botao>
                ) : (
                  <span />
                )}
                {r.parcelas.length > 0 && calculo.diferencaParcelasPontosBase !== 0 ? (
                  <p role="status" className="text-xs text-(--text-danger)">
                    {calculo.diferencaParcelasPontosBase > 0
                      ? `Faltam ${formatarPontosBase(calculo.diferencaParcelasPontosBase)} para fechar 100%.`
                      : `Passa de 100% em ${formatarPontosBase(-calculo.diferencaParcelasPontosBase)}.`}
                  </p>
                ) : r.parcelas.length > 0 ? (
                  <p className="text-xs text-(--text-subtle)">Somam 100% do preço.</p>
                ) : null}
              </div>
            </Secao>

            {/* Fim do orçamento: a proposta como o cliente recebe (ORC-05). */}
            <section
              aria-label="Proposta pronta"
              className="flex flex-wrap items-center justify-between gap-(--space-150) border-b px-(--space-150) py-(--space-150)"
            >
              <p className="max-w-xl text-(--text-subtle)">
                {alterado
                  ? 'Salve as mudanças para ver a proposta pronta: ela mostra o que está salvo.'
                  : 'Veja a proposta como o cliente recebe, sem custo nem margem, e imprima ou salve em PDF.'}
              </p>
              {verProposta('primario')}
            </section>

            {/* Detalhes recolhidos */}
            <Recolhido
              titulo="Objeto, destinatário, prazos e validade"
              resumo={`${r.validade} dias`}
            >
              <div className="grid gap-(--space-200) sm:grid-cols-2">
                <CampoArea
                  id="orcamento-objeto"
                  rotulo="O que está sendo orçado"
                  apoio="Descreva o escopo. Se quiser, cite a metodologia e a legislação aplicável, conferindo a fonte."
                  linhas={1}
                  valor={r.objeto}
                  desabilitado={!editavel}
                  aoMudar={(valor) => {
                    mudar((a) => ({ ...a, objeto: valor }))
                  }}
                />
                <CampoArea
                  id="orcamento-destinatario"
                  rotulo="Destinatário da proposta"
                  linhas={1}
                  valor={r.destinatario}
                  desabilitado={!editavel}
                  aoMudar={(valor) => {
                    mudar((a) => ({ ...a, destinatario: valor }))
                  }}
                />
                <CampoArea
                  id="orcamento-prazos"
                  rotulo="Prazos"
                  linhas={3}
                  valor={r.prazos}
                  desabilitado={!editavel}
                  aoMudar={(valor) => {
                    mudar((a) => ({ ...a, prazos: valor }))
                  }}
                />
                <div className="flex flex-col gap-(--space-050)">
                  <label htmlFor="orcamento-validade" className="rotulo">
                    Validade da proposta (dias)
                  </label>
                  <input
                    id="orcamento-validade"
                    inputMode="numeric"
                    className={`${classeCampo} max-w-32 text-right tabular-nums`}
                    value={r.validade}
                    disabled={!editavel}
                    onChange={(e) => {
                      const valor = e.target.value
                      mudar((a) => ({ ...a, validade: valor }))
                    }}
                  />
                </div>
              </div>
            </Recolhido>
            <Recolhido
              titulo="Apresentação da proposta"
              resumo={r.apresentacao.trim() ? 'própria' : 'padrão'}
            >
              <CampoArea
                id="orcamento-apresentacao"
                rotulo="Texto no início da proposta (vazio usa o padrão da identidade da consultoria)"
                linhas={4}
                valor={r.apresentacao}
                desabilitado={!editavel}
                aoMudar={(valor) => {
                  mudar((a) => ({ ...a, apresentacao: valor }))
                }}
              />
            </Recolhido>
            <Recolhido titulo="Premissas" resumo={String(linhasDeTexto(r.premissas).length)}>
              <CampoArea
                id="orcamento-premissas"
                rotulo="Uma premissa por linha"
                linhas={5}
                valor={r.premissas}
                desabilitado={!editavel}
                aoMudar={(valor) => {
                  mudar((a) => ({ ...a, premissas: valor }))
                }}
              />
            </Recolhido>
            <Recolhido titulo="Exclusões" resumo={String(linhasDeTexto(r.exclusoes).length)}>
              <CampoArea
                id="orcamento-exclusoes"
                rotulo="Uma exclusão por linha"
                linhas={5}
                valor={r.exclusoes}
                desabilitado={!editavel}
                aoMudar={(valor) => {
                  mudar((a) => ({ ...a, exclusoes: valor }))
                }}
              />
            </Recolhido>
          </>
        ) : null}

        <NavegacaoDasEtapas etapa={etapa} aoIr={irPara} titulos={ETAPAS.map((e) => e.titulo)} />
      </div>

      <AvisoDeSaida
        bloquear={() => alterado}
        sujo={alterado}
        descricao="As alterações deste orçamento ainda não foram salvas e se perdem se você sair."
      />

      <DialogoModelo
        aberto={catalogoAberto}
        aoMudar={setCatalogoAberto}
        aoAplicar={aplicarModelo}
        consultoriaId={atual.consultoriaId}
      />
      <DialogoSalvarModelo
        aberto={salvarModeloAberto}
        aoMudar={setSalvarModeloAberto}
        orcamentoId={orcamento.id}
        nomeSugerido={orcamento.objeto}
        aoSalvar={(nome) => {
          aoAvisar(
            `Modelo "${nome}" salvo. Ele aparece em Escolher modelo, nos modelos da consultoria.`,
          )
          void queryClient.invalidateQueries({ queryKey: ['modelos-de-orcamento'] })
        }}
      />
      <DialogoDuplicar
        aberto={duplicarAberto}
        aoMudar={setDuplicarAberto}
        orcamentoId={orcamento.id}
        aoDuplicar={(novoId) => {
          aoAvisar('Cópia criada como rascunho. Revise o cliente, os prazos e os preços.')
          void queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
          void navegar(`/orcamentos/${novoId}`)
        }}
      />
    </div>
  )
}

/** Celular (até 639 px): serviços em cartões (ADR-0019 §4). Sem matchMedia (testes), tabela. */
function useTelaEstreita(): boolean {
  const consulta = '(max-width: 639px)'
  const [estreita, setEstreita] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const midia = window.matchMedia(consulta)
    const mudar = () => {
      setEstreita(midia.matches)
    }
    midia.addEventListener('change', mudar)
    return () => {
      midia.removeEventListener('change', mudar)
    }
  }, [])
  return estreita
}

interface CamposDoItem {
  n: string
  linha: HoraDeVenda | null
  custo: number | null
  preco: number | null
  rotuloDoPreco: string
  servico: ReactNode
  art: ReactNode
  horas: ReactNode
  tabela: ReactNode
  responsavel: ReactNode
  mes: ReactNode
  outros: ReactNode
  remover: () => void
}

/** Resumo dos detalhes recolhidos do serviço, para ver sem abrir. */
function resumoDosDetalhes(item: LinhaItem): string {
  const partes: string[] = []
  const extra = lerReaisOuZero(item.extra)
  if (extra) partes.push(`outros custos ${formatarCentavos(extra)}`)
  if (item.responsabilidade) partes.push(item.responsabilidade === 'art' ? 'com ART' : 'com RRT')
  return partes.length > 0 ? `Detalhes: ${partes.join(' · ')}` : 'Detalhes do serviço'
}

/** O que falta no serviço, em texto (não só cor). */
function estadoDoServico(item: LinhaItem, linha: HoraDeVenda | null): string {
  if (!(lerDuracao(item.horas) ?? 0)) return 'Faltam horas'
  if (item.digitado) return item.precoFechado.trim() ? 'Completo' : 'Falta o preço'
  if (!linha) return 'Escolha o preço'
  if (linha.unidade === 'pacote')
    return item.precoFechado.trim() ? 'Completo' : 'Falta preço fechado'
  if (linha.unidade !== 'hora' && !lerQuantidade(item.quantidade)) return 'Falta quantidade'
  return 'Completo'
}

function ServicosEmCartoes({
  itens,
  camposDoItem,
  editavel,
  abertos,
  aoAlternar,
}: {
  itens: readonly LinhaItem[]
  camposDoItem: (item: LinhaItem, indice: number) => CamposDoItem
  editavel: boolean
  abertos: ReadonlySet<string>
  aoAlternar: (id: string) => void
}) {
  if (itens.length === 0) {
    return (
      <p className="px-(--space-150) py-(--space-100) text-(--text-subtle)">
        Nenhum serviço ainda. Escolha um modelo ou adicione os itens.
      </p>
    )
  }
  return (
    <ol aria-label="Serviços" className="flex flex-col gap-(--space-100) px-(--space-150)">
      {itens.map((item, indice) => {
        const campos = camposDoItem(item, indice)
        const aberto = abertos.has(item.id)
        const idDetalhes = `detalhes-servico-${item.id}`
        const nome = item.descricao.trim() || 'Serviço sem nome'
        const unidade = item.digitado
          ? 'Preço digitado'
          : !campos.linha
            ? 'sem preço escolhido'
            : campos.linha.unidade === 'pacote'
              ? 'Pacote'
              : campos.linha.unidade === 'hora'
                ? `${item.horas || '—'} de serviço`
                : (() => {
                    const q = lerQuantidade(item.quantidade)
                    return q ? textoDaQuantidade(q, campos.linha.unidade) : 'sem quantidade'
                  })()
        return (
          <li key={item.id} className="rounded-(--radius) border bg-(--surface)">
            <div className="flex items-start justify-between gap-(--space-100) p-(--space-150)">
              <div className="flex min-w-0 flex-col gap-(--space-025)">
                <span className="corpo-medio break-words text-(--text)">
                  {campos.n}. {nome}
                </span>
                <span className="text-xs text-(--text-subtle)">
                  {unidade} · {estadoDoServico(item, campos.linha)}
                </span>
              </div>
              <span className="shrink-0 corpo-medio tabular-nums">
                {campos.preco === null ? '—' : formatarCentavos(campos.preco)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-(--space-100) border-t px-(--space-150) py-(--space-075)">
              <Botao
                tamanho="compacto"
                aria-expanded={aberto}
                aria-controls={idDetalhes}
                onClick={() => {
                  aoAlternar(item.id)
                }}
              >
                {aberto ? 'Fechar' : editavel ? 'Editar' : 'Ver'}{' '}
                <span className="sr-only">serviço {campos.n}</span>
              </Botao>
              {editavel ? (
                <BotaoIcone
                  icone="trash-2"
                  rotulo={`Remover serviço ${campos.n}`}
                  onClick={campos.remover}
                />
              ) : null}
            </div>
            {aberto ? (
              <div
                id={idDetalhes}
                className="flex flex-col gap-(--space-150) border-t p-(--space-150)"
              >
                <CampoDoCartao rotulo="Serviço">{campos.servico}</CampoDoCartao>
                <CampoDoCartao rotulo={campos.rotuloDoPreco}>{campos.tabela}</CampoDoCartao>
                <CampoDoCartao rotulo="Horas estimadas">{campos.horas}</CampoDoCartao>
                <CampoDoCartao rotulo="Responsável">{campos.responsavel}</CampoDoCartao>
                <CampoDoCartao rotulo="Mês previsto">{campos.mes}</CampoDoCartao>
                <CampoDoCartao rotulo="Outros custos (R$)">{campos.outros}</CampoDoCartao>
                <CampoDoCartao rotulo="ART/RRT">{campos.art}</CampoDoCartao>
                <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-150) gap-y-(--space-050) corpo">
                  <dt className="text-(--text-subtle)">Custo estimado</dt>
                  <dd className="text-right tabular-nums">
                    {campos.custo === null ? '—' : formatarCentavos(campos.custo)}
                  </dd>
                  <dt className="text-(--text-subtle)">Preço</dt>
                  <dd className="text-right tabular-nums">
                    {campos.preco === null ? '—' : formatarCentavos(campos.preco)}
                  </dd>
                </dl>
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/** Rótulo visível em cima do campo no cartão (o campo já tem nome acessível próprio). */
function CampoDoCartao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <span aria-hidden="true" className="rotulo">
        {rotulo}
      </span>
      {children}
    </div>
  )
}

/** Acrescenta linhas (premissas, exclusões) sem repetir as que já estão. */
function juntarLinhas(atual: string, novas: readonly string[] | undefined): string {
  if (!novas || novas.length === 0) return atual
  const existentes = linhasDeTexto(atual)
  const faltam = novas.filter((n) => !existentes.includes(n))
  return [...existentes, ...faltam].join('\n')
}

// ---------------------------------------------------------------------------
// Peças da tela
// ---------------------------------------------------------------------------

function Numero({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string
  apoio?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-(--space-025)">
      <span className="rotulo">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums text-(--text)">{children}</span>
      {apoio ? <span className="text-xs text-(--text-subtle)">{apoio}</span> : null}
    </div>
  )
}

function Secao({
  titulo,
  acoes,
  children,
}: {
  titulo: string
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b pt-(--space-150)" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-(--space-100) px-(--space-150) pb-(--space-100)">
        <h2 className="titulo-secao text-(--text)">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  )
}

/** Linha de uma lista de valores: rótulo à esquerda, reais à direita. */
function Valor({
  rotulo,
  destaque = false,
  children,
}: {
  rotulo: string
  destaque?: boolean
  children: number
}) {
  return (
    <>
      <dt className={destaque ? 'corpo-medio text-(--text)' : 'text-(--text-subtle)'}>{rotulo}</dt>
      <dd className={`text-right tabular-nums ${destaque ? 'corpo-medio' : ''}`}>
        {formatarCentavos(children)}
      </dd>
    </>
  )
}

function CampoRotulado({
  id,
  rotulo,
  apoio,
  children,
}: {
  id: string
  rotulo: string
  apoio?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {children}
      {apoio ? <span className="text-xs text-(--text-subtle)">{apoio}</span> : null}
    </div>
  )
}

function Recolhido({
  titulo,
  resumo,
  children,
}: {
  titulo: string
  resumo: string
  children: ReactNode
}) {
  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-(--space-100) px-(--space-150) py-(--space-150) corpo text-(--text) hover:bg-(--surface-hover) [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="w-3 text-(--text-subtle) group-open:rotate-45">
          +
        </span>
        <span className="flex-1">{titulo}</span>
        <span className="text-(--text-subtle)">{resumo}</span>
      </summary>
      <div className="px-(--space-150) pb-(--space-200)">{children}</div>
    </details>
  )
}

function CampoNumero({
  id,
  rotulo,
  valor,
  invalido,
  desabilitado,
  placeholder,
  reais = false,
  milhar = false,
  duracao = false,
  aoMudar,
}: {
  /** Com id, o nome vem do <label> ligado a ele; sem id, de `rotulo`. */
  id?: string
  rotulo?: string
  valor: string
  invalido: boolean
  desabilitado: boolean
  placeholder?: string
  /** Valor em reais: ao sair do campo, formata como "8.900,00". */
  reais?: boolean
  /** Reais com o ponto de milhar já ao digitar (40000 → 40.000). */
  milhar?: boolean
  /** Duração: ao sair do campo, formata como "1h30". */
  duracao?: boolean
  aoMudar: (valor: string) => void
}) {
  return (
    <input
      id={id}
      aria-label={id ? undefined : rotulo}
      inputMode={duracao ? 'text' : 'decimal'}
      aria-invalid={invalido || undefined}
      className={`${classeCampo} text-right tabular-nums`}
      value={valor}
      placeholder={placeholder}
      disabled={desabilitado}
      onChange={(e) => {
        aoMudar(milhar ? reaisDigitados(e) : e.target.value)
      }}
      onBlur={() => {
        // Valores digitados ficam no formato da tela ao sair do campo. Só muda se ficou diferente.
        let formatado: string | null = null
        if (reais) {
          const centavos = lerReais(valor)
          if (centavos !== null) formatado = formatarCentavos(centavos)
        } else if (duracao && valor.trim() !== '') {
          const minutos = lerDuracao(valor)
          if (minutos !== null) formatado = formatarDuracao(minutos)
        }
        if (formatado !== null && formatado !== valor) aoMudar(formatado)
      }}
    />
  )
}

function CampoArea({
  id,
  rotulo,
  linhas,
  valor,
  desabilitado,
  aoMudar,
  apoio,
}: {
  id: string
  rotulo: string
  linhas: number
  valor: string
  desabilitado: boolean
  aoMudar: (valor: string) => void
  /** Ajuda curta embaixo do campo, ligada por aria-describedby. */
  apoio?: string
}) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {apoio ? (
        <span id={`${id}-apoio`} className="text-xs text-(--text-subtle)">
          {apoio}
        </span>
      ) : null}
      <textarea
        id={id}
        aria-describedby={apoio ? `${id}-apoio` : undefined}
        rows={linhas}
        className={`${classeCampo} h-auto min-h-(--size-control) py-(--space-075)`}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
      />
    </div>
  )
}

/**
 * Preço sem custos e taxas configurados (ADR-0023): preços digitados, despesas incluídas e visitas,
 * sem tributo nem margem. Custo e lucro ficam "não calculados", nunca zero.
 */
function PrecoSemConfiguracao({
  itens,
  visitas,
  precoTotal,
  pendencia,
}: {
  itens: readonly { id: string; rotulo: string; precoCentavos: number }[]
  visitas: { rotulo: string; precoCentavos: number } | null
  precoTotal: number | null
  pendencia: string | null
}) {
  return (
    <div className="flex flex-col gap-(--space-150)">
      {precoTotal === null ? (
        <p>{pendencia}</p>
      ) : (
        <section aria-label="Preço na proposta">
          <h3 className="mb-(--space-100) corpo-medio">Preço na proposta</h3>
          <dl className="grid max-w-2xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
            {itens.map((item) => (
              <Valor key={item.id} rotulo={item.rotulo}>
                {item.precoCentavos}
              </Valor>
            ))}
            {visitas ? <Valor rotulo={visitas.rotulo}>{visitas.precoCentavos}</Valor> : null}
            <dt className="border-t pt-(--space-075) corpo-medio">Preço</dt>
            <dd className="border-t pt-(--space-075) text-right corpo-medio tabular-nums">
              {formatarReais(precoTotal)}
            </dd>
            <dt className="text-(--text-subtle)">Lucro e margem</dt>
            <dd className="text-right">não calculados</dd>
          </dl>
        </section>
      )}
      <Link to="/orcamentos/primeiros-passos" className="self-start">
        Calcular preço pelos custos
      </Link>
    </div>
  )
}

function ComoOPrecoECalculado({
  base,
  fixos,
  pelaTabela,
}: {
  base: NonNullable<Orcamento['base']>
  fixos: number
  pelaTabela: boolean
}) {
  return (
    <>
      <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
        <dt className="text-(--text-subtle)">Custo da hora técnica · contas por hora</dt>
        <dd className="text-right tabular-nums">
          {formatarCentavos(base.horaTecnicaCentavos)} ·{' '}
          {formatarCentavos(base.custoFixoHoraCentavos)}
        </dd>
        {base.deslocamentoModo === 'visita' ? (
          <>
            <dt className="text-(--text-subtle)">Visita técnica (por visita)</dt>
            <dd className="text-right tabular-nums">
              {formatarCentavos(base.valorVisitaCentavos)}
            </dd>
          </>
        ) : base.deslocamentoModo === 'km' ? (
          <>
            <dt className="text-(--text-subtle)">Visita técnica (por km rodado)</dt>
            <dd className="text-right tabular-nums">{formatarCentavos(base.custoKmCentavos)}</dd>
          </>
        ) : (
          <>
            <dt className="text-(--text-subtle)">Visita técnica · valor por km</dt>
            <dd className="text-right tabular-nums">
              {formatarCentavos(base.valorVisitaCentavos)} ·{' '}
              {formatarCentavos(base.custoKmCentavos)}
            </dd>
          </>
        )}
        <dt className="text-(--text-subtle)">Taxas fixas por cobrança e assinatura</dt>
        <dd className="text-right tabular-nums">{formatarCentavos(fixos)}</dd>
        <dt className="text-(--text-subtle)">Tributos · taxas percentuais</dt>
        <dd className="text-right tabular-nums">
          {formatarPontosBase(base.tributosPb)} · {formatarPontosBase(base.taxasPb)}
        </dd>
      </dl>
      <p className="mt-(--space-150) max-w-xl text-xs text-(--text-subtle)">
        {pelaTabela
          ? 'Pela tabela, cada serviço usa as horas e a hora de venda escolhida, com os outros custos e despesas incluídas. O lucro é o que sobra após custos, tributos e taxas.'
          : 'O acréscimo incide sobre as horas de venda e as contas. Outros custos e despesas entram sem acréscimo. Tributos e taxas são cobertos separadamente, inclusive os incidentes sobre as visitas. O preço dos serviços é repartido conforme as horas de venda, contas e outros custos.'}{' '}
        As visitas têm preço fixo e linha própria.
      </p>
    </>
  )
}

/** Voltar e continuar no pé de cada etapa. */
function NavegacaoDasEtapas({
  etapa,
  aoIr,
  titulos,
}: {
  etapa: number
  aoIr: (indice: number) => void
  titulos: readonly string[]
}) {
  const anterior = titulos[etapa - 1]
  const proxima = titulos[etapa + 1]
  return (
    <div className="flex flex-wrap items-center justify-between gap-(--space-100) border-t p-(--space-150)">
      {anterior ? (
        <Botao
          iconeAntes="arrow-left"
          onClick={() => {
            aoIr(etapa - 1)
          }}
        >
          {anterior}
        </Botao>
      ) : (
        <span />
      )}
      {proxima ? (
        <Botao
          aparencia="primario"
          iconeDepois="arrow-right"
          onClick={() => {
            aoIr(etapa + 1)
          }}
        >
          Continuar para {proxima.toLowerCase()}
        </Botao>
      ) : null}
    </div>
  )
}

/**
 * Responsável do serviço, com a carga dele no mês escolhido: horas em orçamentos aprovados mais as
 * deste, contra a jornada de Custos e taxas. Passar da jornada é avisado por texto, não só por cor.
 */
function CelulaResponsavel({
  n,
  valor,
  opcoes,
  nomeDoValor,
  carregando,
  desabilitado,
  carga,
  mes,
  aoMudar,
}: {
  n: string
  valor: string
  opcoes: { id: string; rotulo: string }[]
  nomeDoValor: string | null
  carregando: boolean
  desabilitado: boolean
  carga: ReturnType<typeof cargaDoMes> | null
  mes: string
  aoMudar: (valor: string) => void
}) {
  const idCarga = `carga-do-item-${n}`
  const naLista = opcoes.some((o) => o.id === valor)
  return (
    <div className="flex flex-col gap-(--space-025)">
      <select
        aria-label={`Responsável pelo item ${n}`}
        aria-describedby={carga ? idCarga : undefined}
        aria-busy={carregando || undefined}
        className={classeCampo}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
      >
        <option value="">{carregando ? 'Carregando…' : 'Sem responsável'}</option>
        {valor && !naLista ? (
          <option value={valor}>{nomeDoValor ?? 'Fora da equipe de Custos e taxas'}</option>
        ) : null}
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {carga ? (
        <span
          id={idCarga}
          className={`text-xs tabular-nums ${carga.acimaDaJornada ? 'text-(--text-danger)' : 'text-(--text-subtle)'}`}
        >
          {rotuloDoMes(mes)}: {formatarDuracao(carga.totalMinutos)}
          {carga.jornadaMinutos === null
            ? ' (jornada não informada em Custos e taxas)'
            : ` de ${formatarDuracao(carga.jornadaMinutos)}`}
          {carga.acimaDaJornada ? ', acima da jornada' : ''}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Abaixo do preço escolhido: a quantidade (m², hectare, diárias, campanhas) ou o preço fechado do
 * pacote. Com tempo por unidade na tabela, a quantidade sugere as horas estimadas, que continuam
 * editáveis (ADR-0018, P2). Na hora, nada aparece: o preço sai das horas.
 */
function CampoDaUnidade({
  n,
  linha,
  item,
  desabilitado,
  aoMudar,
}: {
  n: string
  linha: { unidade: UnidadeDeCobranca; minutosPorUnidade: number | null } | null
  item: LinhaItem
  desabilitado: boolean
  aoMudar: (alterar: (x: LinhaItem) => LinhaItem) => void
}) {
  if (!linha || linha.unidade === 'hora') return null
  const semHoras = (lerDuracao(item.horas) ?? 0) === 0
  if (linha.unidade === 'pacote') {
    return (
      <>
        <CampoNumero
          rotulo={`Preço fechado do item ${n}`}
          reais
          valor={item.precoFechado}
          placeholder="Preço fechado"
          invalido={
            item.precoFechado.trim() === '' || lerEstimativa(item.precoFechado) === undefined
          }
          desabilitado={desabilitado}
          aoMudar={(valor) => {
            aoMudar((x) => ({ ...x, precoFechado: valor }))
          }}
        />
        {semHoras ? (
          <span className="text-xs text-(--text-subtle)">Informe as horas estimadas</span>
        ) : null}
      </>
    )
  }
  const quantidade = lerQuantidade(item.quantidade)
  return (
    <>
      <label className="flex items-center gap-(--space-050)">
        <input
          aria-label={`Quantidade do item ${n}`}
          inputMode="decimal"
          placeholder="Quantidade"
          aria-invalid={quantidade === null || quantidade === undefined || undefined}
          className={`${classeCampo} text-right tabular-nums`}
          value={item.quantidade}
          disabled={desabilitado}
          onChange={(e) => {
            const valor = e.target.value
            const minutos = linha.minutosPorUnidade
            const sugestao = (texto: string): string | null => {
              const lida = lerQuantidade(texto)
              return minutos && lida
                ? formatarDuracao(Math.round((lida * minutos) / ESCALA_DA_QUANTIDADE))
                : null
            }
            aoMudar((x) => {
              // As horas acompanham a quantidade enquanto forem a própria sugestão (ou estiverem
              // vazias); editadas à mão, ficam como a pessoa deixou.
              const seguindo =
                (lerDuracao(x.horas) ?? 0) === 0 || x.horas === sugestao(x.quantidade)
              return {
                ...x,
                quantidade: valor,
                horas: seguindo ? (sugestao(valor) ?? x.horas) : x.horas,
              }
            })
          }}
        />
        <span className="shrink-0 text-xs text-(--text-subtle)">
          {ROTULO_DA_UNIDADE[linha.unidade]}
        </span>
      </label>
      {semHoras ? (
        <span className="text-xs text-(--text-subtle)">Informe as horas estimadas</span>
      ) : null}
    </>
  )
}
