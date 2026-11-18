import { useSyncExternalStore } from 'react'

function observarRede(atualizar: () => void) {
  window.addEventListener('online', atualizar)
  window.addEventListener('offline', atualizar)
  return () => {
    window.removeEventListener('online', atualizar)
    window.removeEventListener('offline', atualizar)
  }
}

export function useConectado(): boolean {
  return useSyncExternalStore(observarRede, () => navigator.onLine)
}

let instalacao: Promise<ServiceWorkerRegistration> | undefined

export function prepararAplicativo(): Promise<ServiceWorkerRegistration> {
  instalacao ??= instalar().catch((erro: unknown) => {
    instalacao = undefined
    throw erro
  })
  return instalacao
}

async function instalar(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Navegador sem suporte ao modo offline.')
  const registro = await navigator.serviceWorker.register('/grama-sw.js')
  if (registro.active) return registro

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Não foi possível preparar o Grama offline.'))
    }, 15000)
    void navigator.serviceWorker.ready.then(
      (pronto) => {
        window.clearTimeout(timer)
        resolve(pronto)
      },
      (erro: unknown) => {
        window.clearTimeout(timer)
        reject(
          erro instanceof Error ? erro : new Error('Não foi possível preparar o Grama offline.'),
        )
      },
    )
  })
}
