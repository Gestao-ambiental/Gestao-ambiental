import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Rotas com `lazy` (rotas.tsx) compilam o módulo da página no primeiro acesso de cada arquivo de
// teste; com a máquina ocupada isso passa de 1 s, o padrão dos findBy/waitFor.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
