import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tons do design system (lozenge). Mapeamento de domínio (README do DS):
 * padrao = a fazer / planejada · andamento = em andamento / espera externa ·
 * atencao = pendente de revisão / vence em breve · revisao = em conferência ·
 * sucesso = concluída / vigente · perigo = atrasada / vencida / devolvida.
 */
export type TomSelo = 'padrao' | 'andamento' | 'revisao' | 'sucesso' | 'atencao' | 'perigo'

const TONS: Record<TomSelo, string> = {
  padrao: 'bg-(--lozenge-default-bg) text-(--lozenge-default-text)',
  andamento: 'bg-(--lozenge-inprogress-bg) text-(--lozenge-inprogress-text)',
  revisao: 'bg-(--lozenge-review-bg) text-(--lozenge-review-text)',
  sucesso: 'bg-(--lozenge-success-bg) text-(--lozenge-success-text)',
  atencao: 'bg-(--lozenge-warning-bg) text-(--lozenge-warning-text)',
  perigo: 'bg-(--lozenge-danger-bg) text-(--lozenge-danger-text)',
}

type Props = ComponentProps<'span'> & { tom?: TomSelo }

/**
 * Selo de situação: o único lugar onde estado tem cor. Fundo lavado, texto escuro, 11px em
 * maiúsculas; sempre com palavra (a cor nunca é o único sinal).
 * Referência: docs/design-system/referencia-componentes/core/Lozenge.jsx.
 */
export function Selo({ tom = 'padrao', className, ...rest }: Props) {
  return (
    <span
      className={cn(
        'inline-flex h-4 max-w-[200px] items-center overflow-hidden rounded-(--radius) px-(--space-075) text-ellipsis whitespace-nowrap rotulo-maiusculo',
        TONS[tom],
        className,
      )}
      {...rest}
    />
  )
}
