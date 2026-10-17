import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icone, type NomeIcone } from './icone'

/** Referência: docs/design-system/referencia-componentes/core/Button.jsx. */
export const variantesBotao = cva(
  [
    'inline-flex items-center justify-center gap-(--space-050) whitespace-nowrap',
    'h-(--size-control) px-(--space-150) rounded-(--radius) border corpo-medio',
    'cursor-pointer transicao-estado select-none',
    'disabled:cursor-not-allowed disabled:text-(--text-disabled)',
  ],
  {
    variants: {
      aparencia: {
        primario:
          'border-transparent bg-(--brand) text-(--text-inverse) hover:bg-(--brand-hover) active:bg-(--brand-pressed) disabled:bg-(--surface-disabled)',
        padrao:
          'border-(--border) bg-transparent text-(--text) hover:bg-(--neutral-subtle-hover) active:bg-(--neutral-subtle-pressed) disabled:bg-transparent',
        sutil:
          'border-transparent bg-transparent text-(--text) hover:bg-(--neutral-subtle-hover) active:bg-(--neutral-subtle-pressed) disabled:bg-transparent',
        perigo:
          'border-transparent bg-(--danger) text-(--text-inverse) hover:bg-(--danger-hover) active:bg-(--danger-pressed) disabled:bg-(--surface-disabled)',
        link: 'border-transparent bg-transparent px-(--space-025) text-(--text-link) hover:underline disabled:no-underline',
      },
      tamanho: {
        padrao: '',
        compacto: 'h-(--size-control-sm) px-(--space-100)',
      },
      larguraTotal: { true: 'flex w-full', false: '' },
      selecionado: {
        true: 'bg-(--surface-selected) text-(--text-link) hover:bg-(--surface-selected-hover)',
        false: '',
      },
    },
    compoundVariants: [
      {
        aparencia: 'primario',
        selecionado: true,
        className: 'bg-(--brand-pressed) text-(--text-inverse)',
      },
    ],
    defaultVariants: {
      aparencia: 'padrao',
      tamanho: 'padrao',
      larguraTotal: false,
      selecionado: false,
    },
  },
)

type Props = ComponentProps<'button'> &
  VariantProps<typeof variantesBotao> & {
    iconeAntes?: NomeIcone
    iconeDepois?: NomeIcone
    /** Renderiza o filho (ex.: <Link>) com o visual de botão. Sem ícones nesse modo. */
    asChild?: boolean
  }

/** Botão de 32px (24px compacto): rótulo primeiro, ícone opcional, sem sombra. */
export function Botao({
  aparencia,
  tamanho,
  larguraTotal,
  selecionado,
  iconeAntes,
  iconeDepois,
  asChild = false,
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  const classes = cn(variantesBotao({ aparencia, tamanho, larguraTotal, selecionado }), className)
  if (asChild) {
    return (
      <Slot.Root className={classes} {...rest}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button type={type} aria-pressed={selecionado ?? undefined} className={classes} {...rest}>
      {iconeAntes ? <Icone nome={iconeAntes} /> : null}
      {children}
      {iconeDepois ? <Icone nome={iconeDepois} /> : null}
    </button>
  )
}
