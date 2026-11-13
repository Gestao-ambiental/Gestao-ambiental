import { Outlet } from 'react-router'

import { BarraSuperior } from '@/components/ui/barra-superior'
import { MarcaGrama } from '@/components/ui/marca-grama'

import { BotaoTema } from './BotaoTema'

/** Layout das rotas públicas (sem rail): logo do produto, tema e o conteúdo num cartão central. */
export function LayoutPublico() {
  return (
    <div className="flex min-h-dvh flex-col">
      <BarraSuperior esquerda={<MarcaGrama />} direita={<BotaoTema />} />
      <main
        id="conteudo"
        className="flex flex-1 items-start justify-center p-(--space-200) pt-(--space-800)"
      >
        <div className="w-full max-w-[400px] rounded-(--radius-large) border bg-(--surface) shadow-cartao p-(--space-300)">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
