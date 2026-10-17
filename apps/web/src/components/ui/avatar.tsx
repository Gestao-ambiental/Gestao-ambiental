import { cn } from '@/lib/utils'

const TAMANHOS = { pequeno: 20, medio: 24, grande: 32 } as const

interface Props {
  nome: string
  tamanho?: keyof typeof TAMANHOS
  className?: string
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * Avatar redondo com iniciais (o único círculo do sistema). Decorativo: o nome acessível fica
 * no controle que o contém. Referência: docs/design-system/referencia-componentes/core/Avatar.jsx.
 */
export function Avatar({ nome, tamanho = 'medio', className }: Props) {
  const px = TAMANHOS[tamanho]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--surface) bg-(--avatar-default) font-semibold text-(--text-inverse)',
        className,
      )}
      style={{ width: px, height: px, fontSize: px <= 24 ? 10 : 12, lineHeight: 1 }}
    >
      {iniciais(nome)}
    </span>
  )
}
