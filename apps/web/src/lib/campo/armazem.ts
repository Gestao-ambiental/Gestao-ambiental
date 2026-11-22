// Rascunho do Campo no aparelho (ADR-0060), em IndexedDB. Guarda só o que a técnica registrou:
// resultado, comentário, observação e foto (bytes, nome, tipo, SHA-256, instante e local). Nada de
// token, sessão ou CPF: o envio usa a sessão normal do Supabase. Cada linha leva o id do usuário,
// e trocar de conta apaga as linhas dos outros (celular compartilhado).

import { chaveDoRegistro, type LocalDaFoto, type RegistroNaFila } from '@gestao-ambiental/domain'

export interface DadosDaFoto {
  consultoriaId: string
  nome: string
  mime: string
  /** ArrayBuffer (não Blob): o IndexedDB de todos os navegadores guarda e devolve igual. */
  bytes: ArrayBuffer
  legenda: string | null
  capturadaEm: string
  local: LocalDaFoto
}

export type RegistroDoAparelho =
  | Exclude<RegistroNaFila, { tipo: 'foto' }>
  | (Extract<RegistroNaFila, { tipo: 'foto' }> & { dados: DadosDaFoto })

export interface LinhaDoAparelho {
  /** `${usuarioId}|${chaveDoRegistro}` */
  id: string
  usuarioId: string
  /** Sobe a cada regravação: apagar só a versão que o servidor confirmou. */
  versao: number
  registro: RegistroDoAparelho
}

export interface Armazem {
  guardar(usuarioId: string, registro: RegistroDoAparelho): Promise<LinhaDoAparelho>
  listar(usuarioId: string): Promise<LinhaDoAparelho[]>
  /** Apaga se a versão ainda for a enviada; devolve se apagou. */
  confirmar(id: string, versao: number): Promise<boolean>
  apagar(id: string): Promise<void>
  /** Apaga as linhas de qualquer outro usuário. */
  limparOutros(usuarioId: string): Promise<void>
  fechar(): void
}

export function idDaLinha(usuarioId: string, registro: RegistroNaFila): string {
  return `${usuarioId}|${chaveDoRegistro(registro)}`
}

const BANCO = 'grama-campo'
const LOJA = 'registros'

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    req.onsuccess = () => {
      resolver(req.result)
    }
    req.onerror = () => {
      rejeitar(req.error ?? new Error('indexeddb'))
    }
  })
}

function concluida(tx: IDBTransaction): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    tx.oncomplete = () => {
      resolver()
    }
    tx.onerror = () => {
      rejeitar(tx.error ?? new Error('indexeddb'))
    }
    tx.onabort = () => {
      rejeitar(tx.error ?? new Error('indexeddb_abortada'))
    }
  })
}

function abrir(fabrica: IDBFactory): Promise<IDBDatabase> {
  const req = fabrica.open(BANCO, 1)
  req.onupgradeneeded = () => {
    const loja = req.result.createObjectStore(LOJA, { keyPath: 'id' })
    loja.createIndex('usuario', 'usuarioId')
  }
  return pedido(req)
}

function armazemIndexedDb(fabrica: IDBFactory): Armazem {
  let conexao: Promise<IDBDatabase> | null = null
  const banco = () => (conexao ??= abrir(fabrica))

  async function transacao<T>(
    modo: IDBTransactionMode,
    fazer: (loja: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const tx = (await banco()).transaction(LOJA, modo)
    const fim = concluida(tx)
    const resultado = await fazer(tx.objectStore(LOJA))
    await fim
    return resultado
  }

  return {
    guardar: (usuarioId, registro) =>
      transacao('readwrite', async (loja) => {
        const id = idDaLinha(usuarioId, registro)
        const anterior = (await pedido(loja.get(id))) as LinhaDoAparelho | undefined
        const linha: LinhaDoAparelho = {
          id,
          usuarioId,
          versao: (anterior?.versao ?? 0) + 1,
          registro,
        }
        await pedido(loja.put(linha))
        return linha
      }),
    listar: (usuarioId) =>
      transacao(
        'readonly',
        async (loja) =>
          (await pedido(loja.index('usuario').getAll(usuarioId))) as LinhaDoAparelho[],
      ),
    confirmar: (id, versao) =>
      transacao('readwrite', async (loja) => {
        const atual = (await pedido(loja.get(id))) as LinhaDoAparelho | undefined
        if (atual?.versao !== versao) return false
        await pedido(loja.delete(id))
        return true
      }),
    apagar: (id) =>
      transacao('readwrite', async (loja) => {
        await pedido(loja.delete(id))
      }),
    limparOutros: (usuarioId) =>
      transacao('readwrite', async (loja) => {
        const linhas = (await pedido(loja.getAll())) as LinhaDoAparelho[]
        for (const linha of linhas) {
          if (linha.usuarioId !== usuarioId) await pedido(loja.delete(linha.id))
        }
      }),
    fechar: () => {
      void conexao?.then((db) => {
        db.close()
      })
      conexao = null
    },
  }
}

/** Sem IndexedDB (navegador antigo ou bloqueado): guarda só enquanto a aba está aberta. */
function armazemEmMemoria(): Armazem {
  const linhas = new Map<string, LinhaDoAparelho>()
  return {
    guardar: (usuarioId, registro) => {
      const id = idDaLinha(usuarioId, registro)
      const linha = { id, usuarioId, versao: (linhas.get(id)?.versao ?? 0) + 1, registro }
      linhas.set(id, linha)
      return Promise.resolve(linha)
    },
    listar: (usuarioId) =>
      Promise.resolve([...linhas.values()].filter((l) => l.usuarioId === usuarioId)),
    confirmar: (id, versao) => {
      if (linhas.get(id)?.versao !== versao) return Promise.resolve(false)
      linhas.delete(id)
      return Promise.resolve(true)
    },
    apagar: (id) => {
      linhas.delete(id)
      return Promise.resolve()
    },
    limparOutros: (usuarioId) => {
      for (const [id, l] of linhas) if (l.usuarioId !== usuarioId) linhas.delete(id)
      return Promise.resolve()
    },
    fechar: () => undefined,
  }
}

export function criarArmazem(): Armazem {
  return typeof indexedDB === 'undefined' ? armazemEmMemoria() : armazemIndexedDb(indexedDB)
}
