import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import type { NomeIcone } from './nomes-icones'

// SVGs Lucide do design system, servidos pelo Vite (pequenos viram data URI no build).
const urls = import.meta.glob<string>('../../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const URL_DOS_ICONES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(urls).map(([caminho, url]) => [
    caminho.slice(caminho.lastIndexOf('/') + 1, -'.svg'.length),
    url,
  ]),
)

export type { NomeIcone }

interface Props extends Omit<ComponentProps<'span'>, 'children'> {
  nome: NomeIcone
  /** 16 padrão, 12 em metadado, 24 só em estado vazio (design system). */
  tamanho?: 12 | 16 | 24
  /** Nome acessível. Sem ele o ícone é decorativo (aria-hidden). */
  rotulo?: string
}

/**
 * Ícone monocromático por máscara: a cor vem do texto ao redor (currentColor).
 * Referência: docs/design-system/referencia-componentes/core/Icon.jsx.
 */
export function Icone({ nome, tamanho = 16, rotulo, className, style, ...rest }: Props) {
  const url = `url("${URL_DOS_ICONES[nome] ?? ''}")`
  return (
    <span
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      data-icone={nome}
      className={cn('inline-block shrink-0', className)}
      style={{
        width: tamanho,
        height: tamanho,
        backgroundColor: 'currentColor',
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        ...style,
      }}
      {...rest}
    />
  )
}
