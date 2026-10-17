import type { ReactNode } from 'react'

import { Icone, type NomeIcone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

interface Props {
  titulo: string
  descricao?: ReactNode
  /** No máximo uma ação principal (e uma secundária). */
  acaoPrincipal?: ReactNode
  acaoSecundaria?: ReactNode
  icone?: NomeIcone
  className?: string
}

/**
 * Estado vazio: um ícone cinza de 24px, título factual e uma frase instrutiva. Sem ilustração,
 * sem cor, sem "Ops!". Referência: docs/design-system/referencia-componentes/data/EmptyState.jsx.
 */
export function EstadoVazio({
  titulo,
  descricao,
  acaoPrincipal,
  acaoSecundaria,
  icone = 'inbox',
  className,
}: Props) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex flex-col items-center justify-center gap-(--space-100) px-(--space-300) py-(--space-600) text-center',
        className,
      )}
    >
      <Icone nome={icone} tamanho={24} className="text-(--icon-disabled)" />
      <h2 className="titulo-secao text-(--text)">{titulo}</h2>
      {descricao ? (
        <p className="max-w-[380px] corpo text-pretty text-(--text-subtle)">{descricao}</p>
      ) : null}
      {acaoPrincipal || acaoSecundaria ? (
        <div className="mt-(--space-100) flex gap-(--space-100)">
          {acaoPrincipal}
          {acaoSecundaria}
        </div>
      ) : null}
    </section>
  )
}
