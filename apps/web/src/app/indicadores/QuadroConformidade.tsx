// Quadro Conformidade do Painel (ADR-0050, LEG-10): empreendimentos com requisito legal pendente
// (ação atrasada, rever, não conforme, sem avaliação). Linhas, não números soltos; cada linha leva
// à seção de requisitos do empreendimento. Só com o recurso 'legislacao'.
import { agruparPendencias, hojeNoFuso } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursoLiberado } from '@/app/consultoria/recurso-liberado'
import { Carregando, EstadoErro } from '@/components/estados'
import { listarRequisitosDaConsultoria } from '@/lib/api/relatorio-de-normas'

function plural(n: number, um: string, varios: string): string {
  return `${String(n)} ${n === 1 ? um : varios}`
}

export function QuadroConformidade() {
  const { atual } = useConsultoria()
  const recurso = useRecursoLiberado('legislacao')
  const consulta = useQuery({
    queryKey: ['requisitos-da-consultoria', atual.consultoriaId],
    queryFn: () => listarRequisitosDaConsultoria(atual.consultoriaId),
    enabled: recurso.data === true,
  })

  if (recurso.data !== true) return null

  const pendencias = consulta.data
    ? agruparPendencias(consulta.data, hojeNoFuso(new Date(), atual.fuso), atual.fuso)
    : []

  return (
    <section aria-labelledby="titulo-conformidade" className="flex flex-col gap-(--e-2)">
      <h2 id="titulo-conformidade" className="titulo-secao text-(--tinta)">
        Conformidade
      </h2>
      {consulta.isPending ? (
        <Carregando rotulo="Carregando a conformidade" linhas={2} />
      ) : consulta.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a conformidade."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      ) : pendencias.length === 0 ? (
        <p className="corpo text-(--tinta-2)">Nenhuma pendência de requisito legal.</p>
      ) : (
        <ul aria-label="Empreendimentos com pendência de requisito legal" className="flex flex-col">
          {pendencias.map((p) => (
            <li
              key={p.empreendimentoId}
              className="flex flex-wrap items-baseline gap-x-(--e-4) gap-y-(--e-1) border-b border-(--regra-leve) py-(--e-2) last:border-b-0"
            >
              <Link
                to={`/empreendimentos/${p.empreendimentoId}#requisitos-legais`}
                className="corpo-medio text-(--tinta) hover:underline"
              >
                {p.empreendimentoNome}
              </Link>
              <span className="rotulo numero">
                {[
                  p.acaoAtrasada > 0
                    ? plural(p.acaoAtrasada, 'ação atrasada', 'ações atrasadas')
                    : null,
                  p.rever > 0 ? plural(p.rever, 'para rever', 'para rever') : null,
                  p.naoConforme > 0 ? plural(p.naoConforme, 'não conforme', 'não conformes') : null,
                  p.semAvaliacao > 0
                    ? plural(p.semAvaliacao, 'sem avaliação', 'sem avaliação')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
