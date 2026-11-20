import type { ReactNode } from 'react'
import { Outlet } from 'react-router'

import { MarcaGrama } from '@/components/ui/marca-grama'

import { BotaoTema } from './BotaoTema'

/**
 * Layout das rotas públicas: a placa verde com o logotipo grande (no celular, uma faixa no topo)
 * e o formulário sobre a folha. Com `children`, mostra esse conteúdo no lugar da rota
 * (ex.: "Complete seu cadastro").
 */
export function LayoutPublico({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-(--folha) md:flex-row">
      <div
        data-superficie="trilho"
        className="relative flex shrink-0 items-center justify-between px-(--e-5) py-(--e-4) md:w-[44%] md:max-w-[620px] md:flex-col md:items-start md:justify-between md:p-(--e-12)"
      >
        <MarcaGrama clara largura={112} className="md:hidden" />
        <MarcaGrama clara largura={248} className="hidden md:inline-flex" />
        {/* A marca de trilha do logotipo, em escala de placa: o sinal verde-lima. */}
        <span aria-hidden className="hidden size-24 bg-(--sinal) md:block" />
      </div>
      <main
        id="conteudo"
        className="relative flex flex-1 items-start justify-center px-(--e-5) pt-(--e-10) pb-(--e-12) md:items-center md:px-(--e-12)"
      >
        <div className="absolute top-(--e-4) right-(--e-4)">
          <BotaoTema />
        </div>
        <div className="flex w-full max-w-[400px] flex-col gap-(--e-6)">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  )
}
