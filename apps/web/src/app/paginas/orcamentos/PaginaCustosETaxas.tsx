import {
  acrescimoEquivalente,
  custoFixoPorHora,
  custoHoraPorProfissao,
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
  linhasMensaisDaEquipe,
  type ComposicaoDaEquipe,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  obterBaseDeCustos,
  salvarBaseDeCustos,
  type BaseDeCustosDaConsultoria,
  type PessoaDaBase,
} from '@/lib/api/orcamentos'
import { listarMembrosAtivos } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import {
  lerHoras,
  lerPercentual,
  lerReaisOuZero,
  textoDasHoras,
  textoDoPercentual,
} from './calculo'
import {
  camposDeDeslocamentoDe,
  composicaoDe,
  lerContas,
  lerDeslocamento,
  lerEquipe,
  lerHorasDeVenda,
  linhasDeContaDe,
  linhasDePessoaDe,
  linhasDePrecoDe,
  novaPessoa,
  profissoesDosMembros,
  type CamposDeDeslocamento,
  type LinhaConta,
  type LinhaHora,
  type LinhaPessoa,
} from './campos-da-base'
import { classeCampo, reaisDigitados } from './comum'
import { AvisoDeMargemBaixa, ContasDoMes, Equipe, Grupo, Linha } from './PecasDaBase'
import { Deslocamento, TabelaDePrecos } from './PecasDeCobranca'

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
}

/** Campos em reais: mostram o ponto de milhar enquanto a pessoa digita. */
const CAMPOS_EM_REAIS: ReadonlySet<keyof Campos> = new Set([
  'horaTecnica',
  'custosFixos',
  'taxaPorCobranca',
  'taxaPorAssinatura',
])

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
  }
}

