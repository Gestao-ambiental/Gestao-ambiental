import { iniciais } from '@/lib/texto'
import { cn } from '@/lib/utils'

/**
 * Quadrado com as iniciais do empreendimento (Protótipos 08 e 09). Decorativo: o nome está
 * sempre escrito ao lado.
 */
export function SiglaEmpreendimento({
  nome,
  grande = false,
  className,
}: {
  nome: string
  grande?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-(--radius) bg-(--brand) font-semibold text-(--text-inverse)',
        grande ? 'size-12 text-base' : 'size-6 text-[10px]',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}
