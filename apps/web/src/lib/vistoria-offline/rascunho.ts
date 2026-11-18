import type { LocalDaFoto } from '@gestao-ambiental/domain'

import type { ItemDaVistoriaGravado, Vistoria } from '@/lib/api/vistorias'

export const PRAZO_OFFLINE = 24 * 60 * 60 * 1000
export const LIMITE_FOTOS_OFFLINE = 50

export interface FotoOffline {
  id: string
  itemId: string
  arquivo: File
  criadaEm: string
  legenda: string
  local: LocalDaFoto
}

type ContextoVisita = Pick<
  Vistoria,
  | 'id'
  | 'titulo'
  | 'empreendimentoNome'
  | 'unidadeNome'
  | 'unidadeEndereco'
  | 'objetivo'
  | 'dataPlanejada'
  | 'rowVersion'
>

export interface RascunhoOffline {
  chave: [usuario: string, consultoria: string, vistoria: string]
  membroId: string
  acessoAte: number
  versaoLocal: number
  visita: ContextoVisita
  base: { itens: ItemDaVistoriaGravado[]; observacao: string | null }
  itens: ItemDaVistoriaGravado[]
  observacao: string
  fotos: FotoOffline[]
  revisado: boolean
  envioId: string | null
}

export function criarRascunho(
  usuarioId: string,
  membroId: string,
  vistoria: Vistoria,
  itens: ItemDaVistoriaGravado[],
): RascunhoOffline {
  const {
    id,
    consultoriaId,
    titulo,
    empreendimentoNome,
    unidadeNome,
    unidadeEndereco,
    objetivo,
    dataPlanejada,
    rowVersion,
    observacao,
  } = vistoria
  return {
    chave: [usuarioId, consultoriaId, id],
    membroId,
    acessoAte: Date.now() + PRAZO_OFFLINE,
    versaoLocal: 0,
    visita: {
      id,
      titulo,
      empreendimentoNome,
      unidadeNome,
      unidadeEndereco,
      objetivo,
      dataPlanejada,
      rowVersion,
    },
    base: { itens, observacao },
    itens,
    observacao: observacao ?? '',
    fotos: [],
    revisado: false,
    envioId: null,
  }
}

let abertura: Promise<IDBDatabase> | undefined

async function abrirBanco() {
  abertura ??= new Promise<IDBDatabase>((resolve, reject) => {
    const pedido = indexedDB.open('grama-vistorias-offline', 1)
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore('rascunhos', { keyPath: 'chave' })
    }
    pedido.onsuccess = () => {
      const banco = pedido.result
      banco.onversionchange = () => {
        banco.close()
        abertura = undefined
      }
      resolve(banco)
    }
    pedido.onerror = () => {
      reject(pedido.error ?? new Error('Não foi possível abrir o armazenamento local.'))
    }
  }).catch((erro: unknown) => {
    abertura = undefined
    throw erro
  })
  return abertura
}

export async function lerRascunhos(
  usuario: string,
  consultoria: string,
): Promise<RascunhoOffline[]> {
  const banco = await abrirBanco()
  return new Promise((resolve, reject) => {
    const tabela = banco.transaction('rascunhos').objectStore('rascunhos')
    const pedido = tabela.getAll(
      IDBKeyRange.bound([usuario, consultoria, ''], [usuario, consultoria, '\uffff']),
    )
    pedido.onsuccess = () => {
      resolve(pedido.result as RascunhoOffline[])
    }
    pedido.onerror = () => {
      reject(pedido.error ?? new Error('Não foi possível ler os rascunhos.'))
    }
  })
}

export async function gravarRascunho(
  rascunho: RascunhoOffline,
  remover = false,
): Promise<RascunhoOffline> {
  const banco = await abrirBanco()
  const salvo = { ...rascunho, versaoLocal: rascunho.versaoLocal + 1 }
  return new Promise((resolve, reject) => {
    const transacao = banco.transaction('rascunhos', 'readwrite')
    const tabela = transacao.objectStore('rascunhos')
    const pedido = tabela.get(rascunho.chave)
    pedido.onsuccess = () => {
      const anterior = pedido.result as RascunhoOffline | undefined
      if ((anterior?.versaoLocal ?? 0) !== rascunho.versaoLocal) {
        reject(new Error('O rascunho mudou em outra aba. Abra novamente a vistoria.'))
        transacao.abort()
      } else if (remover) tabela.delete(rascunho.chave)
      else tabela.put(salvo)
    }
    transacao.oncomplete = () => {
      resolve(salvo)
    }
    transacao.onabort = () => {
      reject(transacao.error ?? new Error('O navegador não conseguiu gravar o rascunho.'))
    }
  })
}