function lerCampos(
  c: Campos,
  linhas: readonly LinhaPessoa[],
  linhasDeContas: readonly LinhaConta[],
  linhasDeHoras: readonly LinhaHora[],
  deslocamento: CamposDeDeslocamento,
  profissaoDoMembro: ReadonlyMap<string, string>,
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
  // Visita e km: só os campos do modo escolhido; em branco, 0 ("não cadastrado").
  const visitas = lerDeslocamento(deslocamento)
  if (typeof visitas === 'string') return visitas
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
    const lida = lerEquipe(linhas, profissaoDoMembro)
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
      valorVisitaCentavos: visitas.valorVisitaCentavos ?? 0,
      custoKmCentavos: visitas.custoKmCentavos,
      deslocamentoModo: visitas.deslocamentoModo,
      consumoKmPorLitro: visitas.consumoKmPorLitro,
      precoCombustivelCentavos: visitas.precoCombustivelCentavos,
      acrescimoKmCentavos: visitas.acrescimoKmCentavos,
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
  const [equipe, setEquipe] = useState<LinhaPessoa[]>(() => linhasDePessoaDe(base?.equipe ?? []))
  const [contas, setContas] = useState<LinhaConta[]>(() => linhasDeContaDe(base?.contas ?? []))
  const [horas, setHoras] = useState<LinhaHora[]>(() => linhasDePrecoDe(base?.horasVenda ?? []))
  // Na base, visita e km 0 querem dizer "não cadastrado": o campo fica em branco.
  const [deslocamento, setDeslocamento] = useState<CamposDeDeslocamento>(() =>
    camposDeDeslocamentoDe(base, { zeroEmBranco: true }),
  )
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Base nova: as margens vêm preenchidas só para começar. Mudar o valor ou marcar a caixa confirma.
  const [margensConfirmadas, setMargensConfirmadas] = useState(base !== null)

  const pelaEquipe = equipe.length > 0
  // A profissão de cada pessoa vem do cadastro dela em Equipe (ADR-0021).
  const profissaoDoMembro = profissoesDosMembros(membros.data ?? [])
  const lido = lerCampos(c, equipe, contas, horas, deslocamento, profissaoDoMembro)
  const custoPorProfissao = typeof lido === 'string' ? [] : lido.base.custoHoraPorProfissao
  const totalDasContas = contas.reduce((soma, l) => soma + (lerReaisOuZero(l.valor) ?? 0), 0)
  // Prévia da composição mesmo com algum campo ainda incompleto (linhas inválidas ficam de fora).
  const previa = pelaEquipe
    ? (() => {
        const lida = lerEquipe(equipe, profissaoDoMembro)
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

  // O que falta para o preço sair (ADR-0019 §5). Valor ausente nunca vira zero presumido: o
  // pré-preenchido (margens 30% e 25%) precisa de confirmação, e tributos precisam ser digitados.
  const tabelaLida = lerHorasDeVenda(horas)
  const pendencias: Pendencia[] = [
    {
      id: 'custo',
      rotulo: 'Custo da equipe',
      ancora: 'grupo-custos',
      feito: pelaEquipe
        ? previa?.horaTecnicaCentavos != null
        : (lerReaisOuZero(c.horaTecnica) ?? 0) > 0,
    },
    {
      id: 'horas',
      rotulo: 'Horas faturáveis por mês',
      ancora: 'grupo-custos',
      feito: pelaEquipe ? (previa?.horasFaturaveisMes ?? 0) > 0 : (lerHoras(c.horas) ?? 0) > 0,
    },
    {
      id: 'contas',
      rotulo: 'Contas do mês (pode ser 0, se digitar)',
      ancora: 'grupo-custos',
      feito:
        contas.length > 0 ? contas.some((l) => l.valor.trim() !== '') : c.custosFixos.trim() !== '',
    },
    {
      id: 'precos',
      rotulo: 'Tabela de preços (ao menos um profissional ou serviço)',
      ancora: 'grupo-precos',
      feito: typeof tabelaLida !== 'string' && tabelaLida.length > 0,
    },
    {
      id: 'tributos',
      rotulo: 'Tributos sobre o faturamento (pode ser 0, se digitar)',
      ancora: 'grupo-tributos',
      feito: c.tributos.trim() !== '',
    },
    {
      id: 'margens',
      rotulo: 'Margens confirmadas',
      ancora: 'grupo-margens',
      feito: margensConfirmadas,
    },
  ]

  function campo(nome: keyof Campos) {
    return {
      value: c[nome],
      onChange: (e: { target: HTMLInputElement }) => {
        const valor = CAMPOS_EM_REAIS.has(nome) ? reaisDigitados(e) : e.target.value
        setC((a) => ({ ...a, [nome]: valor }))
        if (nome === 'margemDesejada' || nome === 'margemMinima') setMargensConfirmadas(true)
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
    if (c.tributos.trim() === '') {
      setFalha('Informe os tributos sobre o faturamento (se não paga, digite 0).')
      return
    }
    if (!margensConfirmadas) {
      setFalha('Confirme as margens desejada e mínima da sua consultoria (grupo Margens).')
      return
    }
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
        <div className="flex flex-wrap items-center gap-(--space-150)">
          <Link
            to="/orcamentos/primeiros-passos"
            className="corpo-medio text-(--text-link) no-underline hover:underline"
          >
            Configurar em passos
          </Link>
          <Botao
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
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
      <FaltaConfigurar itens={pendencias} baseSalva={base !== null} />

      <div className="overflow-hidden rounded-(--radius-large) border bg-(--surface) shadow-cartao">
        <Grupo id="grupo-custos" titulo="Custos e capacidade">
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
              <div className="flex flex-col gap-(--space-075)">
                <div>
                  <Botao
                    iconeAntes="users"
                    onClick={() => {
                      setEquipe([novaPessoa()])
                      setAviso(null)
                    }}
                  >
                    Calcular pela equipe
                  </Botao>
                </div>
                <p className="max-w-3xl text-xs text-(--text-subtle)">
                  Recomendado: a hora de custo de cada pessoa sai de como ela recebe, e cada serviço
                  usa a hora do responsável. Ou digite abaixo o custo médio da hora e as horas.
                </p>
              </div>
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
            </>
          )}
          <ContasDoMes
            linhas={contas}
            total={totalDasContas}
            aoMudarLinhas={(alterar) => {
              setContas(alterar)
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

        <Grupo id="grupo-precos" titulo="Tabela de preços">
          <TabelaDePrecos
            horas={horas}
            aoMudar={(alterar) => {
              setHoras(alterar)
              setAviso(null)
            }}
          />
        </Grupo>

        <Grupo id="grupo-tributos" titulo="Tributos e taxas">
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

        <Grupo id="grupo-margens" titulo="Margens">
          {!base ? (
            <div className="flex flex-col gap-(--space-050)">
              <p className="text-xs text-(--text-subtle)">
                As margens vêm preenchidas com 30% e 25% só para começar: não são recomendação.
                Ajuste para os valores da sua consultoria ou confirme.
              </p>
              <CaixaSelecao
                rotulo="Confirmo que estas margens são da minha consultoria"
                checked={margensConfirmadas}
                onChange={(e) => {
                  setMargensConfirmadas(e.target.checked)
                  setAviso(null)
                }}
              />
            </div>
          ) : null}
          <p className="max-w-3xl text-xs text-(--text-subtle)">
            Desejada: meta usada no cálculo pela margem. Mínima: referência de alerta, não bloqueia.
            Que sobra: resultado estimado de cada orçamento depois de custos, tributos e taxas.
          </p>
          <AvisoDeMargemBaixa desejada={margem} minima={minima} />
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

        <Grupo id="grupo-visitas" titulo="Visita técnica e deslocamento">
          <Deslocamento
            campos={deslocamento}
            prefixo="base"
            aoMudar={(alterar) => {
              setDeslocamento(alterar)
              setAviso(null)
            }}
          />
        </Grupo>
      </div>
    </div>
  )
}

interface Pendencia {
  id: string
  rotulo: string
  /** id do grupo onde se resolve. */
  ancora: string
  feito: boolean
}

/**
 * "Falta configurar para calcular o preço" (ADR-0019 §5). Diz em texto o que está feito e o que
 * falta, com link para o grupo. Sem nada faltando, some (ou, na base nova, pede para salvar).
 */
function FaltaConfigurar({ itens, baseSalva }: { itens: Pendencia[]; baseSalva: boolean }) {
  const faltam = itens.filter((i) => !i.feito).length
  if (faltam === 0) {
    return baseSalva ? null : (
      <MensagemSecao role="status" tom="sucesso">
        Tudo pronto para calcular o preço. Salve para os orçamentos usarem estes valores.
      </MensagemSecao>
    )
  }
  return (
    <section
      aria-labelledby="falta-configurar"
      className="flex flex-col gap-(--space-100) rounded-(--radius-large) border bg-(--surface) p-(--space-200) shadow-cartao"
    >
      <h2 id="falta-configurar" className="corpo-medio text-(--text)">
        Falta configurar para calcular o preço
      </h2>
      <p className="text-xs text-(--text-subtle)">
        {faltam === 1 ? 'Falta 1 item.' : `Faltam ${String(faltam)} itens.`} Enquanto isso, os
        orçamentos podem ser montados, mas ficam sem preço calculado.
      </p>
      <ul className="flex flex-col gap-(--space-050) corpo">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-(--space-075)">
            <Icone
              nome={i.feito ? 'circle-check' : 'circle-alert'}
              className={i.feito ? 'text-(--text-subtle)' : 'text-(--text)'}
            />
            <span className={i.feito ? 'text-(--text-subtle)' : 'corpo-medio'}>
              {i.feito ? 'Feito' : 'Falta'}:
            </span>
            <a href={`#${i.ancora}`}>{i.rotulo}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
