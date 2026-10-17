import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { BotaoTema } from './BotaoTema'
import { Marca } from './Marca'
import { MenuConta } from './MenuConta'
import { MenuNavegacao } from './MenuNavegacao'
import { SeletorConsultoria } from './SeletorConsultoria'

/**
 * Shell do app (Protótipo 05): barra superior com marca, consultoria, tema e conta; menu lateral
 * no desktop e gaveta no celular. A página rola só na região de conteúdo.
 */
export function AppShell() {
  const [gavetaAberta, setGavetaAberta] = useState(false)

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow"
      >
        Pular para o conteúdo
      </a>

      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-4">
        <Sheet open={gavetaAberta} onOpenChange={setGavetaAberta}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>
                <Marca />
              </SheetTitle>
              <SheetDescription className="sr-only">Menu principal e consultoria</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 p-3">
              <SeletorConsultoria className="w-full" />
              <MenuNavegacao
                aoNavegar={() => {
                  setGavetaAberta(false)
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Link to="/" aria-label="Grama, ir para a Visão da equipe" className="rounded-md px-1">
          <Marca />
        </Link>

        <div className="ml-4 hidden min-w-0 max-w-xs md:block">
          <SeletorConsultoria className="w-full" />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <BotaoTema />
          <MenuConta />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-3 md:block">
          <MenuNavegacao />
        </aside>
        <main
          id="conteudo"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-auto focus:outline-none"
        >
          <div className="mx-auto w-full max-w-screen-2xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
