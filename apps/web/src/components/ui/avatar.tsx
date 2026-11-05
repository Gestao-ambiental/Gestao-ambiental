import { useState } from 'react'

import { iniciais } from '@/lib/texto'
import { cn } from '@/lib/utils'

const TAMANHOS = { pequeno: 20, medio: 24, grande: 32, perfil: 72 } as const

interface Props {
  nome: string
  /** Foto de perfil (URL assinada); sem ela, ou se não carregar, ficam as iniciais. */
  fotoUrl?: string | null
  tamanho?: keyof typeof TAMANHOS
  className?: string
}

/**
 * Avatar redondo com foto ou iniciais (o único círculo do sistema). Decorativo: o nome acessível
 * fica no controle que o contém. Referência: docs/design-system/referencia-componentes/core/Avatar.jsx.
 */
export function Avatar({ nome, fotoUrl, tamanho = 'medio', className }: Props) {
  const px = TAMANHOS[tamanho]
  const [falhou, setFalhou] = useState<string | null>(null)
  const comFoto = Boolean(fotoUrl) && falhou !== fotoUrl
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--surface) bg-(--avatar-default) font-semibold text-(--text-inverse)',
        className,
      )}
      style={{ width: px, height: px, fontSize: px <= 24 ? 10 : px <= 32 ? 12 : 24, lineHeight: 1 }}
    >
      {comFoto && fotoUrl ? (
        <img
          src={fotoUrl}
          alt=""
          className="size-full object-cover"
          onError={() => {
            setFalhou(fotoUrl)
          }}
        />
      ) : (
        iniciais(nome)
      )}
    </span>
  )
}
