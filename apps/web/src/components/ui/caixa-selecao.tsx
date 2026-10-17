import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

// Controles nativos (teclado e leitor de tela de graça) desenhados como no design system: o
// visual padrão do navegador com a cor da marca escura parecia marcado mesmo desmarcado.
const baseControle =
  'peer size-4 shrink-0 cursor-pointer appearance-none border border-(--border-input) bg-(--surface-input) transicao-estado ' +
  'hover:border-(--border-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--border-focus) ' +
  'disabled:cursor-not-allowed disabled:bg-(--surface-disabled)'

type Props = Omit<ComponentProps<'input'>, 'type' | 'id'> & {
  rotulo: ReactNode
  id?: string
}

/** Caixa de seleção. Referência: docs/design-system/referencia-componentes/forms/Checkbox.jsx. */
export function CaixaSelecao({ rotulo, id, className, ...rest }: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  return (
    <div className={cn('inline-flex items-center gap-(--space-100)', className)}>
      <span className="relative inline-flex">
        <input
          id={campoId}
          type="checkbox"
          className={cn(
            baseControle,
            'rounded-(--radius) checked:border-(--brand) checked:bg-(--brand)',
          )}
          {...rest}
        />
        <Icone
          nome="check"
          tamanho={12}
          className="pointer-events-none invisible absolute top-0.5 left-0.5 text-(--text-inverse) peer-checked:visible"
        />
      </span>
      <label htmlFor={campoId} className="cursor-pointer corpo text-(--text)">
        {rotulo}
      </label>
    </div>
  )
}

type PropsRadio = Omit<ComponentProps<'input'>, 'type' | 'id'> & {
  rotulo: ReactNode
  descricao?: ReactNode
  id?: string
}

/** Opção de rádio em cartão (Protótipo 07: papel no convite), com descrição abaixo do rótulo. */
export function OpcaoRadio({ rotulo, descricao, id, className, ...rest }: PropsRadio) {
  const gerado = useId()
  const campoId = id ?? gerado
  // Nome acessível só com o rótulo; a descrição entra como descrição (não polui o nome).
  return (
    <label
      htmlFor={campoId}
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 rounded-(--radius) border px-(--space-150) py-(--space-100) transicao-estado',
        'border-(--border) has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover)',
        className,
      )}
    >
      <span className="inline-flex items-center gap-(--space-100)">
        <input
          id={campoId}
          type="radio"
          aria-labelledby={`${campoId}-rotulo`}
          aria-describedby={descricao ? `${campoId}-descricao` : undefined}
          className={cn(
            baseControle,
            'rounded-full checked:border-[5px] checked:border-(--brand) checked:bg-(--text-inverse)',
          )}
          {...rest}
        />
        <span id={`${campoId}-rotulo`} className="corpo text-(--text)">
          {rotulo}
        </span>
      </span>
      {descricao ? (
        <span id={`${campoId}-descricao`} className="pl-6 text-xs text-(--text-subtle)">
          {descricao}
        </span>
      ) : null}
    </label>
  )
}
