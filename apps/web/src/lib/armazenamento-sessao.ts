// "Lembrar de mim" (Protótipo 01): marcado, a sessão fica no localStorage e sobrevive ao fechar o
// navegador; desmarcado, fica no sessionStorage e acaba com a aba. A escolha vale a partir do
// próximo login. Toda leitura e escrita é protegida: o armazenamento pode estar bloqueado.

const CHAVE_LEMBRAR = 'grama:lembrar-sessao'

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
      return local()?.getItem(chave) ?? sessao()?.getItem(chave) ?? null
    } catch {
      return null
    }
  },
  setItem(chave: string, valor: string): void {
    try {
      const [destino, outro] = deveLembrar() ? [local(), sessao()] : [sessao(), local()]
      destino?.setItem(chave, valor)
      outro?.removeItem(chave)
    } catch {
      // sem armazenamento: a sessão vive só na memória desta aba
    }
  },
  removeItem(chave: string): void {
    try {
      local()?.removeItem(chave)
      sessao()?.removeItem(chave)
    } catch {
      // nada a remover
    }
  },
}
