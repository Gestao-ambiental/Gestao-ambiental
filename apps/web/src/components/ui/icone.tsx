import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import type { NomeIcone } from './nomes-icones'

// Phosphor Icons, peso bold (lista em assets/icons/LEIA-ME.md), servidos pelo Vite (pequenos viram data URI no build).
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
  /** 16 padrão, 12 em metadado, 18 em botão de ícone, 20 no trilho, 24 e 32 em estado vazio. */
  tamanho?: 12 | 14 | 16 | 18 | 20 | 24 | 32
  /** Nome acessível. Sem ele o ícone é decorativo (aria-hidden). */
  rotulo?: string
}

/**
 * Ícone monocromático por máscara: a cor vem do texto ao redor (currentColor).
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
