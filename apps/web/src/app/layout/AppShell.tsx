import { useRef, useState } from 'react'
import { Link, Outlet } from 'react-router'

import { BarraSuperior } from '@/components/ui/barra-superior'
import { MarcaGrama } from '@/components/ui/marca-grama'
import { MenuLateral } from '@/components/ui/menu-lateral'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useCelular } from '@/lib/usar-celular'

import { BuscaGlobal } from '@/app/busca/BuscaGlobal'
import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { DialogoLinhaDeBase } from '@/app/indicadores/DialogoLinhaDeBase'
import { FaixaComercial } from '@/app/plano/FaixaComercial'

import { AvisoDeEmergenciaDoSuporte } from './AvisoDeEmergenciaDoSuporte'
import { BarraInferior } from './BarraInferior'
import { BotaoTema } from './BotaoTema'
import { ConsultoriaAtual } from './ConsultoriaAtual'
import { MenuConta } from './MenuConta'
import { NavegacaoPrincipal } from './NavegacaoPrincipal'

/** Logotipo claro no topo do trilho, levando à Visão da equipe. */
function MarcaNoTrilho() {
  return (
    <Link
      to="/"
      aria-label="Grama, ir para a Visão da equipe"
      className="flex h-(--barra-altura) items-center rounded-(--raio) px-(--e-3) no-underline hover:no-underline"
    >
      <MarcaGrama largura={104} />
    </Link>
  )
}

/**
 * Casca do app. Desktop: trilho de areia à esquerda (logotipo, consultoria e navegação) e, à
 * direita, a barra com a busca (Ctrl+K), o tema e a conta; só a área principal rola. Celular:
 * barra superior de areia com logotipo e busca, e a barra inferior com os destinos de todo dia e "Mais".
 */
export function AppShell() {
  const [maisAberto, setMaisAberto] = useState(false)
  const botaoMais = useRef<HTMLButtonElement>(null)
  // Em modo suporte a faixa do suporte fica acima: o shell ocupa o resto da altura (ADR-0025).
  const { suporte } = useConsultoria()
  const celular = useCelular()

  return (
    <div className={suporte ? 'flex min-h-0 flex-1' : 'flex h-dvh'}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--e-2) focus:left-(--e-2) focus:z-50 focus:rounded-(--raio) focus:bg-(--sinal) focus:px-(--e-3) focus:py-(--e-2) focus:text-(--sinal-texto) focus:shadow-sobreposicao"
      >
        Pular para o conteúdo
      </a>

      <div
        data-superficie="trilho"
        className="hidden w-(--trilho-largura) shrink-0 flex-col md:flex"
      >
        <div className="flex flex-col gap-(--e-2) px-(--e-3) pt-(--e-2) pb-(--e-3)">
          <MarcaNoTrilho />
          <ConsultoriaAtual />
        </div>
        <MenuLateral rotulo="Menu principal" className="min-h-0 w-full flex-1">
          <NavegacaoPrincipal />
        </MenuLateral>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior
          className="max-md:border-b-0 max-md:bg-(--trilho) max-md:[--icone:var(--trilho-texto)] max-md:[--toque:var(--trilho-toque)] max-md:[--aperto:var(--trilho-toque)] max-md:[--foco:var(--sinal)]"
          esquerda={
            <Link
              to="/"
              aria-label="Grama, ir para a Visão da equipe"
              className="inline-flex rounded-(--raio) no-underline hover:no-underline md:hidden"
            >
              <MarcaGrama largura={96} />
            </Link>
          }
          centro={<BuscaGlobal />}
          direita={
            <>
              <BotaoTema />
              <MenuConta />
            </>
          }
        />
        <main
          id="conteudo"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-auto bg-(--chao) outline-none"
        >
          <div className="mx-auto w-full max-w-(--conteudo-max) px-(--e-4) pt-(--e-5) pb-(--e-10) md:px-(--e-8) md:pt-(--e-8)">
            <AvisoDeEmergenciaDoSuporte />
            <FaixaComercial />
            <Outlet />
            <DialogoLinhaDeBase />
          </div>
        </main>
        {celular ? (
          <BarraInferior
            ref={botaoMais}
            aoAbrirMais={() => {
              setMaisAberto(true)
            }}
          />
        ) : null}
      </div>

      <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
        <SheetContent
          aria-describedby="descricao-mais"
          data-superficie="trilho"
          className="bg-(--trilho)"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            botaoMais.current?.focus()
          }}
        >
          <SheetTitle className="sr-only">Mais</SheetTitle>
          <SheetDescription id="descricao-mais" className="sr-only">
            Menu principal e consultoria
          </SheetDescription>
          <div className="flex flex-col gap-(--e-2) px-(--e-3) pt-(--e-2) pb-(--e-3)">
            <div className="flex h-(--barra-altura) items-center px-(--e-3)">
              <MarcaGrama largura={96} />
            </div>
            <ConsultoriaAtual />
          </div>
          <MenuLateral rotulo="Menu principal" className="min-h-0 w-full flex-1">
            <NavegacaoPrincipal
              aoNavegar={() => {
                setMaisAberto(false)
              }}
            />
          </MenuLateral>
        </SheetContent>
      </Sheet>
    </div>
  )
}
