// Cores por categoria no calendário (pedido do Eduardo, 20/11/2026): colorir por área (a profissão
// do responsável) ou por pessoa. A paleta é própria, de 9 cores suaves (quentes e frias
// alternadas, para vizinhas não se confundirem), sem o lima (que fica só
// para o "agora" e o destaque). Aqui só a escolha do índice da cor; as cores são tokens de CSS
// (--categoria-1 a --categoria-9), para funcionar no claro e no escuro.
//
// Estável: a mesma pessoa ou área fica com a mesma cor de uma visita para outra. Sem repetir: com
// até 9 categorias na tela, nenhuma divide a cor com outra.

export const QUANTIDADE_DE_CORES = 9

/** Hash FNV-1a de 32 bits: rápido, estável e bem espalhado para ids. */
export function hashEstavel(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Cor (0 a 8) de cada chave, sem repetir enquanto houver cor livre. Cada chave começa na cor do
 * próprio hash e, se ela já estiver tomada, pega a próxima livre. As chaves são tratadas em ordem
 * fixa (ordenadas), então o resultado não depende da ordem em que chegaram.
 */
export function coresSemRepetir(chaves: Iterable<string>): Map<string, number> {
  const ordenadas = [...new Set(chaves)].sort()
  const cores = new Map<string, number>()
  const tomadas = new Set<number>()
  for (const chave of ordenadas) {
    let cor = hashEstavel(chave) % QUANTIDADE_DE_CORES
    if (tomadas.size < QUANTIDADE_DE_CORES) {
      while (tomadas.has(cor)) cor = (cor + 1) % QUANTIDADE_DE_CORES
    }
    tomadas.add(cor)
    cores.set(chave, cor)
  }
  return cores
}

/**
 * Cor de cada área presente, na ordem do catálogo de profissões: a primeira área do catálogo que
 * aparece pega a cor 0, a seguinte a 1, e assim por diante. A mesma equipe vê sempre as mesmas cores.
 */
export function coresDasAreas(
  presentes: Iterable<string>,
  ordemDoCatalogo: readonly string[],
): Map<string, number> {
  const conjunto = new Set(presentes)
  const posicao = (codigo: string) => {
    const i = ordemDoCatalogo.indexOf(codigo)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const ordenadas = [...conjunto].sort((a, b) => posicao(a) - posicao(b) || a.localeCompare(b))
  return new Map(ordenadas.map((codigo, i) => [codigo, i % QUANTIDADE_DE_CORES]))
}

/** Iniciais para marcar a categoria no evento, junto da cor: "Bruno Tavares" vira "BT". */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(de|da|do|das|dos|e)$/i.test(p))
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : (partes[0]?.[1] ?? '')
  return (primeira + ultima).toUpperCase()
}
