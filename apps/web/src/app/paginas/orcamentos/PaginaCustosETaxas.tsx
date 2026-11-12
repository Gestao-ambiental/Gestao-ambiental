import {
  acrescimoEquivalente,
  composicaoDaEquipe,
  custoFixoPorHora,
  custoHoraPorProfissao,
  mesmaProfissao,
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
  horaDeCustoDaPessoa,
  type ComposicaoDaEquipe,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'

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
  lerHoras,
  lerPercentual,
  lerReaisOuZero,
  textoDasHoras,
  textoDoPercentual,
} from './calculo'
import { classeCabecalho, classeCampo, classeCelula } from './comum'

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
  pisoHora: string
}

/** Linha da tabela de hora de venda, com o valor como texto enquanto a pessoa digita. */
interface LinhaHora {
  id: string
  profissao: string
  atividade: string
  valor: string
  fonte: string
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
]

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
  custo: string
  /** Horas de trabalho no mês (jornada). */
  horas: string
  /** Remuneração pelo piso: horas no mês × piso por hora. */
  peloPiso: boolean
  profissao: string
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
      pisoHora: '',
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
    pisoHora: base.pisoHoraCentavos ? formatarCentavos(base.pisoHoraCentavos) : '',
  }
}

function horasDe(base: BaseDeCustosDaConsultoria | null): LinhaHora[] {
  return (base?.horasVenda ?? []).map((h) => ({
    id: h.id,
    profissao: h.profissao,
    atividade: h.atividade,
    valor: formatarCentavos(h.valorCentavos),
    fonte: h.fonte ?? '',
  }))
}

