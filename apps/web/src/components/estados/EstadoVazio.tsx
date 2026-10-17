import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  titulo: string
  descricao?: ReactNode
  /** Ação principal opcional (ex.: botão "Cadastrar licença"). */
  acao?: ReactNode
  icone?: LucideIcon
  className?: string
}

/** Estado vazio: não há dados ainda. Diz o que vai aparecer aqui e, se houver, o próximo passo. */
export function EstadoVazio({ titulo, descricao, acao, icone: Icone = Inbox, className }: Props) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      <Icone aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">{titulo}</h2>
      {descricao ? <p className="max-w-prose text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </section>
  )
}
