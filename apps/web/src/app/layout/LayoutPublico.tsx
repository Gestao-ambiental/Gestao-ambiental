import type { ReactNode } from 'react'
import { Outlet } from 'react-router'

import { MarcaGrama } from '@/components/ui/marca-grama'

import { BotaoTema } from './BotaoTema'

/** O traço de pincel do herói do site, sob a frase, no verde do destaque. Decorativo. */
function Pincel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="var(--sinal)"
      strokeLinecap="round"
    >
      <path d="M4 10 C 70 4, 150 12, 296 6" strokeWidth="7" />
      <path d="M30 13 C 110 9, 200 14, 270 10" strokeWidth="3" opacity="0.7" />
    </svg>
  )
}

/**
 * Layout das rotas públicas (opção C escolhida pelo Eduardo): à esquerda, a frase do herói do site
 * em Anton com o pincel verde, sobre a areia; à direita, o formulário. No celular, o logotipo
 * e a primeira frase em cima e o formulário embaixo. Com `children`, mostra esse conteúdo no lugar
 * da rota (ex.: "Complete seu cadastro").
 */
export function LayoutPublico({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-(--chao) md:flex-row">
      <div className="absolute top-(--e-3) right-(--e-3) z-10 md:top-(--e-4) md:right-(--e-4)">
        <BotaoTema />
      </div>
      <div className="flex shrink-0 flex-col gap-(--e-5) bg-(--trilho) px-(--e-5) pt-(--e-6) pb-(--e-6) md:w-[48%] md:max-w-[720px] md:justify-between md:gap-0 md:p-(--e-12)">
        <MarcaGrama largura={104} className="md:hidden" />
        <MarcaGrama largura={128} className="hidden md:inline-flex" />
        <div className="flex flex-col">
          <p className="font-(family-name:--fonte-destaque) text-[34px] leading-[36px] tracking-[0.01em] text-(--tinta) uppercase md:text-[clamp(44px,4.6vw,72px)] md:leading-[1]">
            <span className="md:block">Sua gestão </span>
            <span className="md:block">ambiental inteira.</span>
            <span className="hidden md:block">Em um só lugar.</span>
          </p>
          <Pincel className="mt-(--e-1) h-3 w-[72%] md:h-4 md:w-[min(520px,90%)]" />
        </div>
        <span className="hidden text-xs text-(--tinta-3) md:block">gramaapp.com.br</span>
      </div>
      <main
        id="conteudo"
        className="flex flex-1 items-start justify-center px-(--e-5) pt-(--e-8) pb-(--e-12) md:items-center md:px-(--e-12)"
      >
        <div className="flex w-full max-w-[400px] flex-col gap-(--e-6)">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  )
}
