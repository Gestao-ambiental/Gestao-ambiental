import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'

import { cn } from '@/lib/utils'

import { IndicadorDeslizante, useIndicadorDeslizante } from './indicador-deslizante'

import { Icone, type NomeIcone } from './icone'

interface PropsMenu {
  /** Nome acessível da navegação (landmark). */
  rotulo: string
  cabecalho?: ReactNode
  rodape?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Trilho de navegação em areia (noite no escuro). Dentro dele os semânticos seguem o trilho
 * (data-superficie="trilho"), então qualquer peça posta aqui se ajusta sozinha.
 */
export function MenuLateral({ rotulo, cabecalho, rodape, children, className }: PropsMenu) {
  // A plaqueta verde do item atual é um indicador só, que desliza de um item para o outro.
  const { pathname } = useLocation()
  const { conteiner, medida, desliza } = useIndicadorDeslizante<HTMLDivElement>(
    'a[aria-current="page"]',
    pathname,
  )
  return (
    <nav
      aria-label={rotulo}
      data-superficie="trilho"
      className={cn(
        'flex h-full w-(--trilho-largura) shrink-0 flex-col overflow-hidden',
        className,
      )}
    >
      {cabecalho ? <div className="px-(--e-3) pt-(--e-2) pb-(--e-3)">{cabecalho}</div> : null}
      <div
        ref={conteiner}
        className="relative flex-1 overflow-y-auto px-(--e-3) pt-(--e-1) pb-(--e-4)"
      >
        <IndicadorDeslizante
          medida={medida}
          desliza={desliza}
          className="rounded-(--raio) bg-(--sinal)"
        />
        {children}
      </div>
      {rodape ? <div className="border-t p-(--e-3)">{rodape}</div> : null}
    </nav>
  )
}

/** Grupo do trilho, com rótulo opcional em maiúsculas. */
export function MenuLateralSecao({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
  return (
    <div className="mt-(--e-5) first:mt-0">
      {rotulo ? (
        <div className="px-(--e-3) pb-(--e-15) rotulo-maiusculo text-(--tinta-2)">{rotulo}</div>
      ) : null}
      <ul className="flex flex-col gap-(--e-05)">{children}</ul>
    </div>
  )
}

interface PropsItem {
  para: string
  icone?: NomeIcone
  children: ReactNode
  /** Só o caminho exato marca como atual (para a rota "/"). */
  exato?: boolean
  contagem?: number
  aoNavegar?: () => void
}

/**
 * Item do trilho. Atual = plaqueta verde com texto branco e aria-current="page" (a marca de
 * trilha do logotipo); a mudança de fundo e de peso diz o estado, não só a cor.
 */
export function MenuLateralItem({ para, icone, children, exato, contagem, aoNavegar }: PropsItem) {
  return (
    <li>
      <NavLink
        to={para}
        end={exato}
        onClick={aoNavegar}
        className={({ isActive }) =>
          cn(
            'group relative flex h-10 max-md:h-(--controle-toque) items-center gap-(--e-3) whitespace-nowrap rounded-(--raio) px-(--e-3) no-underline transicao-estado hover:no-underline',
            isActive
              ? // O fundo verde é o indicador deslizante; o item atual não ganha fundo próprio.
                'corpo-medio text-(--sinal-texto) hover:text-(--sinal-texto)'
              : 'corpo text-(--tinta) hover:bg-(--toque) hover:text-(--tinta) active:bg-(--aperto)',
          )
        }
      >
        {({ isActive }) => (
          <>
            {icone ? (
              <Icone
                nome={icone}
                tamanho={18}
                className={isActive ? 'text-(--sinal-texto)' : 'text-(--icone-2)'}
              />
            ) : null}
            <span className="flex-1 overflow-hidden text-ellipsis">{children}</span>
            {contagem !== undefined && contagem > 0 ? (
              <span
                className={cn(
                  'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                  isActive ? 'bg-(--sinal-texto) text-(--sinal)' : 'bg-(--atraso) text-white',
                )}
              >
                {contagem}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    </li>
  )
}
