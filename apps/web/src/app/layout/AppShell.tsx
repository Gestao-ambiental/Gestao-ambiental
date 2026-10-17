import { useState } from 'react'
import { Link, Outlet } from 'react-router'

import { BarraSuperior } from '@/components/ui/barra-superior'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { MenuLateral } from '@/components/ui/menu-lateral'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { BotaoTema } from './BotaoTema'
import { ConsultoriaAtual } from './ConsultoriaAtual'
import { MenuConta } from './MenuConta'
import { NavegacaoPrincipal } from './NavegacaoPrincipal'

/**
 * Shell fixo do design system: topbar de 56px com o nome do produto em texto, rail de 240px com a
 * consultoria no topo e só a área principal rolando; conteúdo até 1440px. No celular o rail vira
 * gaveta aberta por um botão com nome acessível.
 */
export function AppShell() {
  const [gavetaAberta, setGavetaAberta] = useState(false)

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--space-100) focus:left-(--space-100) focus:z-50 focus:rounded-(--radius) focus:bg-(--surface-overlay) focus:px-(--space-150) focus:py-(--space-100) focus:shadow-sobreposicao"
      >
        Pular para o conteúdo
      </a>

      <BarraSuperior
        esquerda={
          <>
            <Sheet open={gavetaAberta} onOpenChange={setGavetaAberta}>
              <SheetTrigger asChild>
                <BotaoIcone icone="panel-left" rotulo="Abrir menu" className="md:hidden" />
              </SheetTrigger>
              <SheetContent aria-describedby="descricao-gaveta">
                <SheetHeader>
                  <SheetTitle className="text-(--text-brand)">Grama</SheetTitle>
                  <SheetDescription id="descricao-gaveta" className="sr-only">
                    Menu principal e consultoria
                  </SheetDescription>
                </SheetHeader>
                <MenuLateral
                  rotulo="Menu principal"
                  cabecalho={<ConsultoriaAtual />}
                  className="w-full border-r-0"
                >
                  <NavegacaoPrincipal
                    aoNavegar={() => {
                      setGavetaAberta(false)
                    }}
                  />
                </MenuLateral>
              </SheetContent>
            </Sheet>
            <Link
              to="/"
              aria-label="Grama, ir para a Visão da equipe"
              className="titulo-secao text-(--text-brand) no-underline hover:text-(--text-brand) hover:no-underline"
            >
              Grama
            </Link>
          </>
        }
        direita={
          <>
            <BotaoTema />
            <MenuConta />
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <MenuLateral
          rotulo="Menu principal"
          cabecalho={<ConsultoriaAtual />}
          className="hidden md:flex"
        >
          <NavegacaoPrincipal />
        </MenuLateral>
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 overflow-auto outline-none">
          <div className="mx-auto w-full max-w-(--content-max) p-(--space-200) md:p-(--space-300)">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
