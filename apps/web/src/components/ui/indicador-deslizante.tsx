// Indicador que desliza até a opção ativa (item do menu, segmentado, aba). Um só elemento, movido
// por transform (não por top/left), medido antes da pintura. Na primeira medida não há transição
// (ele aparece no lugar); nas seguintes, desliza em --dur-indicador com a curva --saida. Com
// prefers-reduced-motion a duração vai a zero: só a troca de lugar e de cor.

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

import { cn } from '@/lib/utils'

interface Medida {
  x: number
  y: number
  largura: number
  altura: number
}

/**
 * Mede a opção ativa (`seletor`) dentro do contêiner e devolve onde pôr o indicador. `chave` é o
 * que muda a opção ativa (rota, valor). Remede quando o contêiner muda de tamanho.
 */
export function useIndicadorDeslizante<T extends HTMLElement>(
  seletor: string,
  chave: unknown,
): { conteiner: RefObject<T | null>; medida: Medida | null; desliza: boolean } {
  const conteiner = useRef<T | null>(null)
  const [medida, setMedida] = useState<Medida | null>(null)
  const [desliza, setDesliza] = useState(false)

  useLayoutEffect(() => {
    const raiz = conteiner.current
    if (!raiz) return
    const medir = () => {
      const alvo = raiz.querySelector<HTMLElement>(seletor)
      if (!alvo) {
        setMedida(null)
        return
      }
      const caixa = raiz.getBoundingClientRect()
      const dele = alvo.getBoundingClientRect()
      setMedida({
        // Relativo à caixa de preenchimento (sem a borda do contêiner), com a rolagem.
        x: dele.left - caixa.left - raiz.clientLeft + raiz.scrollLeft,
        y: dele.top - caixa.top - raiz.clientTop + raiz.scrollTop,
        largura: dele.width,
        altura: dele.height,
      })
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(raiz)
    return () => {
      observador.disconnect()
    }
  }, [seletor, chave])

  // Depois da primeira medida, as próximas trocas deslizam.
  useLayoutEffect(() => {
    if (!medida || desliza) return
    const quadro = requestAnimationFrame(() => {
      setDesliza(true)
    })
    return () => {
      cancelAnimationFrame(quadro)
    }
  }, [medida, desliza])

  return { conteiner, medida, desliza }
}

/** O indicador em si: posição absoluta dentro do contêiner (que precisa ser `relative`). */
export function IndicadorDeslizante({
  medida,
  desliza,
  className,
}: {
  medida: Medida | null
  desliza: boolean
  className?: string
}) {
  if (!medida) return null
  const estilo: CSSProperties = {
    width: medida.largura,
    height: medida.altura,
    transform: `translate(${String(medida.x)}px, ${String(medida.y)}px)`,
  }
  return (
    <span
      aria-hidden="true"
      data-indicador=""
      style={estilo}
      className={cn(
        'pointer-events-none absolute top-0 left-0',
        desliza && 'transicao-indicador',
        className,
      )}
    />
  )
}
