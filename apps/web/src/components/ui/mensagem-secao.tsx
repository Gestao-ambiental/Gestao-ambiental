import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone, type NomeIcone } from './icone'

type Tom = 'informacao' | 'sucesso' | 'atencao' | 'perigo'

const TONS: Record<Tom, { classes: string; icone: NomeIcone }> = {
  informacao: {
    classes: 'bg-(--andamento-fundo) [--cor-icone:var(--andamento-texto)]',
    icone: 'info',
  },
  sucesso: {
    classes: 'bg-(--ok-fundo) [--cor-icone:var(--ok-texto)]',
    icone: 'circle-check',
  },
  atencao: {
    classes: 'bg-(--alerta-fundo) [--cor-icone:var(--alerta-texto)]',
    icone: 'triangle-alert',
  },
  perigo: {
    classes: 'bg-(--atraso-fundo) [--cor-icone:var(--atraso-texto)]',
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
 * Mensagem dentro da coluna de conteúdo (nunca flutua): faixa no fundo do status, ícone do status
 * à esquerda e título forte.
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
        'entrar flex gap-(--e-3) rounded-(--raio) px-(--e-4) py-(--e-3)',
        classes,
        className,
      )}
    >
      <Icone nome={icone} tamanho={18} className="mt-px text-(--cor-icone)" />
      <div className="flex flex-1 flex-col gap-(--e-1) text-(--tinta)">
        {titulo ? <div className="corpo-medio">{titulo}</div> : null}
        {children ? <div className="max-w-[75ch] corpo text-pretty">{children}</div> : null}
        {acoes ? <div className="mt-(--e-1) flex gap-(--e-2)">{acoes}</div> : null}
      </div>
    </div>
  )
}
