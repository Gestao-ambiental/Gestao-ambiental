import { rotuloDoMes, variacao } from '@gestao-ambiental/domain'
import type { ReactNode } from 'react'

import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import type { MetricasDoMes } from '@/lib/api/metricas-de-valor'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { HorasDevolvidas, ResumoDeTeste } from './HorasNaCentral'
import { Placar } from './Placar'
import { classeCabecalho, classeCelula, classeLinha } from './comum'
import { GRUPOS, formatarValor, formatarVariacao, semNenhumDado, useMetricasDeValor } from './valor'

/** Cartões do mês atual com a variação contra o mês anterior. */
export function CartoesDeValor({ meses }: { meses: readonly MetricasDoMes[] }) {
  const [atual, anterior] = meses
  if (!atual) return null
  return (
    <div className="flex flex-col gap-(--e-4)">
      {GRUPOS.map((grupo) => (
        <section
          key={grupo.titulo}
          aria-label={grupo.titulo}
          className="flex flex-col gap-(--e-15)"
        >
          <h3 className="corpo-medio text-(--tinta)">{grupo.titulo}</h3>
          <Placar
            colunas={4}
            casas={grupo.metricas.map((metrica) => {
              const valor = metrica.valor(atual)
              const mudanca = formatarVariacao(
                variacao(valor, anterior ? metrica.valor(anterior) : null),
                metrica.unidade,
              )
              return {
                rotulo: metrica.rotulo,
                valor: formatarValor(valor, metrica.unidade),
                detalhe: mudanca ? (
                  <span aria-label={`${mudanca} contra o mês anterior`}>{mudanca} no mês</span>
                ) : undefined,
              }
            })}
          />
        </section>
      ))}
    </div>
  )
}

/** Uma linha por métrica, uma coluna por mês (atual primeiro). Rola na própria região. */
export function TabelaDeValor({ meses }: { meses: readonly MetricasDoMes[] }) {
  return (
    <div
      role="region"
      aria-label="Métricas por mês"
      className="overflow-x-auto rounded-(--raio-painel) border bg-(--folha)"
    >
      <table className="w-full border-collapse corpo">
        <thead>
          <tr>
            <th scope="col" className={classeCabecalho}>
              Métrica
            </th>
            {meses.map((m) => (
              <th key={m.mes} scope="col" className={`${classeCabecalho} text-right`}>
                {rotuloDoMes(m.mes)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRUPOS.flatMap((grupo) => grupo.metricas).map((metrica) => (
            <tr key={metrica.rotulo} className={`${classeLinha} last:[&>th]:border-b-0`}>
              <th scope="row" className={`${classeCelula} text-left font-normal whitespace-nowrap`}>
                {metrica.rotulo}
              </th>
              {meses.map((m) => (
                <td key={m.mes} className={`${classeCelula} text-right whitespace-nowrap numero`}>
                  {formatarValor(metrica.valor(m), metrica.unidade)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EstadoDasMetricas({
  consulta,
  children,
}: {
  consulta: ReturnType<typeof useMetricasDeValor>
  children: (meses: MetricasDoMes[]) => ReactNode
}) {
  if (consulta.isPending) return <Carregando rotulo="Carregando as métricas" linhas={4} />
  if (consulta.isError) {
    if (ehDoisFatoresNecessarios(consulta.error)) return <RelerDoisFatores />
    if (ehSemPermissao(consulta.error)) return <SemPermissao descricao={null} />
    return (
      <EstadoErro
        titulo="Não foi possível carregar as métricas."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  if (semNenhumDado(consulta.data)) return <EstadoVazio titulo="Sem dados no período" />
  return <>{children(consulta.data)}</>
}

/** Seção curta do detalhe da consultoria: só os cartões dela. */
export function ValorDaConsultoria({ consultoriaId }: { consultoriaId: string }) {
  const consulta = useMetricasDeValor(consultoriaId)
  return (
    <section aria-labelledby="central-valor" className="flex flex-col gap-(--e-3)">
      <h2 id="central-valor" className="titulo-secao text-(--tinta)">
        Valor
      </h2>
      <HorasDevolvidas consultoriaId={consultoriaId} />
      <ResumoDeTeste consultoriaId={consultoriaId} />
      <EstadoDasMetricas consulta={consulta}>
        {(meses) => <CartoesDeValor meses={meses} />}
      </EstadoDasMetricas>
    </section>
  )
}
