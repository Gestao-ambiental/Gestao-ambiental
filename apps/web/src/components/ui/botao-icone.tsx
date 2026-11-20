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
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-(--raio-redondo) border p-0 transicao-estado active:scale-[0.94]',
        'disabled:cursor-not-allowed disabled:text-(--tinta-off)',
        compacto ? 'size-(--controle-mini)' : 'size-(--controle)',
        // Alvo de 44px no celular (WCAG 2.5.8 com folga para o campo).
        'max-md:size-(--controle-toque)',
        aparencia === 'padrao' ? 'border-(--regra-forte)' : 'border-transparent',
        aparencia === 'primario'
          ? 'bg-(--acao) text-(--acao-texto) hover:bg-(--acao-toque) active:bg-(--acao-aperto)'
          : 'bg-transparent text-(--icone) hover:bg-(--toque) active:bg-(--aperto)',
        selecionado && aparencia !== 'primario' && 'bg-(--escolha) text-(--tinta)',
        className,
      )}
      {...rest}
    >
      <Icone nome={icone} tamanho={compacto ? 16 : 18} />
    </button>
  )
}
