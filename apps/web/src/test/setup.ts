import '@testing-library/jest-dom/vitest'
// IndexedDB em memória para o rascunho do Campo (ADR-0060).
import 'fake-indexeddb/auto'
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
