// Diálogo com o comportamento do Dialog do Radix (foco preso, Esc, retorno do foco): véu verde-escuro,
// alinhado ao topo, título grande, ação principal por último à direita. No celular sobe do rodapé.
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
  /** Largura máxima em px (padrão 480, como o Modal do design system). */
  largura?: number
}

export function Dialogo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
  acoes,
  largura = 480,
}: Props) {
  return (
    <Primitivo.Root open={aberto} onOpenChange={aoMudar}>
      <Primitivo.Portal>
        <Primitivo.Overlay className="fixed inset-0 z-50 bg-(--veu) data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center overflow-y-auto px-0 pt-(--e-16) md:items-start md:px-(--e-4) md:py-(--e-16)">
          <Primitivo.Content
            style={{ maxWidth: largura }}
            className="pointer-events-auto w-full rounded-t-(--raio-painel) bg-(--flutuante) text-(--tinta) shadow-dialogo outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 duration-(--dur-media) md:rounded-(--raio-painel) md:data-[state=open]:slide-in-from-top-0 md:data-[state=open]:zoom-in-97 ease-(--saida)"
          >
            <div className="flex items-start gap-(--e-2) px-(--e-6) pt-(--e-6) pb-(--e-2)">
              <Primitivo.Title className="flex-1 pt-(--e-1) titulo-painel">
                {titulo}
              </Primitivo.Title>
              <Primitivo.Close asChild>
                <BotaoIcone icone="x" rotulo="Fechar" />
              </Primitivo.Close>
            </div>
            <div className="flex flex-col gap-(--e-4) px-(--e-6) corpo">
              {descricao ? (
                <Primitivo.Description className="text-pretty">{descricao}</Primitivo.Description>
              ) : (
                <Primitivo.Description className="sr-only">{titulo}</Primitivo.Description>
              )}
              {children}
            </div>
            {acoes ? (
              <div className="flex flex-wrap justify-end gap-(--e-2) p-(--e-6) max-md:flex-col-reverse max-md:[&>*]:w-full">
                {acoes}
              </div>
            ) : (
              <div className="h-(--e-6)" />
            )}
          </Primitivo.Content>
        </div>
      </Primitivo.Portal>
    </Primitivo.Root>
  )
}
