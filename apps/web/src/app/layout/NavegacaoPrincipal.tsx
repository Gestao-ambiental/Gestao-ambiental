import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursoLiberado } from '@/app/consultoria/recurso-liberado'
import { ITENS_NAVEGACAO } from '@/app/navegacao'
import { MenuLateralItem, MenuLateralSecao } from '@/components/ui/menu-lateral'

/**
 * Itens do menu principal (rail no desktop, gaveta no celular). "Equipe" só para a Gestão; item de
 * recurso do plano (Planejamento) só quando o plano tem o recurso.
 */
export function NavegacaoPrincipal({ aoNavegar }: { aoNavegar?: () => void }) {
  const { atual } = useConsultoria()
  const capacidade = useRecursoLiberado('capacidade')
  const itens = ITENS_NAVEGACAO.filter(
    (item) =>
      (!item.somenteGestao || atual.papel === 'gestao') &&
      (!item.recurso || capacidade.data === true),
  )
  return (
    <MenuLateralSecao>
      {itens.map(({ para, rotulo, icone }) => (
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
