import { CircleAlert, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  titulo?: string
  descricao?: ReactNode
  /** Se informado, mostra "Tentar de novo" (ex.: refetch da consulta). */
  aoTentarDeNovo?: () => void
  className?: string
}

/** Erro ao carregar: diz o que falhou sem detalhe técnico e oferece tentar de novo. */
export function EstadoErro({
  titulo = 'Não foi possível carregar',
  descricao = 'Verifique a conexão e tente de novo. Se continuar, avise a gestão da consultoria.',
  aoTentarDeNovo,
  className,
}: Props) {
  return (
    <section
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-8 text-destructive" />
      <h2 className="text-base font-semibold">{titulo}</h2>
      <p className="max-w-prose text-muted-foreground">{descricao}</p>
      {aoTentarDeNovo ? (
        <Button variant="outline" className="mt-2" onClick={aoTentarDeNovo}>
          <RotateCw aria-hidden="true" />
          Tentar de novo
        </Button>
      ) : null}
    </section>
  )
}
