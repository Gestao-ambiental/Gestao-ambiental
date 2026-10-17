import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

import { cn } from '@/lib/utils'

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
 * Rail de 240px: superfície branca, separado por borda, nunca por sombra.
 * Referência: docs/design-system/referencia-componentes/navigation/SideNav.jsx.
 */
export function MenuLateral({ rotulo, cabecalho, rodape, children, className }: PropsMenu) {
  return (
    <nav
      aria-label={rotulo}
      className={cn(
        'flex h-full w-(--nav-side-width) shrink-0 flex-col overflow-hidden border-r bg-(--surface-nav)',
        className,
      )}
    >
      {cabecalho ? (
        <div className="px-(--space-150) pt-(--space-150) pb-(--space-100)">{cabecalho}</div>
      ) : null}
      <div className="flex-1 overflow-y-auto px-(--space-100) pt-(--space-050) pb-(--space-200)">
        {children}
      </div>
      {rodape ? <div className="border-t p-(--space-100)">{rodape}</div> : null}
    </nav>
  )
}

/** Grupo do rail, com rótulo opcional em maiúsculas. */
export function MenuLateralSecao({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
  return (
    <div className="mt-(--space-200) first:mt-0">
      {rotulo ? (
        <div className="px-(--space-100) py-(--space-050) rotulo-maiusculo text-(--text-subtlest)">
          {rotulo}
        </div>
      ) : null}
      <ul className="flex flex-col gap-px">{children}</ul>
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
 * Item do rail. Atual = verde lavado com texto de link e aria-current="page"; sem barra lateral.
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
            'group flex h-(--size-control) items-center gap-(--space-100) whitespace-nowrap rounded-(--radius) px-(--space-100) no-underline transicao-estado hover:no-underline',
            isActive
              ? 'bg-(--surface-selected) corpo-medio text-(--text-link) hover:bg-(--surface-selected-hover) hover:text-(--text-link)'
              : 'corpo text-(--text) hover:bg-(--surface-hover) hover:text-(--text)',
          )
        }
      >
        {({ isActive }) => (
          <>
            {icone ? (
              <Icone nome={icone} className={isActive ? 'text-(--icon-brand)' : 'text-(--icon)'} />
            ) : null}
            <span className="flex-1 overflow-hidden text-ellipsis">{children}</span>
            {contagem !== undefined ? <span className="rotulo">{contagem}</span> : null}
          </>
        )}
      </NavLink>
    </li>
  )
}
