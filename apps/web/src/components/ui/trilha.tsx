import { cn } from '@/lib/utils'

import { Icone } from './icone'

export interface PassoDaTrilha {
  id: string
  titulo: string
  /** Resumo curto do passo (ex.: "3 serviços"). Some no celular. */
  detalhe?: string
}

/**
 * Trilha de etapas no padrão Fluent 2 (ADR-0015): passos numerados ligados por linha. O atual tem
 * aria-current="step" e texto em semibold; os anteriores levam um check. A cor nunca é o único
 * sinal. Com `aoEscolher`, cada passo é um botão e a pessoa pode ir e voltar à vontade.
 */
export function Trilha({
  rotulo,
  passos,
  atual,
  aoEscolher,
  className,
}: {
  rotulo: string
  passos: readonly PassoDaTrilha[]
  /** Índice do passo atual (0 é o primeiro). */
  atual: number
  aoEscolher?: (indice: number) => void
  className?: string
}) {
  return (
    <nav aria-label={rotulo} className={className}>
      <ol className="flex items-center gap-(--space-100)">
        {passos.map((passo, indice) => {
          const estado = indice === atual ? 'atual' : indice < atual ? 'feito' : 'futuro'
          // Nome falado de uma vez ("Serviços, concluída, 3 serviços"): o visual fica aria-hidden.
          const nome = [passo.titulo, estado === 'feito' ? 'concluída' : null, passo.detalhe]
            .filter(Boolean)
            .join(', ')
          const conteudo = (
            <>
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-pill) text-xs font-semibold tabular-nums',
                  estado === 'atual' && 'bg-(--brand) text-(--text-inverse)',
                  estado === 'feito' && 'bg-(--brand-subtle) text-(--text-brand)',
                  estado === 'futuro' && 'border border-(--border-strong) text-(--text-subtle)',
                )}
              >
                {estado === 'feito' ? <Icone nome="check" tamanho={12} /> : indice + 1}
              </span>
              <span aria-hidden className="flex min-w-0 flex-col text-left">
                <span
                  className={cn(
                    'truncate',
                    estado === 'atual' ? 'corpo-medio text-(--text)' : 'corpo text-(--text-subtle)',
                  )}
                >
                  {passo.titulo}
                </span>
                {passo.detalhe ? (
                  <span className="hidden truncate text-xs text-(--text-subtle) sm:block">
                    {passo.detalhe}
                  </span>
                ) : null}
              </span>
            </>
          )
          return (
            <li key={passo.id} className="flex min-w-0 flex-1 items-center gap-(--space-100)">
              {aoEscolher ? (
                <button
                  type="button"
                  aria-current={estado === 'atual' ? 'step' : undefined}
                  aria-label={nome}
                  className="flex min-w-0 cursor-pointer items-center gap-(--space-100) rounded-(--radius) px-(--space-050) py-(--space-050) transicao-estado hover:bg-(--neutral-subtle-hover) focus-visible:outline-2 focus-visible:outline-(--border-focus)"
                  onClick={() => {
                    aoEscolher(indice)
                  }}
                >
                  {conteudo}
                </button>
              ) : (
                <span
                  aria-current={estado === 'atual' ? 'step' : undefined}
                  className="flex min-w-0 items-center gap-(--space-100) px-(--space-050) py-(--space-050)"
                >
                  <span className="sr-only">{nome}</span>
                  {conteudo}
                </span>
              )}
              {indice < passos.length - 1 ? (
                <span
                  aria-hidden
                  className="h-px min-w-(--space-200) flex-1 bg-(--border-strong)"
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
