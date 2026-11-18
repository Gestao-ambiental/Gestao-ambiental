import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { Provedores } from './app/Provedores'
import { rotas } from './app/rotas'
import { prepararAplicativo } from './lib/vistoria-offline/app'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado em index.html')

const router = createBrowserRouter(rotas)

if (import.meta.env.PROD && navigator.onLine) {
  void prepararAplicativo().catch(() => undefined)
}

createRoot(raiz).render(
  <StrictMode>
    <Provedores>
      <RouterProvider router={router} />
    </Provedores>
  </StrictMode>,
)
