import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { listarConsultoriasDaCentral } from '@/lib/api/central'

import { HorasDevolvidas, ResumoDeTeste } from './HorasNaCentral'
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
    <Pagina
      titulo="Valor"
      acao={
        <label className="flex min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">Consultoria</span>
          <select
            value={consultoriaId ?? ''}
            onChange={(evento) => {
              const nova = evento.target.value
              setParametros(nova ? { consultoria: nova } : {}, { replace: true })
            }}
            className={`${classeSelecao} max-sm:w-full max-sm:max-w-none`}
          >
            <option value="">Todas</option>
            {(consultorias.data?.itens ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <HorasDevolvidas consultoriaId={consultoriaId} />
      {consultoriaId ? <ResumoDeTeste consultoriaId={consultoriaId} /> : null}
      <EstadoDasMetricas consulta={metricas}>
        {(meses) => (
          <>
            <section aria-labelledby="valor-mes-atual" className="flex flex-col gap-(--e-3)">
              <h2 id="valor-mes-atual" className="titulo-secao text-(--tinta)">
                Mês atual
              </h2>
              <CartoesDeValor meses={meses} />
            </section>
            <section aria-labelledby="valor-por-mes" className="flex flex-col gap-(--e-3)">
              <h2 id="valor-por-mes" className="titulo-secao text-(--tinta)">
                Por mês
              </h2>
              <TabelaDeValor meses={meses} />
            </section>
          </>
        )}
      </EstadoDasMetricas>
    </Pagina>
  )
}
