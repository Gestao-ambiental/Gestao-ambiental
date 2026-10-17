import { Outlet } from 'react-router'

import { BotaoTema } from './BotaoTema'
import { Marca } from './Marca'

/** Layout das rotas públicas (sem menu): marca, tema e o conteúdo centralizado. */
export function LayoutPublico() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <Marca />
        <BotaoTema />
      </header>
      <main id="conteudo" className="flex flex-1 items-start justify-center p-4 pt-12">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