/** Lê a tabela de hora de venda: profissão e atividade obrigatórias, sem repetir a dupla. */
function lerHorasDeVenda(linhas: readonly LinhaHora[]): HoraDeVenda[] | string {
  const horas: HoraDeVenda[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const valor = lerReaisOuZero(l.valor)
    if (!l.profissao.trim()) return `Hora de venda, linha ${n}: informe a profissão.`
    if (!l.atividade.trim()) return `Hora de venda, linha ${n}: informe a atividade ou o nível.`
    if (valor === null) return `Hora de venda, linha ${n}: valor inválido.`
    const repetida = horas.some(
      (h) =>
        mesmaProfissao(h.profissao, l.profissao) &&
        h.atividade.toLowerCase() === l.atividade.trim().toLowerCase(),
    )
    if (repetida)
      return `Hora de venda: "${l.profissao.trim()} · ${l.atividade.trim()}" aparece duas vezes.`
    horas.push({
      id: l.id,
      profissao: l.profissao.trim(),
      atividade: l.atividade.trim(),
      valorCentavos: valor,
      fonte: l.fonte.trim() || null,
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
  return (base?.equipe ?? []).map((p) => ({
    id: p.id,
    membroId: p.membroId,
    socio: p.socio,
    custo: formatarCentavos(p.custoMensalCentavos),
    horas: String(p.horasDisponiveisMes),
    peloPiso: p.peloPiso,
    profissao: p.profissao ?? '',
  }))
}

function novaPessoa(): LinhaPessoa {
  return {
    id: crypto.randomUUID(),
    membroId: '',
    socio: false,
    custo: '',
    horas: '',
    peloPiso: false,
    profissao: '',
  }
}

/** Horas de trabalho no mês: inteiro de 0 a 744; vazio é zero. */
function lerHorasDoMes(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return 0
  if (!/^\d{1,3}$/.test(limpo)) return null
  const horas = Number(limpo)
  return horas <= 744 ? horas : null
}

/** Pelo piso: horas no mês × piso por hora (o banco faz a mesma conta ao salvar). */
function custoPeloPiso(horas: number, pisoHoraCentavos: number): number {
  return Math.round(horas * pisoHoraCentavos)
}

/** Custo do mês da linha: pelo piso, horas × piso; senão, o digitado. `null` se inválido. */
function custoDaLinha(l: LinhaPessoa, pisoHoraCentavos: number): number | null {
  const horas = lerHorasDoMes(l.horas)
  return l.peloPiso ? custoPeloPiso(horas ?? 0, pisoHoraCentavos) : lerReaisOuZero(l.custo)
}

/** Lê a equipe digitada. Devolve a primeira mensagem de erro, se houver. */
function lerEquipe(
  linhas: readonly LinhaPessoa[],
  pisoHoraCentavos: number,
): PessoaDaBase[] | string {
  const equipe: PessoaDaBase[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const horas = lerHorasDoMes(l.horas)
    const custo = custoDaLinha(l, pisoHoraCentavos)
    if (!l.membroId) return `Equipe, linha ${n}: escolha a pessoa.`
    if (equipe.some((p) => p.membroId === l.membroId))
      return `Equipe, linha ${n}: a pessoa já está em outra linha.`
    if (custo === null) return `Equipe, linha ${n}: custo mensal inválido.`
    if (horas === null) return `Equipe, linha ${n}: horas no mês de 0 a 744.`
    equipe.push({
      id: l.id,
      membroId: l.membroId,
      descricao: '',
      socio: l.socio,
      peloPiso: l.peloPiso,
      profissao: l.profissao.trim() || null,
      custoMensalCentavos: custo,
      horasDisponiveisMes: horas,
    })
  }
  return equipe
}

function composicaoDe(equipe: readonly PessoaDaBase[]): ComposicaoDaEquipe {
  return composicaoDaEquipe(equipe)
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
  const pisoHora = lerReaisOuZero(c.pisoHora)
  if (pisoHora === null) return 'Confira o piso por hora.'
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
    if (pisoHora === 0 && linhas.some((l) => l.peloPiso))
      return 'Informe o piso por hora: há pessoas marcadas pelo piso.'
    const lida = lerEquipe(linhas, pisoHora)
    if (typeof lida === 'string') return lida
    equipe = lida
    composicao = composicaoDe(equipe)
    if (composicao.horaTecnicaCentavos === null)
      return 'A equipe precisa de horas no mês: informe as horas de cada pessoa.'
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
      custoHoraPorProfissao: custoHoraPorProfissao(equipe),
      pisoHoraCentavos: pisoHora,
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
  const pisoLido = lerReaisOuZero(c.pisoHora) ?? 0
  const totalDasContas = contas.reduce((soma, l) => soma + (lerReaisOuZero(l.valor) ?? 0), 0)
  // Prévia da composição mesmo com algum campo ainda incompleto (linhas inválidas ficam de fora).
  const previa = pelaEquipe
    ? (() => {
        const lida = lerEquipe(equipe, pisoLido)
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
              pisoHoraCentavos={pisoLido}
              campoPiso={campo('pisoHora')}
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
                rotulo="Hora técnica (R$)"
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
            Rateio por hora estimada:{' '}
            <span className="corpo-medio text-(--text)">
              {porHora === null ? 'pendente' : `${formatarReais(porHora)} por hora`}
            </span>
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

        <Grupo titulo="Hora de venda (tabela)">
          <p className="max-w-3xl text-xs text-(--text-subtle)">
            Quanto vocês cobram do cliente por hora, por profissão e atividade ou nível (ex.: Eng.
            ambiental · Júnior; Eng. ambiental · Perícia; Biólogo · Sênior). Cada serviço do
            orçamento escolhe uma linha: ela define o preço pela tabela e a profissão do custo.
          </p>
          <datalist id="profissoes-da-consultoria">
            {profissoes.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
          {horas.length > 0 ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse corpo">
                <thead>
                  <tr>
                    <th scope="col" className={classeCabecalho}>
                      Profissão
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Atividade ou nível
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                      Hora de venda (R$)
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
                    return (
                      <tr key={l.id}>
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
                          <input
                            aria-label={`Hora de venda da linha ${n}`}
                            inputMode="decimal"
                            aria-invalid={lerReaisOuZero(l.valor) === null || undefined}
                            className={`${classeCampo} text-right tabular-nums`}
                            value={l.valor}
                            onChange={(e) => {
                              const valor = e.target.value
                              mudarHora((x) => ({ ...x, valor }))
                            }}
                          />
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
                            rotulo={`Remover hora ${n}`}
                            onClick={() => {
                              setHoras((a) => a.filter((x) => x.id !== l.id))
                              setAviso(null)
                            }}
                          />
                        </td>
                      </tr>
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
                  { id: crypto.randomUUID(), profissao: '', atividade: '', valor: '', fonte: '' },
                ])
                setAviso(null)
              }}
            >
              Adicionar hora
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
            apoio="Alíquota efetiva informada pela contabilidade"
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
          <Linha id="base-assinatura" rotulo="Taxa por documento assinado (R$)">
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
  pisoHoraCentavos,
  campoPiso,
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
  pisoHoraCentavos: number
  campoPiso: { value: string; onChange: (e: { target: { value: string } }) => void }
  previa: ComposicaoDaEquipe | null
  aoMudar: (id: string, alterar: (p: LinhaPessoa) => LinhaPessoa) => void
  aoAdicionar: () => void
  aoRemover: (id: string) => void
  aoVoltar: () => void
}) {
  const algumPeloPiso = linhas.some((p) => p.peloPiso)
  const pisoDigitado = lerReaisOuZero(campoPiso.value)
  const pisoFaltando = algumPeloPiso && (pisoDigitado === null || pisoDigitado === 0)
  return (
    <div className="flex flex-col gap-(--space-150)">
      <p className="max-w-3xl text-xs text-(--text-subtle)">
        Uma linha por pessoa da equipe, com o custo do mês (salário, piso ou pró-labore, com
        encargos) e as horas de trabalho no mês. A hora de custo de cada um é custo ÷ horas. Quanto
        dessas horas vira serviço é decidido em cada orçamento, ao escolher o responsável de cada
        serviço. Só membros com login entram: quem ainda não tem conta precisa ser convidado em
        Equipe.
      </p>
      {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Pessoa
              </th>
              <th scope="col" className={`${classeCabecalho} w-48`}>
                Profissão
              </th>
              <th scope="col" className={`${classeCabecalho} w-16 text-center`}>
                Sócio
              </th>
              <th scope="col" className={`${classeCabecalho} w-20 text-center`}>
                Pelo piso
              </th>
              <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                Custo mensal (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                Horas no mês
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
              const horas = lerHorasDoMes(p.horas)
              const custo = custoDaLinha(p, pisoHoraCentavos)
              const hora =
                custo === null || horas === null
                  ? null
                  : horaDeCustoDaPessoa({
                      custoMensalCentavos: custo,
                      horasDisponiveisMes: horas,
                      socio: p.socio,
                    })
              // Cada membro uma vez: os já escolhidos em outras linhas saem da lista.
              const escolhidos = new Set(linhas.filter((x) => x.id !== p.id).map((x) => x.membroId))
              const opcoes = membros.filter((m) => !escolhidos.has(m.id))
              const membroSumiu = p.membroId !== '' && !membros.some((m) => m.id === p.membroId)
              return (
                <tr key={p.id}>
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
                  <td className={`${classeCelula} text-center`}>
                    <CaixaSelecao
                      rotulo={<span className="sr-only">Remuneração pelo piso na linha {n}</span>}
                      checked={p.peloPiso}
                      onChange={(e) => {
                        const marcado = e.target.checked
                        aoMudar(p.id, (x) => ({ ...x, peloPiso: marcado }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    {p.peloPiso ? (
                      <span className="block text-right tabular-nums">
                        {formatarCentavos(custo ?? 0)}
                        <span className="sr-only"> por mês, pelo piso, na linha {n}</span>
                      </span>
                    ) : (
                      <input
                        aria-label={`Custo mensal da linha ${n}`}
                        inputMode="decimal"
                        aria-invalid={custo === null || undefined}
                        className={`${classeCampo} text-right tabular-nums`}
                        value={p.custo}
                        onChange={(e) => {
                          const valor = e.target.value
                          aoMudar(p.id, (x) => ({ ...x, custo: valor }))
                        }}
                      />
                    )}
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Horas no mês da linha ${n}`}
                      inputMode="numeric"
                      placeholder="173"
                      aria-invalid={horas === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={p.horas}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, horas: valor }))
                      }}
                    />
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums text-(--text-subtle)`}>
                    {hora === null ? '—' : formatarCentavos(hora)}
                    <span className="sr-only"> por hora, na linha {n}</span>
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
      {algumPeloPiso ? (
        <div className="flex flex-col gap-(--space-075)">
          <Linha
            id="base-piso"
            rotulo="Piso por hora (R$)"
            apoio="Pelo piso: custo do mês = horas no mês × piso por hora. Confirme o valor com o contador."
          >
            <input
              id="base-piso"
              inputMode="decimal"
              aria-invalid={pisoFaltando || undefined}
              aria-describedby={pisoFaltando ? 'base-piso-falta' : undefined}
              className={`${classeCampo} text-right tabular-nums`}
              {...campoPiso}
            />
          </Linha>
          {pisoFaltando ? (
            <p id="base-piso-falta" className="text-xs text-(--text-danger)">
              Informe o piso por hora: sem ele, o custo de quem está pelo piso fica zero.
            </p>
          ) : null}
          <details className="max-w-3xl text-xs text-(--text-subtle)">
            <summary className="w-fit cursor-pointer text-(--text-link) hover:underline">
              Como calcular o piso por hora
            </summary>
            <p className="mt-(--space-075)">
              Referência: piso de engenheiro (Lei 4.950-A/66), 6 salários mínimos para 6 h por dia.
              Para 8 h por dia, as 2 horas a mais têm 25% de acréscimo, o que dá 8,5 salários
              mínimos por mês. Por hora: piso do mês ÷ horas do mês (40 h por semana são cerca de
              173,33 h). Atualize quando o salário mínimo mudar e confirme a conta com o contador.
            </p>
          </details>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Botao aparencia="link" iconeAntes="plus" onClick={aoAdicionar}>
          Adicionar pessoa
        </Botao>
        <Botao aparencia="link" onClick={aoVoltar}>
          Digitar hora técnica e horas
        </Botao>
      </div>
      <dl
        aria-label="Resultado da equipe"
        className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo"
      >
        <dt className="text-(--text-subtle)">Hora técnica média (custo ÷ horas da equipe)</dt>
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
            <dt className="text-(--text-subtle)">Hora técnica de {c.profissao}</dt>
            <dd className="text-right tabular-nums">{formatarReais(c.horaTecnicaCentavos)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="max-w-3xl text-xs text-(--text-subtle)">
        No orçamento, o custo de cada serviço usa a hora do responsável. Sem responsável, vale a
        hora da profissão da hora de venda escolhida; sem ninguém dessa profissão, a média da
        equipe.
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
          Conta sem valor conta como zero. Cada orçamento mostra quanto cobre de cada conta.
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
