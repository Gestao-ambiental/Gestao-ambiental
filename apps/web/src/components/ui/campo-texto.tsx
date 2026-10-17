import { useId, useState, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { BotaoIcone } from './botao-icone'

type Props = Omit<ComponentProps<'input'>, 'id'> & {
  rotulo: string
  /** Texto de apoio abaixo do campo; some quando há erro. */
  ajuda?: ReactNode
  erro?: string
  /** Campo de senha com botão "Mostrar senha" / "Ocultar senha". */
  senha?: boolean
  id?: string
}

/**
 * Campo de texto de 32px com rótulo, ajuda e erro (Field + TextField do design system).
 * O erro fica ligado ao campo por aria-describedby e marca aria-invalid; nunca só pela cor.
 * Referência: docs/design-system/referencia-componentes/forms/TextField.jsx.
 */
export function CampoTexto({
  rotulo,
  ajuda,
  erro,
  senha = false,
  id,
  type,
  className,
  ...rest
}: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  const apoioId = `${campoId}-apoio`
  const [mostrar, setMostrar] = useState(false)
  const apoio = erro ?? ajuda

  return (
    <div className={cn('flex flex-col gap-(--space-050)', className)}>
      <label htmlFor={campoId} className="rotulo">
        {rotulo}
      </label>
      <div className="relative flex items-center">
        <input
          id={campoId}
          type={senha ? (mostrar ? 'text' : 'password') : type}
          aria-invalid={erro ? true : undefined}
          aria-describedby={apoio ? apoioId : undefined}
          className={cn(
            'h-(--size-control) w-full rounded-(--radius) border bg-(--surface-input) px-(--space-100) corpo text-(--text) transicao-estado outline-none',
            'border-(--border-input) focus:border-(--border-focus) focus:bg-(--surface-input-focus) focus:shadow-[0_0_0_1px_var(--border-focus)]',
            'disabled:cursor-not-allowed disabled:bg-(--surface-disabled) disabled:text-(--text-disabled)',
            'read-only:bg-(--surface-disabled) read-only:text-(--text-subtle)',
            erro &&
              'border-(--border-danger) focus:border-(--border-danger) focus:shadow-[0_0_0_1px_var(--border-danger)]',
            senha && 'pr-(--space-400)',
          )}
          {...rest}
        />
        {senha ? (
          <BotaoIcone
            icone="eye"
            rotulo={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
            selecionado={mostrar}
            tamanho="compacto"
            className="absolute right-(--space-050)"
            onClick={() => {
              setMostrar((valor) => !valor)
            }}
          />
        ) : null}
      </div>
      {apoio ? (
        <span
          id={apoioId}
          className={cn('text-xs', erro ? 'text-(--text-danger)' : 'text-(--text-subtle)')}
        >
          {apoio}
        </span>
      ) : null}
    </div>
  )
}
