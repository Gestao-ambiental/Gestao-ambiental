// Modal do design system com o comportamento do Dialog do Radix (foco preso, Esc, retorno do foco):
// scrim, alinhado ao topo a 64px, sombra de overlay, ação principal por último à direita.
// Referência: docs/design-system/referencia-componentes/overlay/Modal.jsx.
import { Dialog as Primitivo } from 'radix-ui'
import type { ReactNode } from 'react'

import { BotaoIcone } from './botao-icone'

interface Props {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  titulo: string
  /** Frase lida pelo leitor de tela ao abrir; também aparece no corpo se não houver children. */
  descricao?: ReactNode
  children?: ReactNode
  acoes?: ReactNode
}

export function Dialogo({ aberto, aoMudar, titulo, descricao, children, acoes }: Props) {
  return (
    <Primitivo.Root open={aberto} onOpenChange={aoMudar}>
      <Primitivo.Portal>
        <Primitivo.Overlay className="fixed inset-0 z-50 bg-(--scrim) data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-(--space-200) py-(--space-800)">
          <Primitivo.Content className="pointer-events-auto w-full max-w-[480px] rounded-(--radius) bg-(--surface-overlay) text-(--text) shadow-sobreposicao outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <div className="flex items-start gap-(--space-100) px-(--space-300) pt-(--space-300) pb-(--space-100)">
              <Primitivo.Title className="flex-1 titulo-tela">{titulo}</Primitivo.Title>
              <Primitivo.Close asChild>
                <BotaoIcone icone="x" rotulo="Fechar" />
              </Primitivo.Close>
            </div>
            <div className="flex flex-col gap-(--space-200) px-(--space-300) corpo">
              {descricao ? (
                <Primitivo.Description className="text-pretty">{descricao}</Primitivo.Description>
              ) : (
                <Primitivo.Description className="sr-only">{titulo}</Primitivo.Description>
              )}
              {children}
            </div>
            {acoes ? (
              <div className="flex flex-wrap justify-end gap-(--space-100) p-(--space-300)">
                {acoes}
              </div>
            ) : (
              <div className="h-(--space-300)" />
            )}
          </Primitivo.Content>
        </div>
      </Primitivo.Portal>
    </Primitivo.Root>
  )
}
