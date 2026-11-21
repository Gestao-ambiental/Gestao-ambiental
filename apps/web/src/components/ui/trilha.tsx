import { cn } from '@/lib/utils'

import { Icone } from './icone'

export interface PassoDaTrilha {
  id: string
  titulo: string
  /** Resumo curto do passo (ex.: "3 serviços"). Some no celular. */
  detalhe?: string
}

/**
 * Trilha como linha de trajeto: estações ligadas por uma linha de 3px. Feito = estação cheia com
 * check e linha contínua; atual = estação verde com aro e rótulo forte (aria-current="step");
 * futuro = estação vazada e linha tracejada. A forma da linha também diz o estado, não só a cor.
 * Com `aoEscolher`, os passos viram botões (só os que `podeEscolher` aceitar, se informado).
 * `compactaNoCelular` mostra no celular só as estações e o nome do passo atual.
 */
export function Trilha({
  rotulo,
  passos,
  atual,
  aoEscolher,
  podeEscolher,
  compactaNoCelular = false,
  className,
}: {
  rotulo: string
  passos: readonly PassoDaTrilha[]
  /** Índice do passo atual (0 é o primeiro). */
  atual: number
  aoEscolher?: (indice: number) => void
  podeEscolher?: (indice: number) => boolean
  compactaNoCelular?: boolean
  className?: string
}) {
  return (
    <nav aria-label={rotulo} className={className}>
      <ol className="flex items-center gap-(--e-2)">
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
                  'inline-flex size-7 shrink-0 items-center justify-center rounded-(--raio-redondo) text-xs font-[800] numero',
                  // Ao avançar, a estação nova "acende": preenche de verde (só a cor, sem movimento).
                  estado === 'atual' &&
                    'acender bg-(--sinal) text-(--sinal-texto) shadow-[0_0_0_2px_var(--folha),0_0_0_4px_var(--marca-linha)]',
                  estado === 'feito' && 'bg-(--estacao-feita) text-(--folha)',
                  estado === 'futuro' &&
                    'border-2 border-(--regra-forte) bg-(--folha) text-(--tinta-2)',
                )}
              >
                {estado === 'feito' ? <Icone nome="check" tamanho={12} /> : indice + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  'flex min-w-0 flex-col text-left',
                  compactaNoCelular && estado !== 'atual' && 'max-md:hidden',
                )}
              >
                <span
                  className={cn(
                    'truncate',
                    estado === 'atual' ? 'corpo-medio text-(--tinta)' : 'corpo text-(--tinta-2)',
                    estado === 'feito' && 'text-(--tinta)',
                  )}
                >
                  {passo.titulo}
                </span>
                {passo.detalhe ? (
                  <span className="hidden truncate text-xs text-(--tinta-2) sm:block">
                    {passo.detalhe}
                  </span>
                ) : null}
              </span>
            </>
          )
          return (
            <li key={passo.id} className="flex min-w-0 flex-1 items-center gap-(--e-2)">
              {aoEscolher && (podeEscolher?.(indice) ?? true) ? (
                <button
                  type="button"
                  aria-current={estado === 'atual' ? 'step' : undefined}
                  aria-label={nome}
                  className="flex min-w-0 cursor-pointer items-center gap-(--e-2) rounded-(--raio) px-(--e-1) py-(--e-1) transicao-estado hover:bg-(--toque) focus-visible:outline-2 focus-visible:outline-(--foco)"
                  onClick={() => {
                    aoEscolher(indice)
                  }}
                >
                  {conteudo}
                </button>
              ) : (
                <span
                  aria-current={estado === 'atual' ? 'step' : undefined}
                  className="flex min-w-0 items-center gap-(--e-2) px-(--e-1) py-(--e-1)"
                >
                  <span className="sr-only">{nome}</span>
                  {conteudo}
                </span>
              )}
              {indice < passos.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'h-[3px] min-w-(--e-4) flex-1 rounded-full',
                    estado === 'feito'
                      ? 'bg-(--estacao-feita)'
                      : 'bg-[repeating-linear-gradient(90deg,var(--regra-forte)_0_6px,transparent_6px_10px)]',
                  )}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
