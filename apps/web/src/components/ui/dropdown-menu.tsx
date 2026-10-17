// Menu suspenso: comportamento e acessibilidade do Radix (via shadcn/ui), visual do design system
// (docs/design-system/referencia-componentes/overlay/DropdownMenu.jsx): superfície de overlay,
// borda de 1px, raio 3px, sombra de overlay, linhas de 32px, selecionado em verde lavado com check.
import { DropdownMenu as Primitivo } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

const linha =
  'relative flex h-(--size-control) cursor-pointer select-none items-center gap-(--space-100) whitespace-nowrap px-(--space-150) corpo text-(--text) outline-none transicao-estado ' +
  'focus:bg-(--surface-hover) data-[disabled]:cursor-not-allowed data-[disabled]:text-(--text-disabled) data-[disabled]:focus:bg-transparent'

export function DropdownMenu(props: ComponentProps<typeof Primitivo.Root>) {
  return <Primitivo.Root {...props} />
}

export function DropdownMenuTrigger(props: ComponentProps<typeof Primitivo.Trigger>) {
  return <Primitivo.Trigger {...props} />
}

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitivo.Content>) {
  return (
    <Primitivo.Portal>
      <Primitivo.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[220px] overflow-hidden rounded-(--radius) border bg-(--surface-overlay) py-(--space-050) text-(--text) shadow-sobreposicao',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 duration-(--duration-medium)',
          className,
        )}
        {...props}
      />
    </Primitivo.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitivo.Item>) {
  return <Primitivo.Item className={cn(linha, className)} {...props} />
}

export function DropdownMenuRadioGroup(props: ComponentProps<typeof Primitivo.RadioGroup>) {
  return <Primitivo.RadioGroup {...props} />
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitivo.RadioItem>) {
  return (
    <Primitivo.RadioItem
      className={cn(
        linha,
        'data-[state=checked]:bg-(--surface-selected) data-[state=checked]:text-(--text-link)',
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <Primitivo.ItemIndicator>
        <Icone nome="check" />
      </Primitivo.ItemIndicator>
    </Primitivo.RadioItem>
  )
}

/** Cabeçalho de grupo: rótulo em maiúsculas de 11px, como no design system. */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitivo.Label>) {
  return (
    <Primitivo.Label
      className={cn(
        'px-(--space-150) pt-(--space-075) pb-(--space-050) rotulo-maiusculo text-(--text-subtlest)',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitivo.Separator>) {
  return (
    <Primitivo.Separator
      className={cn('my-(--space-050) h-px bg-(--border)', className)}
      {...props}
    />
  )
}
