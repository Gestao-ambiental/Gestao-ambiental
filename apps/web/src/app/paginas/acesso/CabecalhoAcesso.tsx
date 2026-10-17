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
    <div className="flex flex-col gap-(--space-050)">
      <h1 className="titulo-tela text-(--text)">{titulo}</h1>
      {children ? <p className="corpo text-pretty text-(--text-subtle)">{children}</p> : null}
    </div>
  )
}

/** Linha de rodapé do cartão: "Conta: x@y · Sair", "Voltar para entrar"… */
export function RodapeAcesso({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-(--space-050) gap-y-(--space-025) border-t pt-(--space-200) corpo text-(--text-subtle)">
      {children}
    </div>
  )
}
