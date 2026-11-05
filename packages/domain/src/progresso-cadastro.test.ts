import { describe, expect, it } from 'vitest'

import { passoDoRascunho, type EstadoDoRascunho } from './progresso-cadastro'

const completo: EstadoDoRascunho = {
  identificacaoCompleta: true,
  condicionantes: 3,
  condicionantesPendentes: 0,
  prazosPendentes: 0,
}

describe('passoDoRascunho', () => {
  it('identificação incompleta: passo 2, mesmo com condicionantes', () => {
    expect(passoDoRascunho({ ...completo, identificacaoCompleta: false })).toBe(1)
  })

  it('sem condicionantes ou com revisão pendente: passo 3', () => {
    expect(passoDoRascunho({ ...completo, condicionantes: 0 })).toBe(2)
    expect(passoDoRascunho({ ...completo, condicionantesPendentes: 1 })).toBe(2)
  })

  it('obrigação sem prazo confirmado: passo 4', () => {
    expect(passoDoRascunho({ ...completo, prazosPendentes: 2 })).toBe(3)
  })

  it('tudo pronto: falta só ativar, no passo 5', () => {
    expect(passoDoRascunho(completo)).toBe(4)
  })
})
