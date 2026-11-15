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
import { Selo } from '@/components/ui/selo'
import { obterResumoDoMes, type ResumoDoMes } from '@/lib/api/indicadores-de-valor'
import { ehSemPermissao } from '@/lib/erros'

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function comSinal(texto: string, numero: number): string {
  if (numero > 0) return `+${texto}`
  if (numero < 0) return `−${texto}`
  return texto
}

function Cartao({
  rotulo,
  valor,
  extra,
  variacao,
}: {
  rotulo: string
  valor: string
  extra?: ReactNode
  variacao: string | null
}) {
  return (
    <div className="flex min-w-0 flex-col gap-(--space-050) rounded-(--radius-large) border bg-(--surface) p-(--space-200) shadow-cartao">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="flex flex-col gap-(--space-050)">
        <span className="titulo-tela text-(--text) tabular-nums">{valor}</span>
        {extra}
        {variacao ? (
          <span className="corpo text-(--text) tabular-nums">{variacao} contra o mês anterior</span>
        ) : null}
      </dd>
    </div>
  )
}

function Cartoes({ atual, anterior }: { atual: ResumoDoMes; anterior: ResumoDoMes | undefined }) {
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
    <dl className="grid grid-cols-1 gap-(--space-150) md:grid-cols-3">
      <Cartao
        rotulo="Horas devolvidas à equipe"
        valor={horasVisiveis ? formatarHoras(atual.horasTotal) : 'Juntando dados'}
        extra={
          horasVisiveis ? (
            <span className="flex flex-wrap items-center gap-(--space-100) corpo tabular-nums">
              {atual.reaisCentavos !== null ? formatarReais(atual.reaisCentavos) : null}
              {atual.horasEstimadas ? <Selo tom="revisao">Estimado</Selo> : null}
            </span>
          ) : null
        }
        variacao={
          diferencaHoras === null
            ? null
            : comSinal(`${decimal.format(Math.abs(diferencaHoras))} h`, diferencaHoras)
        }
      />
      <Cartao
        rotulo="Entregas no prazo"
        valor={noPrazo === null ? 'Sem entregas' : `${String(Math.round(noPrazo * 100))}%`}
        extra={
          noPrazo === null ? null : (
            <span className="corpo tabular-nums">
              {atual.prazoCumpridas} de {atual.prazoPrevistas}
            </span>
          )
        }
        variacao={pontos === null ? null : comSinal(`${String(Math.abs(pontos))} p.p.`, pontos)}
      />
      <Cartao
        rotulo="Renovações protegidas pelos 120 dias"
        valor={
          atual.renovacoesVencendo === 0
            ? 'Sem vencimentos'
            : `${String(atual.renovacoesProtegidas)} de ${String(atual.renovacoesVencendo)}`
        }
        variacao={
          diferencaRenovacoes === null
            ? null
            : comSinal(String(Math.abs(diferencaRenovacoes)), diferencaRenovacoes)
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
    <Pagina titulo="Resumo do mês">
      <label className="flex max-w-xs flex-col gap-(--space-050)">
        <span className="rotulo">Mês</span>
        <select
          value={mes}
          onChange={(evento) => {
            setMes(evento.target.value)
          }}
          className="h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text)"
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {rotuloDoMes(m)}
            </option>
          ))}
        </select>
      </label>
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
        <Cartoes atual={doMes} anterior={anterior} />
      )}
    </Pagina>
  )
}
