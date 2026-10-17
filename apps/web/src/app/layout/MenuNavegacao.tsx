import { NavLink } from 'react-router'

import { ITENS_NAVEGACAO } from '@/app/navegacao'
import { cn } from '@/lib/utils'

interface Props {
  /** Chamado ao escolher um item (a gaveta do celular fecha). */
  aoNavegar?: () => void
}

/** Menu principal. NavLink marca o item atual com aria-current="page" (não só pela cor). */
export function MenuNavegacao({ aoNavegar }: Props) {
  return (
    <nav aria-label="Menu principal">
      <ul className="flex flex-col gap-1">
        {ITENS_NAVEGACAO.map(({ para, rotulo, icone: Icone }) => (
          <li key={para}>
            <NavLink
              to={para}
              end={para === '/'}
              onClick={aoNavegar}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70',
                  isActive &&
                    'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--primary)]',
                )
              }
            >
              <Icone aria-hidden="true" className="size-4 shrink-0" />
              {rotulo}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
