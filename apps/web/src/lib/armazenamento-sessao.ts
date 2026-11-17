// "Lembrar de mim" (Protótipo 01): marcado, a sessão fica no localStorage e sobrevive ao fechar o
// navegador; desmarcado, fica no sessionStorage e acaba com a aba. A escolha vale a partir do
// próximo login. Toda leitura e escrita é protegida: o armazenamento pode estar bloqueado.

const CHAVE_LEMBRAR = 'grama:lembrar-sessao'
const CHAVE_BLOQUEIO_LEGADO = 'gestao-ambiental.tela-bloqueada'

function marcaDeSessaoNova(chave: string): string {
  return `${chave}-apos-bloqueio-legado`
}

function lerItem(armazenamento: Storage | null, chave: string, contaBloqueada: string | null) {
  const valor = armazenamento?.getItem(chave) ?? null
  if (!armazenamento || !valor || !contaBloqueada || !chave.endsWith('-auth-token')) return valor
  if (armazenamento.getItem(marcaDeSessaoNova(chave))) return valor

  // Uma sessão escondida pela versão antiga deve pedir login no primeiro acesso à versão nova.
  const dados = JSON.parse(valor) as { user?: { id?: string } } | null
  if (dados?.user?.id !== contaBloqueada) return valor
  armazenamento.removeItem(chave)
  return null
}

function local(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function sessao(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function definirLembrarSessao(lembrar: boolean): void {
  try {
    local()?.setItem(CHAVE_LEMBRAR, lembrar ? '1' : '0')
  } catch {
    // sem armazenamento: a sessão segue o padrão do navegador
  }
}

function deveLembrar(): boolean {
  try {
    return local()?.getItem(CHAVE_LEMBRAR) !== '0'
  } catch {
    return true
  }
}

/** Adaptador de armazenamento do supabase-js (auth.storage). */
export const armazenamentoSessao = {
  getItem(chave: string): string | null {
    try {
      const localStorage = local()
      const contaBloqueada = localStorage?.getItem(CHAVE_BLOQUEIO_LEGADO) ?? null
      return (
        lerItem(localStorage, chave, contaBloqueada) ?? lerItem(sessao(), chave, contaBloqueada)
      )
    } catch {
      return null
    }
  },
  setItem(chave: string, valor: string): void {
    try {
      const [destino, outro] = deveLembrar() ? [local(), sessao()] : [sessao(), local()]
      destino?.setItem(chave, valor)
      outro?.removeItem(chave)
      if (chave.endsWith('-auth-token') && local()?.getItem(CHAVE_BLOQUEIO_LEGADO)) {
        destino?.setItem(marcaDeSessaoNova(chave), '1')
        outro?.removeItem(marcaDeSessaoNova(chave))
      }
    } catch {
      // sem armazenamento: a sessão vive só na memória desta aba
    }
  },
  removeItem(chave: string): void {
    try {
      local()?.removeItem(chave)
      sessao()?.removeItem(chave)
      if (chave.endsWith('-auth-token')) {
        local()?.removeItem(marcaDeSessaoNova(chave))
        sessao()?.removeItem(marcaDeSessaoNova(chave))
      }
    } catch {
      // nada a remover
    }
  },
}
