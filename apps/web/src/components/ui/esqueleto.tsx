import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  largura?: CSSProperties['width']
  altura?: CSSProperties['height']
  className?: string
  style?: CSSProperties
}

/**
 * Espaço reservado enquanto carrega, no formato do que vai aparecer. Sempre aria-hidden: quem
 * anuncia o carregamento é o contêiner (role="status").
 * Referência: docs/design-system/referencia-componentes/data/Skeleton.jsx.
 */
export function Esqueleto({ largura = '100%', altura = 12, className, style }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn('block rounded-(--radius)', className)}
      style={{
        width: largura,
        height: altura,
        background:
          'linear-gradient(90deg,var(--surface-skeleton) 0%,var(--surface-skeleton-shine) 50%,var(--surface-skeleton) 100%)',
        backgroundSize: '200% 100%',
        animation: 'af-skeleton 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

/** N linhas no ritmo de tabela (40px). Referência: SkeletonRows. */
export function EsqueletoLinhas({
  linhas = 4,
  className,
}: {
  linhas?: number
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col', className)}>
      {Array.from({ length: linhas }, (_, indice) => (
        <div
          key={indice}
          className="flex h-(--row-height) items-center gap-(--space-150) border-b px-(--space-100)"
        >
          <Esqueleto largura={16} altura={16} />
          <Esqueleto largura={`${String(40 + (indice % 3) * 12)}%`} />
          <Esqueleto largura={72} altura={16} className="ml-auto" />
        </div>
      ))}
    </div>
  )
}
