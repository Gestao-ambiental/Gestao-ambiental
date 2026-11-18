import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { BarraSuperior } from '@/components/ui/barra-superior'
import { Icone } from '@/components/ui/icone'
import { MarcaGrama } from '@/components/ui/marca-grama'
import { MenuLateral } from '@/components/ui/menu-lateral'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { DialogoLinhaDeBase } from '@/app/indicadores/DialogoLinhaDeBase'
import { FaixaComercial } from '@/app/plano/FaixaComercial'
import { useConectado } from '@/lib/vistoria-offline/app'

import { AvisoDeEmergenciaDoSuporte } from './AvisoDeEmergenciaDoSuporte'
import { BotaoTema } from './BotaoTema'
import { ConsultoriaAtual } from './ConsultoriaAtual'
import { MenuConta } from './MenuConta'
import { NavegacaoPrincipal } from './NavegacaoPrincipal'

const atalhos = [
  { para: '/', rotulo: 'Início', icone: 'house' },
  { para: '/calendario', rotulo: 'Calendário', icone: 'calendar' },
  { para: '/campo', rotulo: 'Vistorias', icone: 'image' },
] as const
const classeAtalho =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 py-1 text-xs text-(--text-subtle) no-underline hover:text-(--text) hover:no-underline'

/**
 * Shell fixo do design system: topbar de 56px com a logo do produto, rail de 240px com a
 * consultoria no topo e só a área principal rolando; conteúdo até 1440px. No celular o rail vira
 * gaveta aberta por um botão com nome acessível.
 */
export function AppShell() {
  const [gavetaAberta, setGavetaAberta] = useState(false)
  // Em modo suporte a faixa do suporte fica acima: o shell ocupa o resto da altura (ADR-0025).
  const { suporte } = useConsultoria()
  const conectado = useConectado()

  return (
    <div className={suporte ? 'flex min-h-0 flex-1 flex-col' : 'flex h-dvh flex-col'}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--space-100) focus:left-(--space-100) focus:z-50 focus:rounded-(--radius) focus:bg-(--surface-overlay) focus:px-(--space-150) focus:py-(--space-100) focus:shadow-sobreposicao"
      >
        Pular para o conteúdo
      </a>

      <BarraSuperior
        esquerda={
          <Link
            to="/"
            aria-label="Grama, ir para a Visão da equipe"
            className="inline-flex rounded-(--radius) no-underline hover:no-underline"
          >
            <MarcaGrama />
          </Link>
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
          <div className="w-full p-(--space-200) md:p-(--space-300)">
            {!conectado ? (
              <p role="status" className="mb-3 rounded-(--radius) border bg-(--surface) p-3">
                Sem conexão
                {suporte ? (
                  '.'
                ) : (
                  <>
                    {' '}
                    · <Link to="/campo/offline">Abrir vistorias salvas</Link>
                  </>
                )}
              </p>
            ) : null}
            <AvisoDeEmergenciaDoSuporte />
            <FaixaComercial />
            <Outlet />
            <DialogoLinhaDeBase />
          </div>
        </main>
      </div>
      <nav
        aria-label="Atalhos do celular"
        className="flex shrink-0 border-t bg-(--surface-nav) pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {atalhos.map(({ para, rotulo, icone }) => (
          <NavLink
            key={para}
            to={!conectado && para === '/campo' ? '/campo/offline' : para}
            end={para === '/'}
            className={
              classeAtalho +
              ' aria-[current=page]:bg-(--surface-selected) aria-[current=page]:font-semibold aria-[current=page]:text-(--text-brand)'
            }
          >
            <Icone nome={icone} /> {rotulo}
          </NavLink>
        ))}
        <Sheet open={gavetaAberta} onOpenChange={setGavetaAberta}>
          <SheetTrigger asChild>
            <button type="button" aria-label="Abrir menu" className={classeAtalho}>
              <Icone nome="ellipsis" /> Mais
            </button>
          </SheetTrigger>
          <SheetContent aria-describedby="descricao-gaveta" className="w-[min(20rem,90vw)]">
            <SheetHeader>
              <SheetTitle>
                <MarcaGrama />
              </SheetTitle>
              <SheetDescription id="descricao-gaveta" className="sr-only">
                Menu principal e consultoria
              </SheetDescription>
            </SheetHeader>
            <MenuLateral
              rotulo="Menu principal"
              cabecalho={<ConsultoriaAtual />}
              className="min-h-0 w-full flex-1 overflow-y-auto border-r-0 pb-[env(safe-area-inset-bottom)] [&_a]:min-h-11"
            >
              <NavegacaoPrincipal
                aoNavegar={() => {
                  setGavetaAberta(false)
                }}
              />
            </MenuLateral>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  )
}
