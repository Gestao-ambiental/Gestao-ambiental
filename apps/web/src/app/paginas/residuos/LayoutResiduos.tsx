// Resíduos, fase 1 (sem integração com o IMA; ADR-0028): as abas da área /residuos. Cada aba é uma
// rota (dá para mandar o link), e a página de cada aba tem o próprio título.

import { NavLink, Outlet } from 'react-router'

import { cn } from '@/lib/utils'

const ABAS = [
  { para: '/residuos', rotulo: 'MTRs e CDFs', exato: true },
  { para: '/residuos/conferencia', rotulo: 'Conferência CDF x MTR', exato: false },
  { para: '/residuos/painel', rotulo: 'Painel', exato: false },
  { para: '/residuos/prazos', rotulo: 'Prazos', exato: false },
] as const

export function LayoutResiduos() {
  return (
    <div className="flex min-w-0 flex-col gap-(--space-200)">
      <nav aria-label="Resíduos" className="overflow-x-auto">
        <ul className="flex min-w-max gap-(--space-200) border-b">
          {ABAS.map((aba) => (
            <li key={aba.para} className="shrink-0">
              <NavLink
                to={aba.para}
                end={aba.exato}
                className={({ isActive }) =>
                  cn(
                    '-mb-px inline-flex border-b-2 pb-(--space-100) whitespace-nowrap no-underline transicao-estado hover:text-(--text)',
                    isActive
                      ? 'border-(--brand-stroke) corpo-medio text-(--text-link)'
                      : 'border-transparent corpo text-(--text-subtle)',
                  )
                }
              >
                {aba.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
