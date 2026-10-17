import { Outlet } from 'react-router'

import { BarraSuperior } from '@/components/ui/barra-superior'

import { BotaoTema } from './BotaoTema'

/** Layout das rotas públicas (sem rail): nome do produto, tema e o conteúdo num cartão central. */
export function LayoutPublico() {
  return (
    <div className="flex min-h-dvh flex-col">
      <BarraSuperior
        esquerda={<span className="titulo-secao text-(--text-brand)">Grama</span>}
        direita={<BotaoTema />}
      />
      <main
        id="conteudo"
        className="flex flex-1 items-start justify-center p-(--space-200) pt-(--space-800)"
      >
        <div className="w-full max-w-[400px] rounded-(--radius) border bg-(--surface) p-(--space-300)">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
