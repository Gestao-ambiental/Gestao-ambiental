import {
  acrescimoEquivalente,
  composicaoDaEquipe,
  custoFixoPorHora,
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
  type ComposicaoDaEquipe,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

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
  type PessoaDaBase,
} from '@/lib/api/orcamentos'
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
}

/** Pessoa ou perfil da equipe, com os números como texto enquanto a pessoa digita. */
interface LinhaPessoa {
  id: string
  descricao: string
  socio: boolean
  custo: string
  horas: string
  aproveitamento: string
  parteTecnica: string
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

function linhasDe(base: BaseDeCustosDaConsultoria | null): LinhaPessoa[] {
  return (base?.equipe ?? []).map((p) => ({
    id: p.id,
    descricao: p.descricao,
    socio: p.socio,
    custo: formatarCentavos(p.custoMensalCentavos),
    horas: String(p.horasDisponiveisMes),
    aproveitamento: textoDoPercentual(p.aproveitamentoPb),
    parteTecnica: textoDoPercentual(p.parteTecnicaPb),
  }))
}

function novaPessoa(): LinhaPessoa {
  return {
    id: crypto.randomUUID(),
    descricao: '',
    socio: false,
    custo: '',
    horas: '',
    aproveitamento: '',
    parteTecnica: '100',
  }
}

/** Horas disponíveis no mês: inteiro de 0 a 744; vazio é zero. */
function lerHorasDoMes(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return 0
  if (!/^\d{1,3}$/.test(limpo)) return null
  const horas = Number(limpo)
  return horas <= 744 ? horas : null
}

/** Lê a equipe digitada. Devolve a primeira mensagem de erro, se houver. */
function lerEquipe(linhas: readonly LinhaPessoa[]): PessoaDaBase[] | string {
  const equipe: PessoaDaBase[] = []
  for (const [indice, l] of linhas.entries()) {
    const n = String(indice + 1)
    const custo = lerReaisOuZero(l.custo)
    const horas = lerHorasDoMes(l.horas)
    const aproveitamento = lerPercentual(l.aproveitamento || '0')
    const parteTecnica = lerPercentual(l.parteTecnica || '0')
    if (!l.descricao.trim()) return `Equipe, linha ${n}: informe a pessoa ou o perfil.`
    if (custo === null) return `Equipe, linha ${n}: custo mensal inválido.`
    if (horas === null) return `Equipe, linha ${n}: horas no mês de 0 a 744.`
    if (aproveitamento === null || parteTecnica === null)
      return `Equipe, linha ${n}: percentuais vão de 0 a 100.`
    equipe.push({
      id: l.id,
      descricao: l.descricao.trim(),
      socio: l.socio,
      custoMensalCentavos: custo,
      horasDisponiveisMes: horas,
      aproveitamentoPb: aproveitamento,
      parteTecnicaPb: parteTecnica,
    })
  }
  return equipe
}

function composicaoDe(equipe: readonly PessoaDaBase[]): ComposicaoDaEquipe {
  return composicaoDaEquipe(
    equipe.map((p) => ({
      custoMensalCentavos: p.custoMensalCentavos,
      horasDisponiveisMes: p.horasDisponiveisMes,
      aproveitamentoPb: p.aproveitamentoPb,
      parteTecnicaPb: p.parteTecnicaPb,
      socio: p.socio,
    })),
  )
}

function lerCampos(
  c: Campos,
  linhas: readonly LinhaPessoa[],
): { base: BaseDeCustosDaConsultoria; composicao: ComposicaoDaEquipe | null } | string {
  const custosFixos = lerReaisOuZero(c.custosFixos)
  const taxaPorCobranca = lerReaisOuZero(c.taxaPorCobranca)
  const taxaPorAssinatura = lerReaisOuZero(c.taxaPorAssinatura)
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
      return 'A equipe precisa de horas faturáveis: informe o aproveitamento de quem faz trabalho técnico.'
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
      custosFixosEquipeCentavos: composicao?.custoAdministrativoCentavos ?? 0,
      horasFaturaveisMes: horas,
      margemDesejadaPb: margemDesejada,
      margemMinimaPb: margemMinima,
      tributosPb: tributos,
      taxasPb: taxas,
      taxaPorCobrancaCentavos: taxaPorCobranca,
      taxaPorAssinaturaCentavos: taxaPorAssinatura,
      equipe,
    },
  }
}

