// Resíduos, fase 1 (sem integração com o IMA; ADR-0028): as abas da área /residuos. Cada aba é uma
// rota (dá para mandar o link); a página de cada aba tem o próprio título e põe as abas logo
// abaixo dele (<AbasResiduos /> como primeiro filho da <Pagina>).

import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { conferenciaDeResiduos } from '@/lib/api/residuos'
import { cn } from '@/lib/utils'

const ABAS = [
  { para: '/residuos', rotulo: 'MTRs e CDFs', exato: true },
  { para: '/residuos/conferencia', rotulo: 'Conferência CDF x MTR', exato: false },
  { para: '/residuos/painel', rotulo: 'Painel', exato: false },
  { para: '/residuos/prazos', rotulo: 'Prazos', exato: false },
] as const

export function LayoutResiduos() {
  return <Outlet />
}

/** Abas da área, abaixo do título; a conferência leva a quantidade de pendências. */
export function AbasResiduos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  // Mesma chave da conferência sem filtro: a aba e a página dividem a consulta.
  const pendencias = useQuery({
    queryKey: ['residuos', 'conferencia', cid, null],
    queryFn: () => conferenciaDeResiduos(cid, null),
  })
  const quantas = pendencias.data?.length ?? 0

  return (
    <nav
      aria-label="Resíduos"
      className="-mx-(--e-4) overflow-x-auto px-(--e-4) [scrollbar-width:none] md:mx-0 md:px-0"
    >
      <ul className="flex min-w-max gap-(--e-5) border-b border-(--regra-forte)">
        {ABAS.map((aba) => (
          <li key={aba.para} className="shrink-0">
            <NavLink
              to={aba.para}
              end={aba.exato}
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex h-11 items-center gap-(--e-2) border-b-[3px] whitespace-nowrap titulo-secao no-underline transicao-estado hover:text-(--tinta) hover:no-underline',
                  isActive
                    ? 'border-(--marca-linha) text-(--tinta)'
                    : 'border-transparent text-(--tinta-2)',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {aba.rotulo}
                  {aba.para === '/residuos/conferencia' && quantas > 0 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                        isActive
                          ? 'bg-(--tinta) text-(--folha)'
                          : 'bg-(--alerta-fundo) text-(--alerta-texto)',
                      )}
                    >
                      {quantas}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
