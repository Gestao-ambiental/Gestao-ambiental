// Rotas com `lazy`: cada página é um arquivo com hash no nome. Depois de um deploy, a aba aberta
// antes dele ainda pede o hash antigo, que não existe mais, e o import falha. Recarregar a página
// traz o index.html novo com os nomes certos. A marca no sessionStorage evita recarregar em laço
// quando a falha é outra (sem rede, por exemplo): aí o erro segue para a tela de erro da rota.

const CHAVE = 'grama:recarregou-por-rota'
const INTERVALO_MS = 10_000

export function carregarRota<T>(
  importar: () => Promise<T>,
  recarregar: () => void = () => {
    window.location.reload()
  },
): () => Promise<T> {
  return async () => {
    try {
      return await importar()
    } catch (erro) {
      if (recarregouHaPouco()) throw erro
      recarregar()
      // A página está sendo recarregada: não mostra a tela de erro nesse meio-tempo.
      return new Promise<T>(() => undefined)
    }
  }
}

function recarregouHaPouco(): boolean {
  try {
    const ultima = Number(window.sessionStorage.getItem(CHAVE) ?? 0)
    if (Date.now() - ultima < INTERVALO_MS) return true
    window.sessionStorage.setItem(CHAVE, String(Date.now()))
  } catch {
    // Sem sessionStorage não há como evitar o laço: deixa a tela de erro aparecer.
    return true
  }
  return false
}
