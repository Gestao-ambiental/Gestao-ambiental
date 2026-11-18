import { useSyncExternalStore } from 'react'
import type { DataCivil } from '@gestao-ambiental/domain'

import type { Vinculo } from '@/lib/api/acesso'
import type { Ocorrencia } from '@/lib/api/ocorrencias'

import type { RegistroVistoria } from './registro'

const prefixoVinculo = 'grama:campo:vinculo:'
const UM_DIA = 24 * 60 * 60 * 1000

export function habilitarVinculoOffline(usuario: string, vinculo: Vinculo): void {
  localStorage.setItem(
    prefixoVinculo + usuario + ':' + vinculo.consultoriaId,
    JSON.stringify({ vinculo, venceEm: Date.now() + UM_DIA }),
  )
}

export function lerVinculoOffline(
  usuario: string,
  consultoria: string | null,
): Vinculo | undefined {
  if (!usuario || !consultoria) return
  try {
    const texto = localStorage.getItem(prefixoVinculo + usuario + ':' + consultoria)
    if (!texto) return
    const dados = JSON.parse(texto) as { vinculo: Vinculo; venceEm: number }
    if (
      dados.venceEm > Date.now() &&
      dados.vinculo.consultoriaId === consultoria &&
      dados.vinculo.situacao === 'ativo'
    )
      return dados.vinculo
  } catch {
    // Sem armazenamento local disponível, a vistoria exige conexão.
  }
  return undefined
}

function observarRede(atualizar: () => void) {
  window.addEventListener('online', atualizar)
  window.addEventListener('offline', atualizar)
  return () => {
    window.removeEventListener('online', atualizar)
    window.removeEventListener('offline', atualizar)
  }
}

export function useConectado() {
  return useSyncExternalStore(observarRede, () => navigator.onLine)
}

export type OcorrenciaEmCampo = Pick<
  Ocorrencia,
  | 'id'
  | 'consultoriaId'
  | 'codigo'
  | 'titulo'
  | 'textoLiteral'
  | 'empreendimentoNome'
  | 'unidadeNome'
  | 'prazoAtual'
  | 'licenca'
>

export interface Rascunho {
  dataExecucao: DataCivil | ''
  resultado: RegistroVistoria['resultado'] | ''
  area: string
  acompanhante: string
  observacao: string
  localizacao: RegistroVistoria['localizacao']
  foto: {
    arquivo: File
    obtidaEm: string
    origem: RegistroVistoria['origemFoto']
    versaoId: string
  } | null
}

export interface VistoriaNoDispositivo {
  chave: [string, string]
  ocorrencia: OcorrenciaEmCampo
  evidenciaId: string
  revisao: number
  rascunho: Rascunho
  envio: { registro: RegistroVistoria; dataExecucao: DataCivil; tentado: boolean } | null
}

let abertura: Promise<IDBDatabase> | undefined

function abrirBanco(): Promise<IDBDatabase> {
  abertura ??= new Promise<IDBDatabase>((resolve, reject) => {
    const pedido = indexedDB.open('grama-campo', 1)
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore('vistorias', { keyPath: 'chave' })
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
      reject(pedido.error ?? new Error('Não foi possível abrir o armazenamento do aparelho.'))
    }
  }).catch((erro: unknown) => {
    abertura = undefined
    throw erro
  })
  return abertura
}

export async function lerVistorias(vinculo: string): Promise<VistoriaNoDispositivo[]> {
  const banco = await abrirBanco()
  return new Promise((resolve, reject) => {
    const tabela = banco.transaction('vistorias').objectStore('vistorias')
    const pedido = tabela.getAll(IDBKeyRange.bound([vinculo, ''], [vinculo, '\uffff']))
    pedido.onsuccess = () => {
      resolve(pedido.result as VistoriaNoDispositivo[])
    }
    pedido.onerror = () => {
      reject(pedido.error ?? new Error('Não foi possível ler as vistorias do aparelho.'))
    }
  })
}

/** A revisão evita sobrescrever um rascunho aberto em outra aba. */
export async function salvarVistoria(
  vistoria: VistoriaNoDispositivo,
  apagar = false,
): Promise<VistoriaNoDispositivo> {
  const banco = await abrirBanco()
  const proxima = { ...vistoria, revisao: vistoria.revisao + 1 }
  return new Promise((resolve, reject) => {
    const transacao = banco.transaction('vistorias', 'readwrite')
    const tabela = transacao.objectStore('vistorias')
    const pedido = tabela.get(vistoria.chave)
    pedido.onsuccess = () => {
      const anterior = pedido.result as VistoriaNoDispositivo | undefined
      if ((anterior?.revisao ?? 0) !== vistoria.revisao) {
        reject(new Error('Esta vistoria mudou em outra aba. Reabra para ver a versão salva.'))
        transacao.abort()
      } else if (apagar) {
        tabela.delete(vistoria.chave)
      } else {
        tabela.put(proxima)
      }
    }
    transacao.oncomplete = () => {
      resolve(proxima)
    }
    transacao.onabort = () => {
      reject(transacao.error ?? new Error('Armazenamento indisponível.'))
    }
  })
}
