let registro: Promise<ServiceWorkerRegistration> | undefined

async function registrarAplicativo() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador não oferece suporte ao aplicativo offline.')
  }
  const instalacao = await navigator.serviceWorker.register('/campo-sw.js').catch(() => {
    throw new Error('Não foi possível preparar o aplicativo offline. Tente novamente com internet.')
  })
  if (instalacao.active) return instalacao

  const prazo = AbortSignal.timeout(15000)
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    prazo.addEventListener(
      'abort',
      () => {
        reject(
          new Error(
            'Não foi possível preparar o aplicativo offline. Tente novamente com internet.',
          ),
        )
      },
      { once: true },
    )
    void navigator.serviceWorker.ready.then(resolve, reject)
  })
}

export function prepararAplicativo(): Promise<ServiceWorkerRegistration> {
  registro ??= registrarAplicativo().catch((erro: unknown) => {
    registro = undefined
    throw erro
  })
  return registro
}
