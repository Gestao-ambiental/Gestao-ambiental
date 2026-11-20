import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { ITENS_NAVEGACAO, type ItemNavegacao } from '@/app/navegacao'

/** Itens que este papel vê ("Equipe" e a parte de Gestão só para a Gestão; o banco decide de fato). */
export function useItensDaNavegacao(): readonly ItemNavegacao[] {
  const { atual } = useConsultoria()
  return ITENS_NAVEGACAO.filter((item) => !item.somenteGestao || atual.papel === 'gestao')
}
