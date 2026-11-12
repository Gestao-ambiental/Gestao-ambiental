import {
  cargaDoMes,
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
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

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
  salvarOrcamento,
  type DadosDoRascunho,
  type FormaDePreco,
  type Orcamento,
  type TratamentoDespesa,
} from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'
import { listarMembrosAtivos } from '@/lib/api/perfil'
import { mascararCnpj } from '@gestao-ambiental/domain'

import {
  calcularOrcamento,
  lerDias,
  lerEstimativa,
  lerPercentual,
  lerReaisOuZero,
  textoDoPercentual,
} from './calculo'
import { classeCabecalho, classeCampo, classeCelula, numeroComRevisao } from './comum'
import { DialogoModelo, type SelecaoDoModelo } from './DialogoModelo'
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

/** Atalhos de margem, de 5 em 5 (as mais usadas); o campo aceita qualquer outra. */
const MARGENS_RAPIDAS = [10, 15, 20, 25, 30] as const

const MENSAGEM_DA_PENDENCIA: Record<PendenciaDoPreco, string> = {
  sem_itens: 'Adicione os serviços para calcular o preço.',
  sem_base: 'Custos e taxas ainda não configurados: sem eles não há custo nem preço.',
  despesa_a_cotar:
    'Há despesa incluída no preço ainda a cotar: o preço fica pendente até ela ter valor.',
  percentuais_impossiveis:
    'Margem, tributos e taxas somam 100% ou mais: não há preço possível. Reduza a margem.',
  valor_invalido: 'O preço passou do limite. Confira as horas e os valores.',
  hora_sem_valor:
    'Há serviço sem hora de venda, ou com uma hora que não existe mais em Custos e taxas: escolha a hora.',
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
  /** Membro responsável ('' = sem responsável): o custo usa a hora dele. */
  responsavelId: string
  /** Mês previsto (aaaa-mm-01; '' = sem mês). */
  mesPrevisto: string
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
  return {
    objeto: o.objeto,
    destinatario: o.destinatario,
    prazos: o.prazos,
    validade: String(o.validadeDias),
    premissas: o.premissas.join('\n'),
    exclusoes: o.exclusoes.join('\n'),
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
      horaVendaId: i.horaVendaId ?? '',
      responsavelId: i.responsavelId ?? '',
      mesPrevisto: i.mesPrevisto ?? '',
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
    itens.push({
      id: i.id,
      descricao: i.descricao,
      minutos,
      custoDiretoExtraCentavos: extra,
      horaVendaId: i.horaVendaId || null,
      responsavelId: i.responsavelId || null,
      mesPrevisto: i.mesPrevisto || null,
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
  const [aviso, setAviso] = useState<string | null>(null)

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
      aoAvisar={setAviso}
    />
  )
}

function Editor({
  orcamento,
  aviso,
  aoAvisar,
}: {
  orcamento: Orcamento
  aviso: string | null
  aoAvisar: (aviso: string | null) => void
}) {
  const queryClient = useQueryClient()
  const editavel = orcamento.situacao === 'rascunho'
  const base = orcamento.base
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(orcamento))
  const [alterado, setAlterado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
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
      horaVendaId: i.horaVendaId || null,
      responsavelId: i.responsavelId || null,
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
  // Tabela agrupada por profissão, para a lista de cada serviço.
  const horasPorProfissao = [...new Set(horas.map((h) => h.profissao))].map((profissao) => ({
    profissao,
    horas: horas.filter((h) => h.profissao === profissao),
  }))
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

  function aplicarModelo(selecao: SelecaoDoModelo) {
    mudar((a) => ({
      ...a,
      itens: [
        ...a.itens,
        ...selecao.etapas.map((e) => ({
          id: crypto.randomUUID(),
          descricao: e.nome,
          horas:
            e.horasSugeridas === null ? '' : formatarDuracao(Math.round(e.horasSugeridas * 60)),
          extra: '',
          horaVendaId: horaPadrao,
          responsavelId: '',
          mesPrevisto: '',
        })),
      ],
      despesas: [
        ...a.despesas,
        ...selecao.despesas.map((nome) => ({
          id: crypto.randomUUID(),
          descricao: nome,
          estimativa: '',
          tratamento: 'cliente_direto' as const,
        })),
      ],
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
        const valor = nome === 'cnpj' ? mascararCnpj(evento.target.value) : evento.target.value
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

  const precoTotal = calculo.precoTotalCentavos
  const quantidadeDeVisitas = visitasLidas.quantidade ?? 0
  const temVisitas = calculo.valorVisitasCentavos > 0
  const d = calculo.divisao

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
            {alterado ? <span>Alterações não salvas</span> : null}
          </p>
        </div>
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

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}{' '}
          {orcamento.empreendimentoId ? (
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
              <span className="text-(--text-subtle)">pendente</span>
            ) : (
              formatarReais(calculo.custoTotalCentavos)
            )}
          </Numero>
          <Numero
            rotulo="Preço"
            apoio={
              precoTotal === null
                ? undefined
                : pelaTabela
                  ? `pela tabela · sobra ${formatarPontosBase(calculo.margemResultantePb ?? 0)}`
                  : `com margem de ${formatarPontosBase(calculo.margemPb)}, escolhida no fim`
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
                      : 'Quem pediu o orçamento ainda não está cadastrado. Ao cadastrar, um CNPJ que já existe é ligado ao empreendimento existente, sem duplicar.'}
                  </p>
                  <div className="grid gap-(--space-150) sm:grid-cols-2 lg:grid-cols-3">
                    <CampoTexto
                      rotulo="Nome da empresa ou do cliente"
                      required
                      {...campoDoProspecto('nome')}
                    />
                    <CampoTexto rotulo="CNPJ" ajuda="Opcional" {...campoDoProspecto('cnpj')} />
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
              {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse corpo">
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        Serviço
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                        Horas
                      </th>
                      {horas.length > 0 ? (
                        <th scope="col" className={`${classeCabecalho} w-56`}>
                          {pelaTabela ? 'Hora de venda' : 'Profissão'}
                        </th>
                      ) : null}
                      <th scope="col" className={`${classeCabecalho} w-52`}>
                        Responsável
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-32`}>
                        Mês
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                        Outros custos (R$)
                      </th>
                      <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
                        Custo (R$)
                      </th>
                      {pelaTabela ? (
                        <th scope="col" className={`${classeCabecalho} w-32 text-right`}>
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
                          colSpan={7 + (horas.length > 0 ? 1 : 0) + (pelaTabela ? 1 : 0)}
                          className={`${classeCelula} text-(--text-subtle)`}
                        >
                          Nenhum serviço ainda. Escolha um modelo ou adicione os itens.
                        </td>
                      </tr>
                    ) : null}
                    {r.itens.map((item, indice) => {
                      const custo = calculo.custosDosItens[indice]?.totalCentavos ?? null
                      const n = String(indice + 1)
                      return (
                        <tr key={item.id}>
                          <td className={classeCelula}>
                            <textarea
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
                          </td>
                          <td className={classeCelula}>
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
                          </td>
                          {horas.length > 0 ? (
                            <td className={classeCelula}>
                              <select
                                aria-label={`Hora de venda do item ${n}`}
                                className={classeCampo}
                                value={item.horaVendaId}
                                disabled={!editavel}
                                aria-invalid={
                                  (pelaTabela && !horas.some((h) => h.id === item.horaVendaId)) ||
                                  undefined
                                }
                                onChange={(e) => {
                                  const valor = e.target.value
                                  mudarItem(item.id, (x) => ({ ...x, horaVendaId: valor }))
                                }}
                              >
                                {horas.some((h) => h.id === item.horaVendaId) ? null : (
                                  <option value={item.horaVendaId}>
                                    {item.horaVendaId
                                      ? 'Hora que não existe mais'
                                      : pelaTabela
                                        ? 'Escolha a hora'
                                        : 'Média da equipe'}
                                  </option>
                                )}
                                {horasPorProfissao.map((grupo) => (
                                  <optgroup key={grupo.profissao} label={grupo.profissao}>
                                    {grupo.horas.map((h) => (
                                      <option key={h.id} value={h.id}>
                                        {h.atividade} · {formatarCentavos(h.valorCentavos)}/h
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                          ) : null}
                          <td className={classeCelula}>
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
                          </td>
                          <td className={classeCelula}>
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
                                <option value={item.mesPrevisto}>
                                  {rotuloDoMes(item.mesPrevisto)}
                                </option>
                              ) : null}
                              {meses.map((m) => (
                                <option key={m} value={m}>
                                  {rotuloDoMes(m)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={classeCelula}>
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
                          </td>
                          <td className={`${classeCelula} text-right tabular-nums`}>
                            {custo === null ? (
                              <span className="text-(--text-subtle)">—</span>
                            ) : (
                              formatarCentavos(custo)
                            )}
                          </td>
                          {pelaTabela ? (
                            <td className={`${classeCelula} text-right tabular-nums`}>
                              {calculo.pendencia === null ? (
                                formatarCentavos(calculo.precosDosItens[indice] ?? 0)
                              ) : (
                                <span className="text-(--text-subtle)">—</span>
                              )}
                            </td>
                          ) : null}
                          {editavel ? (
                            <td className={classeCelula}>
                              <BotaoIcone
                                icone="trash-2"
                                rotulo={`Remover item ${n}`}
                                onClick={() => {
                                  mudar((a) => ({
                                    ...a,
                                    itens: a.itens.filter((x) => x.id !== item.id),
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
                        itens: [
                          ...a.itens,
                          {
                            id: crypto.randomUUID(),
                            descricao: '',
                            horas: '',
                            extra: '',
                            horaVendaId: horaPadrao,
                            responsavelId: '',
                            mesPrevisto: '',
                          },
                        ],
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
                  <CampoRotulado
                    id="visitas-km"
                    rotulo="Km por visita, ida e volta"
                    apoio="Deixe em branco se a visita é perto"
                  >
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
                  <CampoRotulado
                    id="visitas-outros"
                    rotulo="Outros gastos por visita (R$)"
                    apoio="Pedágio, estacionamento, alimentação"
                  >
                    <CampoNumero
                      id="visitas-outros"
                      reais
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
                    Cada visita: {formatarReais(base.valorVisitaCentavos)}
                    {base.custoKmCentavos > 0
                      ? ` + km × ${formatarReais(base.custoKmCentavos)}`
                      : ''}{' '}
                    + outros gastos. Preço fixo, sem margem.{' '}
                    {quantidadeDeVisitas > 0 ? (
                      <span className="corpo-medio text-(--text)">
                        Valor das visitas: {formatarReais(calculo.valorVisitasCentavos)}
                      </span>
                    ) : (
                      'Sem visitas, nada entra no preço.'
                    )}{' '}
                    {base.valorVisitaCentavos === 0 && base.custoKmCentavos === 0 ? (
                      <Link to="/configuracoes/custos">Cadastrar o valor da visita e do km</Link>
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
                                mudar((a) => ({
                                  ...a,
                                  despesas: a.despesas.map((x) =>
                                    x.id === despesa.id ? { ...x, descricao: valor } : x,
                                  ),
                                }))
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
                                mudar((a) => ({
                                  ...a,
                                  despesas: a.despesas.map((x) =>
                                    x.id === despesa.id ? { ...x, tratamento: valor } : x,
                                  ),
                                }))
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
                                mudar((a) => ({
                                  ...a,
                                  despesas: a.despesas.map((x) =>
                                    x.id === despesa.id ? { ...x, estimativa: valor } : x,
                                  ),
                                }))
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
                            x.horaVendaId ? x : { ...x, horaVendaId: horaPadrao },
                          ),
                        }))
                      }}
                    />
                    <OpcaoRadio
                      name="forma-de-preco"
                      rotulo="Pela margem"
                      descricao="Custo ÷ (1 − margem − tributos − taxas)."
                      checked={!pelaTabela}
                      disabled={!editavel}
                      onChange={() => {
                        mudar((a) => ({ ...a, formaPreco: 'margem' }))
                      }}
                    />
                  </div>
                </fieldset>
                {pelaTabela && horas.length === 0 ? (
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
                    {base ? (
                      <span className="text-(--text-subtle)">
                        {' '}
                        · mínima {formatarPontosBase(base.margemMinimaPb)}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <CampoRotulado
                    id="orcamento-margem"
                    rotulo="Margem de lucro (%)"
                    apoio={
                      base
                        ? `Sobre o preço de venda · desejada ${formatarPontosBase(base.margemDesejadaPb)} · mínima ${formatarPontosBase(base.margemMinimaPb)}`
                        : 'Sobre o preço de venda'
                    }
                  >
                    <div className="flex flex-wrap items-center gap-(--space-100)">
                      <input
                        id="orcamento-margem"
                        inputMode="decimal"
                        aria-invalid={(r.margem.trim() !== '' && margemLida === null) || undefined}
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
                {calculo.situacaoDaMargem === 'abaixo_da_minima' ? (
                  <MensagemSecao role="status" tom="perigo">
                    A margem está abaixo da mínima da consultoria (
                    {base ? formatarPontosBase(base.margemMinimaPb) : ''}).
                  </MensagemSecao>
                ) : null}

                {d && precoTotal !== null ? (
                  <div className="grid gap-(--space-300) lg:grid-cols-2">
                    <section aria-label="Divisão do valor">
                      <h3 className="mb-(--space-100) corpo-medio">Divisão do valor</h3>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
                        <Valor rotulo="Trabalho técnico (horas × hora técnica)">
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
                        <Valor
                          rotulo={`Lucro (${formatarPontosBase(
                            pelaTabela ? (calculo.margemResultantePb ?? 0) : calculo.margemPb,
                          )})`}
                          destaque
                        >
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
                        O preço é repartido entre os serviços pelo custo de cada um. Custo e margem
                        não aparecem para o cliente.
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
                resumo="custos + taxas fixas ÷ (1 − margem − tributos − taxas)"
              >
                <ComoOPrecoECalculado base={base} fixos={calculo.fixosPorCobrancaCentavos} />
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
                                mudar((a) => ({
                                  ...a,
                                  parcelas: a.parcelas.map((x) =>
                                    x.id === p.id ? { ...x, descricao: texto } : x,
                                  ),
                                }))
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
                                mudar((a) => ({
                                  ...a,
                                  parcelas: a.parcelas.map((x) =>
                                    x.id === p.id ? { ...x, dias: texto } : x,
                                  ),
                                }))
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
                                mudar((a) => ({
                                  ...a,
                                  parcelas: a.parcelas.map((x) =>
                                    x.id === p.id ? { ...x, percentual: texto } : x,
                                  ),
                                }))
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

            {/* Detalhes recolhidos */}
            <Recolhido
              titulo="Objeto, destinatário, prazos e validade"
              resumo={`${r.validade} dias`}
            >
              <div className="grid gap-(--space-200) sm:grid-cols-2">
                <CampoArea
                  id="orcamento-objeto"
                  rotulo="O que está sendo orçado"
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

      <DialogoModelo
        aberto={catalogoAberto}
        aoMudar={setCatalogoAberto}
        aoAplicar={aplicarModelo}
      />
    </div>
  )
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
  duracao = false,
  aoMudar,
  aoSair,
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
  /** Duração: ao sair do campo, formata como "1h30". */
  duracao?: boolean
  aoMudar: (valor: string) => void
  aoSair?: () => void
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
        aoMudar(e.target.value)
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
        aoSair?.()
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
}: {
  id: string
  rotulo: string
  linhas: number
  valor: string
  desabilitado: boolean
  aoMudar: (valor: string) => void
}) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <textarea
        id={id}
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

function ComoOPrecoECalculado({
  base,
  fixos,
}: {
  base: NonNullable<Orcamento['base']>
  fixos: number
}) {
  return (
    <>
      <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo">
        <dt className="text-(--text-subtle)">Hora técnica · contas da consultoria por hora</dt>
        <dd className="text-right tabular-nums">
          {formatarCentavos(base.horaTecnicaCentavos)} ·{' '}
          {formatarCentavos(base.custoFixoHoraCentavos)}
        </dd>
        <dt className="text-(--text-subtle)">Visita técnica · valor por km</dt>
        <dd className="text-right tabular-nums">
          {formatarCentavos(base.valorVisitaCentavos)} · {formatarCentavos(base.custoKmCentavos)}
        </dd>
        <dt className="text-(--text-subtle)">Taxas fixas por cobrança e assinatura</dt>
        <dd className="text-right tabular-nums">{formatarCentavos(fixos)}</dd>
        <dt className="text-(--text-subtle)">Tributos · taxas percentuais</dt>
        <dd className="text-right tabular-nums">
          {formatarPontosBase(base.tributosPb)} · {formatarPontosBase(base.taxasPb)}
        </dd>
      </dl>
      <p className="mt-(--space-150) max-w-xl text-xs text-(--text-subtle)">
        Preço dos serviços = (custo dos serviços + despesas incluídas + taxas fixas) ÷ (1 − margem −
        tributos − taxas), repartido entre os serviços pelo custo de cada um. As visitas têm preço
        fixo, sem margem, e linha própria.
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
            ? ' (sem jornada em Custos e taxas)'
            : ` de ${formatarDuracao(carga.jornadaMinutos)}`}
          {carga.acimaDaJornada ? ', acima da jornada' : ''}
        </span>
      ) : null}
    </div>
  )
}
