// Gaveta lateral: comportamento do Dialog do Radix (foco preso, Esc, retorno do foco); por padrão
// tem a superfície da folha. O menu do celular passa a classe do trilho verde.
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
      <Primitivo.Overlay className="fixed inset-0 z-50 bg-(--veu) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-(--dur-media)" />
      <Primitivo.Content
        className={cn(
          'fixed inset-y-0 z-50 flex h-full w-[min(320px,88vw)] flex-col bg-(--folha) text-(--tinta) shadow-dialogo outline-none duration-(--dur-media)',
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
            className="absolute top-(--e-2) right-(--e-2) text-current"
          />
        </Primitivo.Close>
      </Primitivo.Content>
    </Primitivo.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-(--barra-altura) shrink-0 items-center border-b px-(--e-4)', className)}
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
