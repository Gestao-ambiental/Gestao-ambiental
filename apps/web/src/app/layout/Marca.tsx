import { Sprout } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Marca provisória: nome Grama em texto, símbolo monocromático simples (sem logo definido ainda). */
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-lg font-semibold text-primary', className)}>
      <Sprout aria-hidden="true" className="size-5" />
      Grama
    </span>
  )
}
