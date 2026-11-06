import { cn } from '@/lib/utils'

import { Icone } from './icone'
import { classesDoTom, type TomSelo } from './selo'

interface Props {
  texto: string
  tom: TomSelo
  className?: string
}

/**
 * Status como pílula no estilo ClickUp: rótulo em maiúsculas com fundo lavado e um segmento com
 * chevron. É o único indicador de progresso da ocorrência; sempre com palavra, nunca só cor.
 */
export function PilulaStatus({ texto, tom, className }: Props) {
  const cores = classesDoTom(tom)
  return (
    <span
      className={cn(
        'inline-flex h-(--size-control-sm) items-stretch overflow-hidden rounded-(--radius) rotulo-maiusculo whitespace-nowrap',
        className,
      )}
    >
      <span className={cn('flex items-center px-(--space-100)', cores)}>{texto}</span>
      <span
        aria-hidden="true"
        className={cn('flex items-center border-l border-(--surface) px-(--space-050)', cores)}
      >
        <Icone nome="chevron-right" tamanho={12} />
      </span>
    </span>
  )
}
