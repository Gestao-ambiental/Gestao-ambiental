// Árvore da lista de condicionantes (passo 3): agrupadores em qualquer nível, irmãos na ordem do
// código da licença ("3.2" antes de "3.10"), recolher como pasta. Só apresentação.
import type { Condicionante, Revisao } from '@/lib/api/licencas'

export interface NoCondicionante {
  item: Condicionante
  filhos: NoCondicionante[]
}

export interface LinhaCondicionante {
  item: Condicionante
  nivel: number
  temFilhos: boolean
  recolhido: boolean
}

/** Ordem do documento: código com números comparados como números; sem código, vai no fim. */
export function compararPorCodigo(a: Condicionante, b: Condicionante): number {
  const ca = a.codigo.trim()
  const cb = b.codigo.trim()
  if (ca && cb) {
    const porCodigo = ca.localeCompare(cb, 'pt-BR', { numeric: true, sensitivity: 'base' })
    if (porCodigo !== 0) return porCodigo
  } else if (ca || cb) {
    return ca ? -1 : 1
  }
  return a.posicao - b.posicao
}

/** Monta a árvore pelos pais. Pai ausente ou ciclo: o item fica na raiz, nunca some. */
export function montarArvore(itens: readonly Condicionante[]): NoCondicionante[] {
  const porId = new Map(itens.map((item) => [item.id, item]))
  const filhosDe = new Map<string | null, Condicionante[]>()

  function paiValido(item: Condicionante): string | null {
    const vistos = new Set([item.id])
    let atual = item.paiId
    while (atual) {
      if (vistos.has(atual)) return null
      vistos.add(atual)
      const pai = porId.get(atual)
      if (!pai) return null
      atual = pai.paiId
    }
    return item.paiId && porId.has(item.paiId) ? item.paiId : null
  }

  for (const item of itens) {
    const pai = paiValido(item)
    filhosDe.set(pai, [...(filhosDe.get(pai) ?? []), item])
  }

  function nos(pai: string | null): NoCondicionante[] {
    return [...(filhosDe.get(pai) ?? [])]
      .sort(compararPorCodigo)
      .map((item) => ({ item, filhos: nos(item.id) }))
  }
  return nos(null)
}

/**
 * Linhas na tela: respeita o que está recolhido. Com filtro, mostra o item que casa e os
 * agrupadores acima dele (para não perder o contexto).
 */
export function linhasVisiveis(
  arvore: readonly NoCondicionante[],
  recolhidos: ReadonlySet<string>,
  filtro: Revisao | 'todos',
): LinhaCondicionante[] {
  const casa = (no: NoCondicionante): boolean =>
    filtro === 'todos' || no.item.revisao === filtro || no.filhos.some(casa)

  const linhas: LinhaCondicionante[] = []
  function percorrer(nos: readonly NoCondicionante[], nivel: number) {
    for (const no of nos) {
      if (!casa(no)) continue
      const recolhido = recolhidos.has(no.item.id)
      linhas.push({ item: no.item, nivel, temFilhos: no.filhos.length > 0, recolhido })
      if (!recolhido) percorrer(no.filhos, nivel + 1)
    }
  }
  percorrer(arvore, 0)
  return linhas
}

/** Ids do item e de tudo abaixo dele (para não escolher um descendente como pai). */
export function descendentes(arvore: readonly NoCondicionante[], id: string): Set<string> {
  const achar = (nos: readonly NoCondicionante[]): NoCondicionante | undefined => {
    for (const no of nos) {
      if (no.item.id === id) return no
      const dentro = achar(no.filhos)
      if (dentro) return dentro
    }
    return undefined
  }
  const ids = new Set<string>()
  const juntar = (no: NoCondicionante) => {
    ids.add(no.item.id)
    no.filhos.forEach(juntar)
  }
  const raiz = achar(arvore)
  if (raiz) juntar(raiz)
  return ids
}

/** Avança o último pedaço do código: "3.2.5.2" → "3.2.5.3", "b)" → "c)". Sem padrão: null. */
function avancar(codigo: string): string | null {
  // A letra só conta sozinha no pedaço ("a)", "3.b"), para "IV" não virar "IW".
  const partes = /^((?:.*[.\s-])?)(\d+|[a-yA-Y])([).]?)$/.exec(codigo)
  if (!partes) return null
  const [, prefixo = '', ultimo = '', sufixo = ''] = partes
  const seguinte = /^\d+$/.test(ultimo)
    ? String(Number(ultimo) + 1)
    : String.fromCharCode(ultimo.charCodeAt(0) + 1)
  return `${prefixo}${seguinte}${sufixo}`
}

/**
 * Código sugerido para o item novo, como o VS Code sugere pelo lugar: o seguinte ao último irmão
 * ("3.2.5.2" → "3.2.5.3"); sem irmãos numerados, o primeiro dentro do agrupador ("3.2.5.1").
 * É só sugestão: a pessoa pode trocar, e numeração fora do padrão (romanos) fica em branco.
 */
export function proximoCodigo(itens: readonly Condicionante[], paiId: string | null): string {
  const irmaos = itens
    .filter((i) => i.paiId === paiId && i.revisao !== 'descartada' && i.codigo.trim())
    .sort(compararPorCodigo)
  const ultimo = irmaos.at(-1)
  if (ultimo) return avancar(ultimo.codigo.trim()) ?? ''
  const pai = paiId ? itens.find((i) => i.id === paiId) : undefined
  if (!pai) return paiId ? '' : '1'
  const codigoDoPai = pai.codigo.trim()
  return codigoDoPai ? `${codigoDoPai}.1` : ''
}

/** Onde entra o item novo (como no explorador do VS Code): no agrupador selecionado ou no pai. */
export function destinoDoNovo(selecionado: Condicionante | undefined): string | null {
  if (!selecionado) return null
  return selecionado.natureza === 'agrupador' ? selecionado.id : selecionado.paiId
}
