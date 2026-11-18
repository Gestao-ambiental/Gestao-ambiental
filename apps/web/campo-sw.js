/* global self, caches */
const CACHE = 'grama-campo-__VERSAO__'
const ARQUIVOS = ['__ARQUIVOS__']

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)))
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then(async (nomes) => {
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith('grama-campo-') && nome !== CACHE)
          .map((nome) => caches.delete(nome)),
      )
      await self.clients.claim()
    }),
  )
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/vistorias' && request.mode === 'navigate') {
    evento.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE)
        return (await cache.match('/index.html')) ?? Response.error()
      }),
    )
  } else if (ARQUIVOS.includes(url.pathname)) {
    evento.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)),
    )
  }
})
