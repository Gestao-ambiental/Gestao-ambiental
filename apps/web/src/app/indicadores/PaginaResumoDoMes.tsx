import {
  formatarHoras,
  formatarReais,
  hojeNoFuso,
  mesesDoResumo,
  proporcao,
  rotuloDoMes,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import { Selo } from '@/components/ui/selo'
import { obterResumoDoMes, type ResumoDoMes } from '@/lib/api/indicadores-de-valor'
import { ehSemPermissao } from '@/lib/erros'

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Comparação escrita com o mês anterior, como detalhe da casa: a palavra diz o rumo ("Subiu",
 * "Desceu", "Igual"), sem seta nem cor.
 */
function variacao(diferenca: number, texto: string): string {
  if (diferenca === 0) return 'Igual ao mês anterior'
  return `${diferenca > 0 ? 'Subiu' : 'Desceu'} ${texto} contra o mês anterior`
}

function PlacarDoMes({
  atual,
  anterior,
}: {
  atual: ResumoDoMes
  anterior: ResumoDoMes | undefined
}) {
  const noPrazo = proporcao(atual.prazoCumpridas, atual.prazoPrevistas)
  const noPrazoAntes = anterior ? proporcao(anterior.prazoCumpridas, anterior.prazoPrevistas) : null
  const horasVisiveis = !atual.juntandoDados
  const pontos =
    noPrazo !== null && noPrazoAntes !== null ? Math.round((noPrazo - noPrazoAntes) * 100) : null
  const diferencaHoras = horasVisiveis && anterior ? atual.horasTotal - anterior.horasTotal : null
  const diferencaRenovacoes = anterior
    ? atual.renovacoesProtegidas - anterior.renovacoesProtegidas
    : null

  const detalheDasHoras =
    horasVisiveis &&
    (atual.reaisCentavos !== null || atual.horasEstimadas || diferencaHoras !== null) ? (
      <>
        {atual.reaisCentavos !== null ? <span>{formatarReais(atual.reaisCentavos)}</span> : null}
        {atual.horasEstimadas ? <Selo tom="revisao">Estimado</Selo> : null}
        {diferencaHoras === null ? null : (
          <span className="basis-full">
            {variacao(diferencaHoras, `${decimal.format(Math.abs(diferencaHoras))} h`)}
          </span>
        )}
      </>
    ) : undefined

  return (
    <Placar rotulo="Resumo do mês">
      <ItemDoPlacar
        rotulo="Horas devolvidas à equipe"
        valor={horasVisiveis ? formatarHoras(atual.horasTotal) : 'Juntando dados'}
        apagado={!horasVisiveis}
        detalhe={detalheDasHoras}
      />
      <ItemDoPlacar
        rotulo="Entregas no prazo"
        valor={noPrazo === null ? 'Sem entregas' : `${String(Math.round(noPrazo * 100))}%`}
        apagado={noPrazo === null}
        detalhe={
          noPrazo === null ? undefined : (
            <>
              <span>
                {atual.prazoCumpridas} de {atual.prazoPrevistas}
              </span>
              {pontos === null ? null : (
                <span className="basis-full">
                  {variacao(pontos, `${String(Math.abs(pontos))} p.p.`)}
                </span>
              )}
            </>
          )
        }
      />
      <ItemDoPlacar
        rotulo="Renovações protegidas pelos 120 dias"
        valor={
          atual.renovacoesVencendo === 0
            ? 'Sem vencimentos'
            : `${String(atual.renovacoesProtegidas)} de ${String(atual.renovacoesVencendo)}`
        }
        apagado={atual.renovacoesVencendo === 0}
        detalhe={
          diferencaRenovacoes === null
            ? undefined
            : variacao(diferencaRenovacoes, String(Math.abs(diferencaRenovacoes)))
        }
      />
    </Placar>
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
        <PlacarDoMes atual={doMes} anterior={anterior} />
      )}
    </Pagina>
  )
}
