import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tons de situação. Mapeamento de domínio:
 * padrao = a fazer / planejada · andamento = em andamento / espera externa ·
 * atencao = vence em breve / pendente · revisao = em conferência ·
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

/*
 * Situação no quadro de partidas: palavra colorida com uma marca de forma à esquerda, sem
 * pílula. A forma muda com o tom (quadrado cheio, vazado, losango, traço), então o estado se lê
 * mesmo sem cor. Só o atraso forte vira plaqueta cheia, como o "ATRASADO" de painel.
 */
const TONS: Record<TomSelo, { texto: string; marca: string }> = {
  padrao: {
    texto: 'text-(--neutro-texto)',
    marca: 'size-2 rounded-[1px] border-[1.5px] border-current',
  },
  andamento: {
    texto: 'text-(--andamento-texto)',
    marca: 'h-2 w-2 rounded-full border-[1.5px] border-current border-r-transparent',
  },
  revisao: { texto: 'text-(--revisao-texto)', marca: 'size-[7px] rotate-45 bg-current' },
  sucesso: { texto: 'text-(--ok-texto)', marca: 'size-2 rounded-full bg-current' },
  atencao: {
    texto: 'text-(--alerta-texto)',
    marca: 'h-0 w-0 border-x-[4.5px] border-b-[8px] border-x-transparent border-b-current',
  },
  perigo: { texto: 'text-(--atraso-texto)', marca: 'size-2 bg-current' },
  perigoMedio: { texto: 'text-(--atraso-texto)', marca: 'size-2 bg-current' },
  perigoForte: { texto: 'text-(--atraso-texto)', marca: 'size-2 bg-current' },
}

type Props = ComponentProps<'span'> & { tom?: TomSelo }

/** Situação: a única peça onde estado tem cor; sempre com palavra (a cor nunca é o único sinal). */
export function Selo({ tom = 'padrao', className, children, ...rest }: Props) {
  const forte = tom === 'perigoForte'
  const t = TONS[tom]
  return (
    <span
      data-tom={tom}
      className={cn(
        'inline-flex max-w-full items-center gap-(--e-15) overflow-hidden text-xs font-[750] whitespace-nowrap',
        forte
          ? 'min-h-6 rounded-(--raio-mini) bg-(--atraso) px-(--e-2) py-(--e-1) text-(--tinta-inversa) uppercase tracking-[0.04em]'
          : cn('h-5', t.texto),
        className,
      )}
      {...rest}
    >
      {forte ? null : <span aria-hidden className={cn('inline-block shrink-0', t.marca)} />}
      <span className="truncate">{children}</span>
    </span>
  )
}
