import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone, type NomeIcone } from './icone'

type Tom = 'informacao' | 'sucesso' | 'atencao' | 'perigo'

const TONS: Record<Tom, { classes: string; icone: NomeIcone }> = {
  informacao: {
    classes: 'bg-(--lozenge-inprogress-bg) [--cor-icone:var(--lozenge-inprogress-text)]',
    icone: 'info',
  },
  sucesso: {
    classes: 'bg-(--lozenge-success-bg) [--cor-icone:var(--lozenge-success-text)]',
    icone: 'circle-check',
  },
  atencao: {
    classes: 'bg-(--lozenge-warning-bg) [--cor-icone:var(--lozenge-warning-text)]',
    icone: 'triangle-alert',
  },
  perigo: {
    classes: 'bg-(--lozenge-danger-bg) [--cor-icone:var(--lozenge-danger-text)]',
    icone: 'circle-alert',
  },
}

interface Props {
  tom?: Tom
  titulo?: ReactNode
  children?: ReactNode
  acoes?: ReactNode
  /** role="alert" para erro que acabou de acontecer; omitir para condição permanente da tela. */
  role?: 'alert' | 'status'
  className?: string
}

/**
 * Mensagem dentro da coluna de conteúdo (nunca flutua): tinta lavada da paleta de selos, sem
 * borda, raio 3px. Referência: docs/design-system/referencia-componentes/overlay/SectionMessage.jsx.
 */
export function MensagemSecao({
  tom = 'informacao',
  titulo,
  children,
  acoes,
  role,
  className,
}: Props) {
  const { classes, icone } = TONS[tom]
  return (
    <div
      role={role}
      className={cn(
        'flex gap-(--space-100) rounded-(--radius) p-(--space-150)',
        classes,
        className,
      )}
    >
      <Icone nome={icone} className="mt-0.5 text-(--cor-icone)" />
      <div className="flex flex-1 flex-col gap-(--space-050) text-(--text)">
        {titulo ? <div className="corpo font-semibold">{titulo}</div> : null}
        {children ? <div className="corpo text-pretty">{children}</div> : null}
        {acoes ? <div className="mt-(--space-050) flex gap-(--space-100)">{acoes}</div> : null}
      </div>
    </div>
  )
}
