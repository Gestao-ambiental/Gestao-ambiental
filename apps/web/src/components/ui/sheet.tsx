// Gaveta lateral: comportamento do Dialog do Radix (foco preso, Esc, retorno do foco), visual do
// design system: scrim do modal, superfície do rail, borda de 1px e sombra de overlay (é flutuante).
import { Dialog as Primitivo } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { BotaoIcone } from './botao-icone'

export function Sheet(props: ComponentProps<typeof Primitivo.Root>) {
  return <Primitivo.Root {...props} />
}

export function SheetTrigger(props: ComponentProps<typeof Primitivo.Trigger>) {
  return <Primitivo.Trigger {...props} />
}

export function SheetContent({
  className,
  children,
  lado = 'esquerda',
  ...props
}: ComponentProps<typeof Primitivo.Content> & { lado?: 'esquerda' | 'direita' }) {
  return (
    <Primitivo.Portal>
      <Primitivo.Overlay className="fixed inset-0 z-50 bg-(--scrim) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-(--duration-medium)" />
      <Primitivo.Content
        className={cn(
          'fixed inset-y-0 z-50 flex h-full w-(--nav-side-width) flex-col bg-(--surface-nav) text-(--text) shadow-sobreposicao outline-none duration-(--duration-medium)',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          lado === 'esquerda'
            ? 'left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left'
            : 'right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          className,
        )}
        {...props}
      >
        {children}
        <Primitivo.Close asChild>
          <BotaoIcone
            icone="x"
            rotulo="Fechar menu"
            className="absolute top-(--space-150) right-(--space-150)"
          />
        </Primitivo.Close>
      </Primitivo.Content>
    </Primitivo.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-(--nav-top-height) shrink-0 items-center border-b px-(--space-200)',
        className,
      )}
      {...props}
    />
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof Primitivo.Title>) {
  return <Primitivo.Title className={cn('titulo-secao', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof Primitivo.Description>) {
  return <Primitivo.Description className={cn('rotulo', className)} {...props} />
}
