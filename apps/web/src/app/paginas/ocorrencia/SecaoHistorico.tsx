import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import type { EventoDoHistorico } from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'

import { VazioDeSecao } from './pecas'

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

const VISIVEIS = 5

/**
 * Histórico da ocorrência (DEM-03, DEM-04): quem fez o quê e quando, mais recente primeiro.
 * Compacto: os cinco últimos, o resto a um clique.
 */
export function SecaoHistorico({
  eventos,
  fuso,
}: {
  eventos: readonly EventoDoHistorico[]
  fuso: string
}) {
  const [todos, setTodos] = useState(false)
  const lista = todos ? eventos : eventos.slice(0, VISIVEIS)
  return (
    <section aria-labelledby="titulo-historico" className="flex flex-col gap-(--e-2)">
      <h2 id="titulo-historico" className="titulo-secao text-(--tinta)">
        Histórico
      </h2>
      {eventos.length === 0 ? (
        <VazioDeSecao>Nada registrado ainda.</VazioDeSecao>
      ) : (
        <ol className="flex flex-col gap-(--e-2) border-l-2 border-(--regra) pl-(--e-3)">
          {lista.map((evento) => (
            <li key={evento.id} className="flex flex-col">
              <span className="text-xs text-(--tinta-3) numero">
                {formatarInstanteComHora(evento.instante, fuso)}
              </span>
              <span className="corpo text-(--tinta-2)">
                <span className="corpo-medio text-(--tinta)">{evento.atorNome ?? 'Sistema'}</span>{' '}
                {textoDoEvento(evento)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {eventos.length > VISIVEIS ? (
        <div>
          <Botao
            aparencia="link"
            onClick={() => {
              setTodos((t) => !t)
            }}
          >
            {todos ? 'Mostrar menos' : `Mostrar tudo (${String(eventos.length)})`}
          </Botao>
        </div>
      ) : null}
    </section>
  )
}
