import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  aplicarTema,
  chaveTema,
  lerPreferenciaTema,
  resolverTema,
  salvarPreferenciaTema,
} from './tema'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('preferência de tema', () => {
  it('sem nada salvo, usa o claro (padrão do design system)', () => {
    expect(lerPreferenciaTema()).toBe('claro')
  })

  it('salva e lê a preferência', () => {
    salvarPreferenciaTema('escuro')
    expect(window.localStorage.getItem('grama.tema')).toBe('escuro')
    expect(lerPreferenciaTema()).toBe('escuro')
  })

  it('valor inválido salvo cai no padrão', () => {
    window.localStorage.setItem('grama.tema', 'roxo')
    expect(lerPreferenciaTema()).toBe('claro')
  })

  it('localStorage bloqueado não quebra a leitura nem a escrita', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError')
    })
    expect(lerPreferenciaTema()).toBe('claro')
    expect(() => {
      salvarPreferenciaTema('claro')
    }).not.toThrow()
  })

  it('com usuário, a chave é por usuário', () => {
    expect(chaveTema()).toBe('grama.tema')
    expect(chaveTema('a0000000-0000-4000-8000-000000000001')).toBe(
      'grama.tema:a0000000-0000-4000-8000-000000000001',
    )
  })

  it('"sistema" resolve pelo sistema; claro e escuro são fixos', () => {
    expect(resolverTema('sistema', true)).toBe('escuro')
    expect(resolverTema('sistema', false)).toBe('claro')
    expect(resolverTema('claro', true)).toBe('claro')
    expect(resolverTema('escuro', false)).toBe('escuro')
  })

  it('aplicar o tema marca data-theme no <html>, como os tokens esperam', () => {
    aplicarTema('escuro')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    aplicarTema('claro')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
