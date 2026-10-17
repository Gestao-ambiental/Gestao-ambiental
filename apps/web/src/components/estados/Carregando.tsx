import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  /** Texto lido por leitores de tela enquanto carrega. */
  rotulo?: string
  /** Quantidade de linhas do esqueleto (imita uma lista ou tabela). */
  linhas?: number
  className?: string
}

/** Carregando: esqueleto com o formato do conteúdo, anunciado uma vez para leitores de tela. */
export function Carregando({ rotulo = 'Carregando', linhas = 5, className }: Props) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{rotulo}</span>
      <Skeleton aria-hidden="true" className="h-6 w-1/3" />
      {Array.from({ length: linhas }, (_, indice) => (
        <Skeleton key={indice} aria-hidden="true" className="h-11 w-full" />
      ))}
    </div>
  )
}
