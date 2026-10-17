import { useEffect, type ReactNode } from 'react'

interface Props {
  titulo: string
  children: ReactNode
}

/** Moldura de página: título (h1) e o título da aba do navegador. */
export function Pagina({ titulo, children }: Props) {
  useEffect(() => {
    document.title = `${titulo} · Grama`
  }, [titulo])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{titulo}</h1>
      {children}
    </div>
  )
}
