import { useEffect, type ReactNode } from 'react'

/** Título e linha de apoio das telas públicas (cartão central do LayoutPublico). */
export function CabecalhoAcesso({
  titulo,
  tituloDaAba = titulo,
  children,
}: {
  titulo: string
  tituloDaAba?: string
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `${tituloDaAba} · Grama`
  }, [tituloDaAba])

  return (
    <div className="flex flex-col gap-(--e-1)">
      <h1 className="titulo-tela text-(--tinta)">{titulo}</h1>
      {children ? <p className="corpo text-pretty text-(--tinta-2)">{children}</p> : null}
    </div>
  )
}

/** Linha de rodapé do cartão: "Conta: x@y · Sair", "Voltar para entrar"… */
export function RodapeAcesso({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-(--e-1) gap-y-(--e-05) border-t pt-(--e-4) corpo text-(--tinta-2)">
      {children}
    </div>
  )
}
