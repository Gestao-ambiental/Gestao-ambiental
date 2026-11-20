// Menu suspenso: comportamento e acessibilidade do Radix (via shadcn/ui).
// Menu flutuante de raio 10px, itens de 36px (44 no celular).
import { DropdownMenu as Primitivo } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

const linha =
  'relative flex h-(--controle) max-md:h-(--controle-toque) cursor-pointer select-none items-center gap-(--e-2) whitespace-nowrap rounded-(--raio) px-(--e-2) corpo text-(--tinta) outline-none transicao-estado ' +
  'focus:bg-(--toque) active:bg-(--aperto) data-[disabled]:cursor-not-allowed data-[disabled]:text-(--tinta-off) data-[disabled]:focus:bg-transparent'

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
          'z-50 min-w-[220px] overflow-hidden rounded-(--raio-painel) border border-(--regra) bg-(--flutuante) p-(--e-1) text-(--tinta) shadow-sobreposicao origin-(--radix-dropdown-menu-content-transform-origin)',
          // Abre de onde foi chamado (transform-origin do Radix) e fecha mais rápido do que abre.
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97 duration-(--dur-media) ease-(--saida) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-97 data-[state=closed]:duration-(--dur-rapida)',
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
        'data-[state=checked]:bg-(--escolha) data-[state=checked]:corpo-medio',
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
        'px-(--e-3) pt-(--e-15) pb-(--e-1) rotulo-maiusculo text-(--tinta-3)',
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
    <Primitivo.Separator className={cn('my-(--e-1) h-px bg-(--regra)', className)} {...props} />
  )
}
