// Acha um trecho na camada de texto do pdf.js e o marca (fonte de um campo proposto pela IA).
// O PDF parte o texto em pedaços (um span por trecho de linha) e a IA pode mudar espaços, caixa
// ou acento: a busca compara o texto sem espaços, sem acento e em minúsculas.

export const CLASSE_DESTAQUE = 'highlight appended destaque-ia'

interface Posicao {
  no: Text
  deslocamento: number
}

/** Sem acento, sem espaço e em minúsculas: como o trecho e a camada são comparados. */
export function normalizarTrecho(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s/g, '')
    .toLowerCase()
}

/** Tira as marcas de uma busca anterior, devolvendo o texto como estava. */
export function limparDestaques(camada: HTMLElement): void {
  for (const marca of camada.querySelectorAll('.destaque-ia')) {
    marca.replaceWith(...marca.childNodes)
  }
  camada.normalize()
}

/**
 * Marca o primeiro dos `trechos` que aparecer na camada e devolve a primeira marca, ou null se
 * nenhum aparecer (aí fica só a página, como antes).
 */
export function destacarTrecho(
  camada: HTMLElement,
  trechos: readonly (string | null | undefined)[],
): HTMLElement | null {
  limparDestaques(camada)

  const posicoes: Posicao[] = []
  let texto = ''
  const percorrer = camada.ownerDocument.createTreeWalker(camada, NodeFilter.SHOW_TEXT)
  for (let no = percorrer.nextNode(); no; no = percorrer.nextNode()) {
    const conteudo = no.textContent ?? ''
    for (let i = 0; i < conteudo.length; i++) {
      const normal = normalizarTrecho(conteudo.charAt(i))
      for (const letra of normal) {
        texto += letra
        posicoes.push({ no: no as Text, deslocamento: i })
      }
    }
  }

  for (const trecho of trechos) {
    if (!trecho) continue
    const procurado = normalizarTrecho(trecho)
    // Trecho curto demais ("1", "a") acharia qualquer coisa.
    if (procurado.length < 3) continue
    const inicio = texto.indexOf(procurado)
    if (inicio < 0) continue
    const primeiro = posicoes[inicio]
    const ultimo = posicoes[inicio + procurado.length - 1]
    if (!primeiro || !ultimo) continue
    return marcar(posicoes, primeiro, ultimo)
  }
  return null
}

/** Envolve cada pedaço de nó de texto entre `primeiro` e `ultimo` (inclusive) numa marca. */
function marcar(posicoes: readonly Posicao[], primeiro: Posicao, ultimo: Posicao): HTMLElement {
  const pedacos: { no: Text; de: number; ate: number }[] = []
  let dentro = false
  for (const posicao of posicoes) {
    if (posicao === primeiro) dentro = true
    if (dentro) {
      const atual = pedacos[pedacos.length - 1]
      if (atual?.no === posicao.no) atual.ate = posicao.deslocamento + 1
      else pedacos.push({ no: posicao.no, de: posicao.deslocamento, ate: posicao.deslocamento + 1 })
    }
    if (posicao === ultimo) break
  }

  // Do fim para o começo: dividir um nó não mexe nos deslocamentos dos anteriores.
  const marcas: HTMLElement[] = []
  for (const { no, de, ate } of pedacos.reverse()) {
    const intervalo = no.ownerDocument.createRange()
    intervalo.setStart(no, de)
    intervalo.setEnd(no, ate)
    const marca = no.ownerDocument.createElement('span')
    marca.className = CLASSE_DESTAQUE
    intervalo.surroundContents(marca)
    marcas.unshift(marca)
  }
  const [primeira] = marcas
  if (!primeira) throw new Error('trecho sem marca')
  return primeira
}

/** Trecho curto ("Ruído") acharia a página errada: para procurar no documento, só trecho longo. */
const MINIMO_PARA_PROCURAR = 12

/**
 * Página (1, 2…) onde aparece o primeiro trecho, na ordem de preferência; null se nenhum.
 * `paginas` é o texto de cada página, como o pdf.js extrai.
 */
export function paginaComTrecho(
  paginas: readonly string[],
  trechos: readonly (string | null | undefined)[],
): number | null {
  const normalizadas = paginas.map(normalizarTrecho)
  for (const trecho of trechos) {
    const procurado = normalizarTrecho(trecho ?? '')
    if (procurado.length < MINIMO_PARA_PROCURAR) continue
    const indice = normalizadas.findIndex((texto) => texto.includes(procurado))
    if (indice >= 0) return indice + 1
  }
  return null
}
