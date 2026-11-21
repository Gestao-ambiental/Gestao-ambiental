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
 */
export function Esqueleto({ largura = '100%', altura = 12, className, style }: Props) {
  return (
    <span
      aria-hidden="true"
      data-esqueleto=""
      className={cn('block rounded-(--raio)', className)}
      style={{
        width: largura,
        height: altura,
        background:
          'linear-gradient(90deg,var(--esqueleto) 0%,var(--esqueleto-brilho) 50%,var(--esqueleto) 100%)',
        backgroundSize: '200% 100%',
        animation: 'af-skeleton 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

/** N linhas no ritmo do quadro (48px). */
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
          className="flex h-(--linha) items-center gap-(--e-4) border-b px-(--e-4) last:border-b-0"
        >
          <Esqueleto largura={44} altura={18} />
          <Esqueleto largura={`${String(40 + (indice % 3) * 12)}%`} />
          <Esqueleto largura={72} altura={16} className="ml-auto" />
        </div>
      ))}
    </div>
  )
}
