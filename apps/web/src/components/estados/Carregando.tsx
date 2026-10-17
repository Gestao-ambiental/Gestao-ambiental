import { EsqueletoLinhas } from '@/components/ui/esqueleto'
import { cn } from '@/lib/utils'

interface Props {
  /** Texto lido por leitores de tela enquanto carrega. */
  rotulo?: string
  /** Linhas do esqueleto, no ritmo de tabela (40px). */
  linhas?: number
  className?: string
}

/** Carregando: esqueleto no formato do conteúdo, anunciado uma vez para leitores de tela. */
export function Carregando({ rotulo = 'Carregando', linhas = 5, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('rounded-(--radius) border bg-(--surface)', className)}
    >
      <span className="sr-only">{rotulo}</span>
      <EsqueletoLinhas linhas={linhas} />
    </div>
  )
}
