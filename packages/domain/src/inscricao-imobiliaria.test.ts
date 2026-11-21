import { describe, expect, it } from 'vitest'

import { lerInscricaoImobiliaria } from './inscricao-imobiliaria'

describe('inscrição imobiliária de Joinville', () => {
  it.each([
    ['13-20-23-7-239', '13-20-23-7-239'],
    ['13.20.23.7.239', '13-20-23-7-239'],
    ['13 20 23 7 239', '13-20-23-7-239'],
    ['13.20.23.07.0239', '13-20-23-7-239'],
    ['13.20.23.07.0239.000', '13-20-23-7-239'],
    ['  13-11-0-1-837 ', '13-11-0-1-837'],
    ['09/23/24/36/5284', '9-23-24-36-5284'],
  ])('%s vira %s', (texto, esperado) => {
    expect(lerInscricaoImobiliaria(texto)).toBe(esperado)
  })

  it.each([
    'Rua Dona Francisca 1000',
    'Rua 13 de Maio',
    '13-20-23-7',
    '13-20-23-7-239-001',
    '89201-000',
    '-26.3044, -48.8487',
    '',
  ])('"%s" não é inscrição', (texto) => {
    expect(lerInscricaoImobiliaria(texto)).toBeNull()
  })
})