/**
 * /configuracoes/custos (onda 5). Base do preço sugerido: hora técnica, custos fixos e
 * capacidade (rateio por hora), margens, tributos e taxas. Só a Gestão. Rascunhos passam a usar
 * a base nova ao serem salvos; propostas enviadas guardam a que usaram.
 *
 * A hora técnica e as horas faturáveis podem ser digitadas ou calculadas pela equipe (P9 e P10,
 * aprovadas em 11/11/2026): cada custo entra uma vez, a parte técnica na hora e o resto no rateio.
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
  const [c, setC] = useState<Campos>(() => camposDe(base))
  const [equipe, setEquipe] = useState<LinhaPessoa[]>(() => linhasDe(base))
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const pelaEquipe = equipe.length > 0
  const lido = lerCampos(c, equipe)
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
      const fixos = lerReaisOuZero(c.custosFixos) ?? 0
      setC((a) => ({
        ...a,
        horaTecnica: formatarCentavos(hora),
        horas: textoDasHoras(horas),
        custosFixos: formatarCentavos(fixos + previa.custoAdministrativoCentavos),
      }))
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

      <div className="overflow-hidden rounded-(--radius) border bg-(--surface)">
        <Grupo titulo="Custos e capacidade">
          {pelaEquipe ? (
            <Equipe
              linhas={equipe}
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
          <Linha
            id="base-fixos"
            rotulo={pelaEquipe ? 'Outros custos fixos por mês (R$)' : 'Custos fixos por mês (R$)'}
            apoio={
              pelaEquipe
                ? 'Aluguel, energia, internet, sistemas, contabilidade. Sem a remuneração de quem está na equipe'
                : 'Aluguel, energia, internet, sistemas, contabilidade e o pró-labore que não está na hora técnica'
            }
          >
            <input
              id="base-fixos"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('custosFixos')}
            />
          </Linha>
          <p className="corpo text-(--text-subtle)">
            Rateio por hora estimada:{' '}
            <span className="corpo-medio text-(--text)">
              {porHora === null ? 'pendente' : `${formatarReais(porHora)} por hora`}
            </span>
          </p>
        </Grupo>

        <Grupo titulo="Margens">
          <Linha
            id="base-margem"
            rotulo="Margem desejada (%)"
            apoio={
              margem === null || margem >= 10_000
                ? 'Sobre o preço de venda'
                : `Sobre o preço de venda · equivale a ${formatarPontosBase(acrescimoEquivalente(margem))} sobre o custo`
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
  previa,
  aoMudar,
  aoAdicionar,
  aoRemover,
  aoVoltar,
}: {
  linhas: LinhaPessoa[]
  previa: ComposicaoDaEquipe | null
  aoMudar: (id: string, alterar: (p: LinhaPessoa) => LinhaPessoa) => void
  aoAdicionar: () => void
  aoRemover: (id: string) => void
  aoVoltar: () => void
}) {
  return (
    <div className="flex flex-col gap-(--space-150)">
      <p className="max-w-3xl text-xs text-(--text-subtle)">
        Uma linha por pessoa ou perfil, com remuneração ou pró-labore, encargos e benefícios do mês,
        como informado pela contabilidade. Cada pessoa entra uma vez só: a parte técnica do custo
        forma a hora técnica e o resto (gestão, comercial, administrativo) vai para o rateio. Horas
        pagas incluem períodos que não viram serviço vendido; o aproveitamento é a parte das horas
        disponíveis que você espera recuperar nos serviços.
      </p>
      {/* relative: textos sr-only (absolutos) ficam presos à área que rola, não à página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Pessoa ou perfil
              </th>
              <th scope="col" className={`${classeCabecalho} w-16 text-center`}>
                Sócio
              </th>
              <th scope="col" className={`${classeCabecalho} w-36 text-right`}>
                Custo mensal (R$)
              </th>
              <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                Horas no mês
              </th>
              <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                Aproveitamento (%)
              </th>
              <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                Parte técnica (%)
              </th>
              <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
                Faturáveis
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
              const aproveitamento = lerPercentual(p.aproveitamento || '0')
              const parte = lerPercentual(p.parteTecnica || '0')
              const faturaveis =
                horas === null || aproveitamento === null
                  ? null
                  : Math.round((horas * aproveitamento) / 100) / 100
              return (
                <tr key={p.id}>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Pessoa ou perfil ${n}`}
                      placeholder="Ex.: Analista ambiental"
                      className={classeCampo}
                      value={p.descricao}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, descricao: valor }))
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
                    <input
                      aria-label={`Custo mensal da linha ${n}`}
                      inputMode="decimal"
                      aria-invalid={lerReaisOuZero(p.custo) === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={p.custo}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, custo: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Horas no mês da linha ${n}`}
                      inputMode="numeric"
                      placeholder="168"
                      aria-invalid={horas === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={p.horas}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, horas: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Aproveitamento da linha ${n}`}
                      inputMode="decimal"
                      aria-invalid={aproveitamento === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={p.aproveitamento}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, aproveitamento: valor }))
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <input
                      aria-label={`Parte técnica da linha ${n}`}
                      inputMode="decimal"
                      aria-invalid={parte === null || undefined}
                      className={`${classeCampo} text-right tabular-nums`}
                      value={p.parteTecnica}
                      onChange={(e) => {
                        const valor = e.target.value
                        aoMudar(p.id, (x) => ({ ...x, parteTecnica: valor }))
                      }}
                    />
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums text-(--text-subtle)`}>
                    {faturaveis === null ? '—' : `${textoDasHoras(faturaveis)} h`}
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
          Adicionar pessoa ou perfil
        </Botao>
        <Botao aparencia="link" onClick={aoVoltar}>
          Digitar hora técnica e horas
        </Botao>
      </div>
      <dl
        aria-label="Resultado da equipe"
        className="grid max-w-xl grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075) corpo"
      >
        <dt className="text-(--text-subtle)">Hora técnica (custo técnico ÷ horas faturáveis)</dt>
        <dd className="text-right tabular-nums">
          {previa?.horaTecnicaCentavos == null
            ? 'pendente'
            : formatarReais(previa.horaTecnicaCentavos)}
        </dd>
        <dt className="text-(--text-subtle)">Horas faturáveis por mês</dt>
        <dd className="text-right tabular-nums">
          {previa ? `${textoDasHoras(previa.horasFaturaveisMes)} h` : 'pendente'}
        </dd>
        <dt className="text-(--text-subtle)">Parte administrativa, somada ao rateio</dt>
        <dd className="text-right tabular-nums">
          {previa ? formatarReais(previa.custoAdministrativoCentavos) : 'pendente'}
        </dd>
        <dt className="text-(--text-subtle)">Remuneração dos sócios (pró-labore)</dt>
        <dd className="text-right tabular-nums">
          {previa ? formatarReais(previa.remuneracaoDosSociosCentavos) : 'pendente'}
        </dd>
      </dl>
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
