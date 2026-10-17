import { ITENS_NAVEGACAO } from '@/app/navegacao'
import { MenuLateralItem, MenuLateralSecao } from '@/components/ui/menu-lateral'

/** Itens do menu principal (rail no desktop, gaveta no celular). */
export function NavegacaoPrincipal({ aoNavegar }: { aoNavegar?: () => void }) {
  return (
    <MenuLateralSecao>
      {ITENS_NAVEGACAO.map(({ para, rotulo, icone }) => (
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
}
