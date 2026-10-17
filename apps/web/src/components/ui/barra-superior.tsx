import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  esquerda?: ReactNode
  centro?: ReactNode
  direita?: ReactNode
  className?: string
}

/**
 * Cabeçalho do app: 56px, separado do conteúdo por uma linha de 1px.
 * Referência: docs/design-system/referencia-componentes/navigation/TopBar.jsx.
 */
export function BarraSuperior({ esquerda, centro, direita, className }: Props) {
  return (
    <header
      className={cn(
        'flex h-(--nav-top-height) shrink-0 items-center gap-(--space-200) border-b bg-(--surface-nav) px-(--space-200)',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-(--space-100)">{esquerda}</div>
      <div className="flex min-w-0 flex-1 items-center gap-(--space-100)">{centro}</div>
      <div className="flex shrink-0 items-center gap-(--space-050)">{direita}</div>
    </header>
  )
}
