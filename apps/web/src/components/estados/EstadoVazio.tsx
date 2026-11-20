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
 * Estado vazio: ícone de 32px, título factual e, se preciso, uma frase curta. Sem ilustração e
 * sem "Ops!".
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
        'flex flex-col items-center justify-center gap-(--e-2) px-(--e-6) py-(--e-12) text-center',
        className,
      )}
    >
      <Icone nome={icone} tamanho={32} className="mb-(--e-1) text-(--tinta-3)" />
      <h2 className="titulo-painel text-(--tinta)">{titulo}</h2>
      {descricao ? (
        <p className="max-w-[380px] corpo text-pretty text-(--tinta-2)">{descricao}</p>
      ) : null}
      {acaoPrincipal || acaoSecundaria ? (
        <div className="mt-(--e-3) flex flex-wrap justify-center gap-(--e-2)">
          {acaoPrincipal}
          {acaoSecundaria}
        </div>
      ) : null}
    </section>
  )
}
