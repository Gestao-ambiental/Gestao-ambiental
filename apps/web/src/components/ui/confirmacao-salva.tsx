import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

/**
 * Confirmação curta de "salvo" ao lado do botão: um check em lima que aparece (de 60% para o tamanho
 * real, sem quicar) e o texto. Anuncia pelo role="status"; sem movimento, o check só aparece.
 */
export function ConfirmacaoSalva({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-(--e-15) rotulo text-(--tinta)', className)}
    >
      <span
        aria-hidden="true"
        className="marcar inline-flex size-5 shrink-0 items-center justify-center rounded-(--raio-redondo) bg-(--sinal) text-(--sinal-texto)"
      >
        <Icone nome="check" tamanho={12} />
      </span>
      {children}
    </span>
  )
}
