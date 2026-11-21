import type { ItemDaSemana } from '@/lib/api/minha-semana'

export const CHAVE_MINHA_SEMANA = 'minha-semana'

/** Onde o item abre, já dentro da consultoria dele. */
export function destinoDoItem(item: ItemDaSemana): string | null {
  switch (item.tipo) {
    case 'prazo':
    case 'meta':
      return `/ocorrencias/${item.id}`
    case 'exigencia':
      return `/exigencias/${item.id}`
    case 'acao_legal':
      return item.empreendimentoId
        ? `/empreendimentos/${item.empreendimentoId}#requisitos-legais`
        : null
    default:
      return null
  }
}
