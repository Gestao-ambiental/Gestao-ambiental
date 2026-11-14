import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { listarConsultoriasDaCentral } from '@/lib/api/central'

import { CartoesDeValor, EstadoDasMetricas, TabelaDeValor } from './ValorNaCentral'
import { useMetricasDeValor } from './valor'

/**
 * /admin/valor: métricas de valor (etapa 1), do total ou de uma consultoria (?consultoria=…).
 * Cartões do mês atual com a variação contra o anterior e a tabela dos últimos meses.
 * Operador com dois fatores; quem recusa é o banco.
 */
export function PaginaCentralValor() {
  const [parametros, setParametros] = useSearchParams()
  const consultoriaId = parametros.get('consultoria') ?? null
  const consultorias = useQuery({
    queryKey: ['central', 'valor', 'consultorias'],
    queryFn: () => listarConsultoriasDaCentral('', null, 0),
  })
  const metricas = useMetricasDeValor(consultoriaId)

  return (
    <div className="flex flex-col gap-(--space-300)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Pagina titulo="Valor">{null}</Pagina>
        <label className="flex min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">Consultoria</span>
          <select
            value={consultoriaId ?? ''}
            onChange={(evento) => {
              const nova = evento.target.value
              setParametros(nova ? { consultoria: nova } : {}, { replace: true })
            }}
            className="h-(--size-control) w-full min-w-0 rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) sm:w-auto"
          >
            <option value="">Todas</option>
            {(consultorias.data?.itens ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <EstadoDasMetricas consulta={metricas}>
        {(meses) => (
          <>
            <section aria-labelledby="valor-mes-atual" className="flex flex-col gap-(--space-150)">
              <h2 id="valor-mes-atual" className="titulo-secao text-(--text)">
                Mês atual
              </h2>
              <CartoesDeValor meses={meses} />
            </section>
            <section aria-labelledby="valor-por-mes" className="flex flex-col gap-(--space-150)">
              <h2 id="valor-por-mes" className="titulo-secao text-(--text)">
                Por mês
              </h2>
              <TabelaDeValor meses={meses} />
            </section>
          </>
        )}
      </EstadoDasMetricas>
    </div>
  )
}
