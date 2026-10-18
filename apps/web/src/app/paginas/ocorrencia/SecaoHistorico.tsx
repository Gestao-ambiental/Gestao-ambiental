import type { EventoDoHistorico } from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'

function textoDoEvento(evento: EventoDoHistorico): string {
  const v = evento.evidenciaNumero === null ? '' : ` v${String(evento.evidenciaNumero)}`
  const detalhe = evento.detalhe ?? ''
  switch (evento.tipo) {
    case 'etapa_criada':
      return `criou a etapa “${detalhe}”`
    case 'etapa_concluida':
      return `concluiu a etapa “${detalhe}”`
    case 'evidencia_enviada':
      return `enviou a evidência${v} para conferência`
    case 'evidencia_aprovada':
      return `aprovou a evidência${v}`
    case 'evidencia_devolvida':
      return `devolveu a evidência${v}: “${detalhe}”`
    case 'conferente_designado':
      return detalhe ? `designou ${detalhe} como conferente` : 'retirou o conferente designado'
    case 'concluida':
      return 'concluiu a ocorrência'
    case 'concluida_sem_evidencia':
      return `concluiu sem evidência: “${detalhe}”`
    case 'reaberta':
      return `reabriu a ocorrência: “${detalhe}”`
    default:
      return evento.tipo
  }
}

/** Histórico da ocorrência (DEM-03, DEM-04): quem fez o quê e quando, mais recente primeiro. */
export function SecaoHistorico({
  eventos,
  fuso,
}: {
  eventos: readonly EventoDoHistorico[]
  fuso: string
}) {
  return (
    <section aria-labelledby="titulo-historico" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-historico" className="rotulo-maiusculo text-(--text-subtle)">
        Histórico
      </h2>
      {eventos.length === 0 ? (
        <p className="text-xs text-(--text-subtle)">Nada registrado ainda.</p>
      ) : (
        <ol className="flex flex-col gap-(--space-075)">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex flex-col">
              <span className="corpo">
                <span className="corpo-medio">{evento.atorNome ?? 'Sistema'}</span>{' '}
                {textoDoEvento(evento)}
              </span>
              <span className="text-xs text-(--text-subtle)">
                {formatarInstanteComHora(evento.instante, fuso)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
