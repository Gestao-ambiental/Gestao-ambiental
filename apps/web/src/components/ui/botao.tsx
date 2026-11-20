import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icone, type NomeIcone } from './icone'

/**
 * Botão do quadro de partidas: 36px (44 no celular), raio 6px, rótulo em Overpass 650.
 * Primário = verde-placa (lima no escuro). Padrão = contorno de regra forte. Sem sombra.
 */
export const variantesBotao = cva(
  [
    'inline-flex items-center justify-center gap-(--e-2) whitespace-nowrap',
    'h-(--controle) max-md:min-h-(--controle-toque) px-(--e-4) rounded-(--raio) border corpo-medio',
    'cursor-pointer transicao-estado select-none active:translate-y-px',
    'disabled:cursor-not-allowed disabled:text-(--tinta-off) disabled:active:translate-y-0',
  ],
  {
    variants: {
      aparencia: {
        primario:
          'border-transparent bg-(--acao) text-(--acao-texto) hover:bg-(--acao-toque) active:bg-(--acao-aperto) disabled:bg-(--off)',
        padrao:
          'border-(--regra-forte) bg-(--folha) text-(--tinta) hover:border-(--tinta-3) hover:bg-(--toque) active:bg-(--aperto) disabled:border-(--regra) disabled:bg-(--off)',
        sutil:
          'border-transparent bg-transparent text-(--tinta) hover:bg-(--toque) active:bg-(--aperto) disabled:bg-transparent',
        perigo:
          'border-transparent bg-(--atraso) text-(--tinta-inversa) hover:bg-(--atraso-toque) disabled:bg-(--off)',
        link: 'h-auto border-transparent bg-transparent px-(--e-05) text-(--link) underline-offset-[3px] hover:underline disabled:no-underline max-md:min-h-0',
      },
      tamanho: {
        padrao: '',
        compacto: 'h-(--controle-mini) px-(--e-3) gap-(--e-15)',
      },
      larguraTotal: { true: 'flex w-full', false: '' },
      selecionado: {
        true: 'border-(--marca-linha) bg-(--escolha) text-(--tinta) hover:bg-(--escolha-toque)',
        false: '',
      },
    },
    compoundVariants: [
      {
        aparencia: 'primario',
        selecionado: true,
        className: 'bg-(--acao-aperto) text-(--acao-texto)',
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

/** Botão: rótulo primeiro, ícone opcional, sem sombra. */
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
