import {
  acrescimoEquivalente,
  custoFixoPorHora,
  formatarCentavos,
  formatarPontosBase,
  formatarReais,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  obterBaseDeCustos,
  salvarBaseDeCustos,
  type BaseDeCustosDaConsultoria,
} from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import {
  lerHoras,
  lerPercentual,
  lerReaisOuZero,
  textoDasHoras,
  textoDoPercentual,
} from './calculo'
import { classeCampo } from './comum'

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

function lerCampos(c: Campos): BaseDeCustosDaConsultoria | string {
  const horaTecnica = lerReaisOuZero(c.horaTecnica)
  const custosFixos = lerReaisOuZero(c.custosFixos)
  const horas = lerHoras(c.horas)
  const taxaPorCobranca = lerReaisOuZero(c.taxaPorCobranca)
  const taxaPorAssinatura = lerReaisOuZero(c.taxaPorAssinatura)
  const margemDesejada = lerPercentual(c.margemDesejada)
  const margemMinima = lerPercentual(c.margemMinima)
  const tributos = lerPercentual(c.tributos || '0')
  const taxas = lerPercentual(c.taxas || '0')
  if (
    horaTecnica === null ||
    custosFixos === null ||
    taxaPorCobranca === null ||
    taxaPorAssinatura === null
  )
    return 'Confira os valores em reais.'
  if (horas === null || horas <= 0) return 'Informe as horas faturáveis por mês (maior que zero).'
  if (margemDesejada === null || margemMinima === null || tributos === null || taxas === null)
    return 'Percentuais vão de 0 a 100.'
  if (margemDesejada + tributos + taxas >= 10_000)
    return 'Margem, tributos e taxas somados precisam ficar abaixo de 100%.'
  return {
    horaTecnicaCentavos: horaTecnica,
    custosFixosMensaisCentavos: custosFixos,
    horasFaturaveisMes: horas,
    margemDesejadaPb: margemDesejada,
    margemMinimaPb: margemMinima,
    tributosPb: tributos,
    taxasPb: taxas,
    taxaPorCobrancaCentavos: taxaPorCobranca,
    taxaPorAssinaturaCentavos: taxaPorAssinatura,
  }
}

/**
 * /configuracoes/custos (onda 5). Base do preço sugerido: hora técnica, custos fixos e
 * capacidade (rateio por hora), margens, tributos e taxas. Só a Gestão. Rascunhos passam a usar
 * a base nova ao serem salvos; propostas enviadas guardam a que usaram.
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
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const lido = lerCampos(c)
  const porHora =
    typeof lido === 'string'
      ? null
      : custoFixoPorHora({
          horaTecnicaCentavos: lido.horaTecnicaCentavos,
          custosFixosMensaisCentavos: lido.custosFixosMensaisCentavos,
          horasFaturaveisMes: lido.horasFaturaveisMes,
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

  async function salvar() {
    if (typeof lido === 'string') {
      setFalha(lido)
      return
    }
    setFalha(null)
    setSalvando(true)
    try {
      await salvarBaseDeCustos(consultoriaId, lido)
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
          <Linha
            id="base-hora"
            rotulo="Hora técnica (R$)"
            apoio="Salários e encargos ÷ horas produtivas, sem custos fixos"
          >
            <input
              id="base-hora"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('horaTecnica')}
            />
          </Linha>
          <Linha
            id="base-fixos"
            rotulo="Custos fixos por mês (R$)"
            apoio="Aluguel, energia, internet, sistemas, contabilidade"
          >
            <input
              id="base-fixos"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('custosFixos')}
            />
          </Linha>
          <Linha id="base-horas" rotulo="Horas faturáveis por mês" apoio="Da equipe inteira">
            <input
              id="base-horas"
              inputMode="decimal"
              className={`${classeCampo} text-right tabular-nums`}
              {...campo('horas')}
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
