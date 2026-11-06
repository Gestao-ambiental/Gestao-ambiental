import type { ReactNode } from 'react'

import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

/**
 * Texto de pendência à esquerda do botão principal: "Pendente: …" (vermelho depois de tentar) ou
 * "Pronto para enviar" com ícone. Anunciado ao leitor de tela quando muda.
 */
export function TextoPendencia({
  pendencias,
  tentou,
  pronto = 'Pronto para enviar',
}: {
  pendencias: readonly string[]
  tentou: boolean
  pronto?: string
}) {
  if (pendencias.length === 0) {
    return (
      <p
        aria-live="polite"
        className="inline-flex items-center gap-(--space-075) text-xs text-(--text-success)"
      >
        <Icone nome="circle-check" tamanho={12} />
        {pronto}
      </p>
    )
  }
  return (
    <p
      aria-live="polite"
      className={cn('text-xs', tentou ? 'text-(--text-danger)' : 'text-(--text-subtle)')}
    >
      Pendente: {pendencias.join(', ')}
    </p>
  )
}

/**
 * Rodapé da seção com a pendência e o botão principal. No celular fica fixo embaixo da tela, com
 * o botão na largura toda (44px).
 */
export function RodapeDeAcao({ pendencia, botao }: { pendencia: ReactNode; botao: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-(--space-200) border-t pt-(--space-200)',
        'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:flex-col max-md:items-stretch max-md:gap-(--space-100) max-md:bg-(--surface) max-md:p-(--space-200)',
        '[&_button]:max-md:h-11 [&_button]:max-md:w-full',
      )}
    >
      {pendencia}
      {botao}
    </div>
  )
}
