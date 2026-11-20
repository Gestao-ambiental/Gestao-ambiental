import {
  formatarHoras,
  formatarReais,
  hojeNoFuso,
  mesesDoResumo,
  proporcao,
  rotuloDoMes,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import { obterResumoDoMes, type ResumoDoMes } from '@/lib/api/indicadores-de-valor'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

type Rumo = 'subiu' | 'desceu' | 'igual'

/** Comparação escrita com o mês anterior: a palavra diz o rumo, a cor só reforça. */
function Variacao({ diferenca, texto }: { diferenca: number; texto: string }) {
  const rumo: Rumo = diferenca > 0 ? 'subiu' : diferenca < 0 ? 'desceu' : 'igual'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-(--e-1) corpo-medio numero',
        rumo === 'subiu' && 'text-(--ok-texto)',
        rumo === 'desceu' && 'text-(--alerta-texto)',
        rumo === 'igual' && 'text-(--tinta-2)',
      )}
    >
      {rumo === 'igual' ? null : (
        <Icone nome={rumo === 'subiu' ? 'chevron-up' : 'chevron-down'} tamanho={16} />
      )}
      <span>
        {rumo === 'igual'
          ? 'Igual ao mês anterior'
          : `${rumo === 'subiu' ? 'Subiu' : 'Desceu'} ${texto} contra o mês anterior`}
      </span>
    </span>
  )
}

/** Uma casa do placar: número de 40px, rótulo embaixo, detalhe e comparação. */
function Casa({
  rotulo,
  valor,
  vazio,
  extra,
  variacao,
}: {
  rotulo: string
  valor: string
  /** Sem número para mostrar ("Juntando dados", "Sem entregas"): fica em tinta clara. */
  vazio?: boolean
  extra?: ReactNode
  variacao: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-(--e-1) px-(--e-5) py-(--e-5)">
      {/* dt antes do dd no HTML; na tela, o número vem primeiro (placar). */}
      <dt className="order-2 corpo-medio text-(--tinta-2)">{rotulo}</dt>
      <dd
        className={cn(
          'order-1',
          vazio ? 'titulo-painel text-(--tinta-3)' : 'numero-grande text-(--tinta)',
        )}
      >
        {valor}
      </dd>
      {extra ? (
        <dd className="order-3 flex flex-wrap items-center gap-(--e-2) corpo numero">{extra}</dd>
      ) : null}
      {variacao ? <dd className="order-4 mt-(--e-2)">{variacao}</dd> : null}
    </div>
  )
}

function Placar({ atual, anterior }: { atual: ResumoDoMes; anterior: ResumoDoMes | undefined }) {
  const noPrazo = proporcao(atual.prazoCumpridas, atual.prazoPrevistas)
  const noPrazoAntes = anterior ? proporcao(anterior.prazoCumpridas, anterior.prazoPrevistas) : null
  const horasVisiveis = !atual.juntandoDados
  const pontos =
    noPrazo !== null && noPrazoAntes !== null ? Math.round((noPrazo - noPrazoAntes) * 100) : null
  const diferencaHoras = horasVisiveis && anterior ? atual.horasTotal - anterior.horasTotal : null
  const diferencaRenovacoes = anterior
    ? atual.renovacoesProtegidas - anterior.renovacoesProtegidas
    : null

  return (
    <dl className="flex flex-col divide-y overflow-hidden rounded-(--raio-painel) border bg-(--folha) md:flex-row md:divide-x md:divide-y-0">
      <Casa
        rotulo="Horas devolvidas à equipe"
        valor={horasVisiveis ? formatarHoras(atual.horasTotal) : 'Juntando dados'}
        vazio={!horasVisiveis}
        extra={
          horasVisiveis && (atual.reaisCentavos !== null || atual.horasEstimadas) ? (
            <>
              {atual.reaisCentavos !== null ? formatarReais(atual.reaisCentavos) : null}
              {atual.horasEstimadas ? <Selo tom="revisao">Estimado</Selo> : null}
            </>
          ) : null
        }
        variacao={
          diferencaHoras === null ? null : (
            <Variacao
              diferenca={diferencaHoras}
              texto={`${decimal.format(Math.abs(diferencaHoras))} h`}
            />
          )
        }
      />
      <Casa
        rotulo="Entregas no prazo"
        valor={noPrazo === null ? 'Sem entregas' : `${String(Math.round(noPrazo * 100))}%`}
        vazio={noPrazo === null}
        extra={
          noPrazo === null ? null : (
            <>
              {atual.prazoCumpridas} de {atual.prazoPrevistas}
            </>
          )
        }
        variacao={
          pontos === null ? null : (
            <Variacao diferenca={pontos} texto={`${String(Math.abs(pontos))} p.p.`} />
          )
        }
      />
      <Casa
        rotulo="Renovações protegidas pelos 120 dias"
        valor={
          atual.renovacoesVencendo === 0
            ? 'Sem vencimentos'
            : `${String(atual.renovacoesProtegidas)} de ${String(atual.renovacoesVencendo)}`
        }
        vazio={atual.renovacoesVencendo === 0}
        variacao={
          diferencaRenovacoes === null ? null : (
            <Variacao
              diferenca={diferencaRenovacoes}
              texto={String(Math.abs(diferencaRenovacoes))}
            />
          )
        }
      />
    </dl>
  )
}

/**
 * /resumo-do-mes (ADR-0027): só a Gestão, só totais da consultoria. Horas devolvidas à equipe
 * (com R$ quando há custo da hora), entregas no prazo e renovações protegidas, contra o mês
 * anterior. Seletor com o mês atual e os 5 anteriores; abre no último mês fechado.
 */
export function PaginaResumoDoMes() {
  const { atual } = useConsultoria()
  const ehGestao = atual.papel === 'gestao'
  const [meses] = useState(() => mesesDoResumo(hojeNoFuso(new Date(), atual.fuso)))
  const [mes, setMes] = useState<string>(meses[1] ?? meses[0] ?? '')

  const consulta = useQuery({
    queryKey: ['resumo-do-mes', atual.consultoriaId, mes],
    queryFn: () => obterResumoDoMes(atual.consultoriaId, mes),
    enabled: ehGestao,
  })

  if (!ehGestao) {
    return (
      <Pagina titulo="Resumo do mês">
        <SemPermissao descricao="O resumo do mês é da gestão." />
      </Pagina>
    )
  }

  const [doMes, anterior] = consulta.data ?? []

  return (
    <Pagina
      titulo="Resumo do mês"
      acao={
        <label>
          <span className="sr-only">Mês</span>
          <select
            value={mes}
            onChange={(evento) => {
              setMes(evento.target.value)
            }}
            className={`${classeSelecao} min-w-36 numero`}
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloDoMes(m)}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {consulta.isPending ? (
        <Carregando rotulo="Carregando o resumo" linhas={3} />
      ) : consulta.isError ? (
        ehSemPermissao(consulta.error) ? (
          <SemPermissao descricao="O resumo do mês é da gestão." />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o resumo."
            descricao="Verifique a conexão e tente de novo."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        )
      ) : !doMes ? (
        <EstadoVazio icone="chart-column" titulo="Sem dados neste mês" />
      ) : (
        <Placar atual={doMes} anterior={anterior} />
      )}
    </Pagina>
  )
}
