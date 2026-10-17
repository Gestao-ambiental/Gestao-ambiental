import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  titulo?: string
  descricao?: ReactNode
  className?: string
}

/**
 * Sem permissão: o servidor negou (RLS/RPC). É só apresentação; quem decide o acesso é o banco.
 * Não revela se o registro existe.
 */
export function SemPermissao({
  titulo = 'Você não tem acesso a esta área',
  descricao = 'Se precisar dela, peça à gestão da sua consultoria.',
  className,
}: Props) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      <Lock aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">{titulo}</h2>
      <p className="max-w-prose text-muted-foreground">{descricao}</p>
    </section>
  )
}
