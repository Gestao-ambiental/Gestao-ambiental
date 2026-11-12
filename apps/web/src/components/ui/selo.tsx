import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tons do design system (lozenge). Mapeamento de domínio (README do DS):
 * padrao = a fazer / planejada · andamento = em andamento / espera externa ·
 * atencao = pendente de revisão / vence em breve · revisao = em conferência ·
 * sucesso = concluída / vigente · perigo = atrasada / vencida / devolvida.
 */
export type TomSelo =
  | 'padrao'
  | 'andamento'
  | 'revisao'
  | 'sucesso'
  | 'atencao'
  | 'perigo'
  | 'perigoMedio'
  | 'perigoForte'

const TONS: Record<TomSelo, string> = {
  padrao: 'border-(--border) bg-(--lozenge-default-bg) text-(--lozenge-default-text)',
  andamento: 'border-transparent bg-(--lozenge-inprogress-bg) text-(--lozenge-inprogress-text)',
  revisao: 'border-transparent bg-(--lozenge-review-bg) text-(--lozenge-review-text)',
  sucesso:
    'border-(--lozenge-success-border) bg-(--lozenge-success-bg) text-(--lozenge-success-text)',
  atencao:
    'border-(--lozenge-warning-border) bg-(--lozenge-warning-bg) text-(--lozenge-warning-text)',
  perigo: 'border-(--lozenge-danger-border) bg-(--lozenge-danger-bg) text-(--lozenge-danger-text)',
  // Faixas de atraso (EQ-03): mais escuro quanto maior o atraso; o número de dias vai escrito.
  perigoMedio: 'border-(--border-danger) bg-(--lozenge-danger-bg) text-(--lozenge-danger-text)',
  perigoForte: 'border-transparent bg-(--danger) text-(--text-inverse)',
}

type Props = ComponentProps<'span'> & { tom?: TomSelo }

/**
 * Selo de situação: o único lugar onde estado tem cor. Badge "tint" do Fluent 2 (ADR-0015): pílula
 * de 20px, fundo e contorno do status, texto de 12px em semibold; sempre com palavra (a cor nunca
 * é o único sinal).
 */
export function Selo({ tom = 'padrao', className, ...rest }: Props) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-[200px] items-center overflow-hidden rounded-(--radius-pill) border px-(--space-075) text-xs font-semibold text-ellipsis whitespace-nowrap',
        TONS[tom],
        className,
      )}
      {...rest}
    />
  )
}
