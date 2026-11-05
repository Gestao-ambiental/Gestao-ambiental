import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

import { cn } from '@/lib/utils'

const PASSO_TECLADO = 16

/** Mantém o arraste mesmo com o ponteiro fora do divisor. Sem suporte (jsdom), segue sem. */
function capturar(evento: PointerEvent<HTMLDivElement>, ligar: boolean) {
  try {
    if (ligar) evento.currentTarget.setPointerCapture(evento.pointerId)
    else evento.currentTarget.releasePointerCapture(evento.pointerId)
  } catch {
    // Ponteiro já solto ou ambiente sem captura: nada a fazer.
  }
}

interface Props {
  /** Nome acessível, ex.: "Ajustar largura da lista". */
  rotulo: string
  /** Largura atual, em px, do painel que o divisor controla. */
  valor: number
  minimo: number
  maximo: number
  /** Largura de volta com clique duplo. */
  padrao: number
  aoMudar: (largura: number) => void
  /** Lado do painel controlado: à direita, arrastar para a direita diminui o painel. */
  painel?: 'esquerda' | 'direita'
  className?: string
}

/**
 * Divisor vertical entre painéis (Protótipo 12): arraste para ajustar, setas no teclado,
 * clique duplo volta ao padrão. Segue o padrão "window splitter" do WAI-ARIA.
 */
export function DivisorRedimensionavel({
  rotulo,
  valor,
  minimo,
  maximo,
  padrao,
  aoMudar,
  painel = 'esquerda',
  className,
}: Props) {
  const inicio = useRef<{ x: number; largura: number } | null>(null)
  const sinal = painel === 'esquerda' ? 1 : -1
  const limitar = (largura: number) => Math.round(Math.min(maximo, Math.max(minimo, largura)))

  function aoPressionar(evento: PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return
    evento.preventDefault()
    capturar(evento, true)
    inicio.current = { x: evento.clientX, largura: valor }
  }

  function aoMover(evento: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return
    aoMudar(limitar(inicio.current.largura + sinal * (evento.clientX - inicio.current.x)))
  }

  function aoSoltar(evento: PointerEvent<HTMLDivElement>) {
    inicio.current = null
    capturar(evento, false)
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    const novo = {
      ArrowLeft: valor - sinal * PASSO_TECLADO,
      ArrowRight: valor + sinal * PASSO_TECLADO,
      Home: minimo,
      End: maximo,
    }[evento.key]
    if (novo === undefined) return
    evento.preventDefault()
    aoMudar(limitar(novo))
  }

  return (
    // Separador focável é um controle (WAI-ARIA "window splitter"), não um elemento estático.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuenow={valor}
      aria-valuemin={minimo}
      aria-valuemax={maximo}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      title="Arraste para ajustar. Clique duplo volta ao padrão."
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onDoubleClick={() => {
        aoMudar(padrao)
      }}
      onKeyDown={aoTeclar}
      className={cn(
        'group relative z-10 -mx-1 w-[9px] shrink-0 cursor-col-resize touch-none outline-none transicao-estado hover:bg-[color-mix(in_srgb,var(--border-focus)_18%,transparent)] focus-visible:shadow-[inset_0_0_0_2px_var(--border-focus)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--border-strong)"
      />
    </div>
  )
}
