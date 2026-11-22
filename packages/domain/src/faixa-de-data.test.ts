import { describe, expect, it } from 'vitest'

import { DATA_CIVIL_MAXIMA, DATA_CIVIL_MINIMA, dataCivilNaFaixa } from './data-civil'
import { LIMITE_DE_ETAPAS } from './limites'

describe('dataCivilNaFaixa', () => {
  it('aceita datas existentes de 1900-01-01 a 2199-12-31, inclusive as pontas', () => {
    expect(dataCivilNaFaixa(DATA_CIVIL_MINIMA)).toBe(true)
    expect(dataCivilNaFaixa('2026-11-22')).toBe(true)
    expect(dataCivilNaFaixa(DATA_CIVIL_MAXIMA)).toBe(true)
  })

  it('recusa infinito, fora da faixa, inexistente e o que não é texto', () => {
    for (const valor of [
      'infinity',
      '-infinity',
      '1899-12-31',
      '2200-01-01',
      '9999-12-31',
      '0001-01-01',
      '2026-02-30',
      '',
      null,
      undefined,
      20261122,
    ]) {
      expect(dataCivilNaFaixa(valor)).toBe(false)
    }
  })
})

describe('LIMITE_DE_ETAPAS', () => {
  it('é o mesmo número que o banco aplica (200)', () => {
    expect(LIMITE_DE_ETAPAS).toBe(200)
  })
})
