import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icone, type NomeIcone } from './icone'

type Props = Omit<ComponentProps<'button'>, 'children'> & {
  icone: NomeIcone
  /** Nome acessível obrigatório (aria-label e dica ao passar o mouse). */
  rotulo: string
  aparencia?: 'sutil' | 'padrao' | 'primario'
  tamanho?: 'padrao' | 'compacto'
  selecionado?: boolean
}

/**
 * Botão quadrado só com ícone (barra de ferramentas, ação de linha, navegação).
 * Referência: docs/design-system/referencia-componentes/core/IconButton.jsx.
 */
export function BotaoIcone({
  icone,
  rotulo,
  aparencia = 'sutil',
  tamanho = 'padrao',
  selecionado = false,
  type = 'button',
  className,
  ...rest
}: Props) {
  const compacto = tamanho === 'compacto'
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-(--radius) border p-0 transicao-estado',
        'disabled:cursor-not-allowed disabled:text-(--text-disabled)',
        compacto ? 'size-(--size-control-sm)' : 'size-(--size-control)',
        aparencia === 'padrao' ? 'border-(--border)' : 'border-transparent',
        aparencia === 'primario'
          ? 'bg-(--brand) text-(--icon-inverse) hover:bg-(--brand-hover) active:bg-(--brand-pressed)'
          : 'bg-transparent text-(--icon) hover:bg-(--neutral-subtle-hover) active:bg-(--neutral-subtle-pressed)',
        selecionado && aparencia !== 'primario' && 'bg-(--surface-selected) text-(--text-link)',
        className,
      )}
      {...rest}
    >
      <Icone nome={icone} tamanho={compacto ? 12 : 16} />
    </button>
  )
}
