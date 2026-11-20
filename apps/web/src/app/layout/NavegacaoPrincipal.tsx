import { ROTULO_DO_GRUPO } from '@/app/navegacao'
import { MenuLateralItem, MenuLateralSecao } from '@/components/ui/menu-lateral'

import { useItensDaNavegacao } from './itens-da-navegacao'

/** Itens do menu principal em grupos (trilho no desktop, "Mais" no celular). */
export function NavegacaoPrincipal({ aoNavegar }: { aoNavegar?: () => void }) {
  const itens = useItensDaNavegacao()
  const grupos = [undefined, 'trabalho', 'gestao'] as const
  return (
    <>
      {grupos.map((grupo) => {
        const doGrupo = itens.filter((item) => item.grupo === grupo)
        if (doGrupo.length === 0) return null
        return (
          <MenuLateralSecao
            key={grupo ?? 'topo'}
            rotulo={grupo ? ROTULO_DO_GRUPO[grupo] : undefined}
          >
            {doGrupo.map(({ para, rotulo, icone }) => (
              <MenuLateralItem
                key={para}
                para={para}
                icone={icone}
                exato={para === '/'}
                aoNavegar={aoNavegar}
              >
                {rotulo}
              </MenuLateralItem>
            ))}
          </MenuLateralSecao>
        )
      })}
    </>
  )
}
