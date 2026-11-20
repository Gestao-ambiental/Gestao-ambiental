import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  esquerda?: ReactNode
  centro?: ReactNode
  direita?: ReactNode
  className?: string
}

/** Barra superior de 56px, separada do conteúdo por uma regra fina. */
export function BarraSuperior({ esquerda, centro, direita, className }: Props) {
  return (
    <header
      className={cn(
        'flex h-(--barra-altura) shrink-0 items-center gap-(--e-3) border-b bg-(--folha) px-(--e-4) md:px-(--e-6)',
        className,
      )}
    >
      {esquerda ? <div className="flex shrink-0 items-center gap-(--e-2)">{esquerda}</div> : null}
      <div className="flex min-w-0 flex-1 items-center gap-(--e-2)">{centro}</div>
      <div className="flex shrink-0 items-center gap-(--e-1)">{direita}</div>
    </header>
  )
}
