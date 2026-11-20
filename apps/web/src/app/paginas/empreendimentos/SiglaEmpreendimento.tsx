import { iniciais } from '@/lib/texto'
import { cn } from '@/lib/utils'

/**
 * Plaqueta discreta com as iniciais do empreendimento (Protótipos 08 e 09). Decorativa: o nome
 * está sempre escrito ao lado. Fundo neutro e tinta secundária, para não pesar em toda linha.
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
        'inline-flex shrink-0 items-center justify-center rounded-(--raio-mini) bg-(--neutro-fundo) font-[750] text-(--tinta-2) numero',
        grande ? 'size-12 text-base' : 'size-6 text-[10px]',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}
