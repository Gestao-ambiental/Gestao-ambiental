import { useEffect, type ReactNode } from 'react'

interface Props {
  titulo: string
  children: ReactNode
}

/** Moldura de página: título de tela (20/600) e o título da aba do navegador. */
export function Pagina({ titulo, children }: Props) {
  useEffect(() => {
    document.title = `${titulo} · Grama`
  }, [titulo])

  return (
    <div className="flex flex-col gap-(--space-200)">
      <h1 className="titulo-tela text-(--text)">{titulo}</h1>
      {children}
    </div>
  )
}
