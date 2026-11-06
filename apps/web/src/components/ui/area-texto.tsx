import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

type Props = Omit<ComponentProps<'textarea'>, 'id'> & {
  /** Rótulo visível; sem ele, passe `aria-label`. */
  rotulo?: string
  ajuda?: ReactNode
  erro?: string
  id?: string
}

/**
 * Área de texto de várias linhas com rótulo, ajuda e erro, no mesmo visual do campo de texto.
 * O erro fica ligado por aria-describedby e marca aria-invalid; nunca só pela cor.
 */
export function AreaTexto({ rotulo, ajuda, erro, id, className, rows = 3, ...rest }: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  const apoioId = `${campoId}-apoio`
  const apoio = erro ?? ajuda
  return (
    <div className={cn('flex flex-col gap-(--space-050)', className)}>
      {rotulo ? (
        <label htmlFor={campoId} className="rotulo">
          {rotulo}
        </label>
      ) : null}
      <textarea
        id={campoId}
        rows={rows}
        aria-invalid={erro ? true : undefined}
        aria-describedby={apoio ? apoioId : undefined}
        className={cn(
          'w-full resize-y rounded-(--radius) border bg-(--surface-input) px-(--space-100) py-(--space-075) corpo text-(--text) transicao-estado outline-none placeholder:text-(--text-subtlest)',
          'border-(--border-input) hover:bg-(--surface-hover) focus:border-(--border-focus) focus:bg-(--surface-input-focus) focus:shadow-[0_0_0_1px_var(--border-focus)]',
          'disabled:cursor-not-allowed disabled:bg-(--surface-disabled) disabled:text-(--text-disabled)',
          erro &&
            'border-(--border-danger) focus:border-(--border-danger) focus:shadow-[0_0_0_1px_var(--border-danger)]',
        )}
        {...rest}
      />
      {apoio ? (
        <span
          id={apoioId}
          className={cn(
            'inline-flex items-start gap-(--space-075) text-xs',
            erro ? 'text-(--text-danger)' : 'text-(--text-subtle)',
          )}
        >
          {erro ? <Icone nome="circle-alert" tamanho={12} className="mt-0.5" /> : null}
          {apoio}
        </span>
      ) : null}
    </div>
  )
}
