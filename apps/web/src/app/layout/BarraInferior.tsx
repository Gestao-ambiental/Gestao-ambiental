import { forwardRef } from 'react'
import { NavLink } from 'react-router'

import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

import { useItensDaNavegacao } from './itens-da-navegacao'

const classeItem =
  'flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-(--e-05) rounded-(--raio) text-[11px] leading-4 font-[700] no-underline transicao-estado hover:no-underline'

/**
 * Barra inferior do celular: os destinos de todo dia ao alcance do polegar e "Mais" com o resto.
 * O atual leva a plaqueta verde-lima atrás do ícone (forma e peso, não só cor).
 */
export const BarraInferior = forwardRef<HTMLButtonElement, { aoAbrirMais: () => void }>(
  function BarraInferior({ aoAbrirMais }, refMais) {
    const itens = useItensDaNavegacao().filter((item) => item.naBarraInferior)
    return (
      <nav
        aria-label="Atalhos"
        className="flex h-16 shrink-0 items-stretch gap-(--e-1) border-t bg-(--folha) px-(--e-2) pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {itens.map((item) => (
          <NavLink
            key={item.para}
            to={item.para}
            end={item.para === '/'}
            className={({ isActive }) =>
              cn(classeItem, isActive ? 'text-(--tinta)' : 'text-(--tinta-2) hover:text-(--tinta)')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-(--raio-redondo) transicao-estado',
                    isActive && 'bg-(--sinal) text-(--sinal-texto)',
                  )}
                >
                  <Icone nome={item.icone} tamanho={20} />
                </span>
                <span className="max-w-full truncate">{item.rotuloCurto ?? item.rotulo}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          ref={refMais}
          type="button"
          aria-haspopup="dialog"
          onClick={aoAbrirMais}
          className={cn(classeItem, 'cursor-pointer text-(--tinta-2) hover:text-(--tinta)')}
        >
          <span className="flex h-7 w-12 items-center justify-center">
            <Icone nome="list" tamanho={20} />
          </span>
          <span>Mais</span>
        </button>
      </nav>
    )
  },
)
