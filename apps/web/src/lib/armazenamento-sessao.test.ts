import { beforeEach, describe, expect, it } from 'vitest'

import { armazenamentoSessao, definirLembrarSessao } from './armazenamento-sessao'

const chave = 'sb-sintetico-auth-token'
const bloqueio = 'gestao-ambiental.tela-bloqueada'
const sessaoLegada = JSON.stringify({ user: { id: 'conta-1' } })

describe('transição do bloqueio visual', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each([true, false])('exige login para a sessão bloqueada (lembrar=%s)', (lembrar) => {
    definirLembrarSessao(lembrar)
    const destino = lembrar ? localStorage : sessionStorage
    localStorage.setItem(bloqueio, 'conta-1')
    destino.setItem(chave, sessaoLegada)

    expect(armazenamentoSessao.getItem(chave)).toBeNull()
    expect(destino.getItem(chave)).toBeNull()

    armazenamentoSessao.setItem(chave, sessaoLegada)
    expect(armazenamentoSessao.getItem(chave)).toBe(sessaoLegada)
  })

  it('preserva a sessão de uma conta que não estava bloqueada', () => {
    localStorage.setItem(bloqueio, 'outra-conta')
    localStorage.setItem(chave, sessaoLegada)
    expect(armazenamentoSessao.getItem(chave)).toBe(sessaoLegada)
  })
})
