import { describe, expect, it } from 'vitest'

import {
  coresDasAreas,
  coresSemRepetir,
  hashEstavel,
  iniciaisDe,
  QUANTIDADE_DE_CORES,
} from './cores-por-categoria'

const IDS = [
  'd0000000-0000-4000-8000-0000000000a1',
  'd0000000-0000-4000-8000-0000000000a2',
  'd0000000-0000-4000-8000-0000000000a3',
  'd0000000-0000-4000-8000-0000000000a4',
  'd0000000-0000-4000-8000-0000000000a5',
  'd0000000-0000-4000-8000-0000000000a6',
]

describe('cores por categoria', () => {
  it('o hash é estável e sem sinal', () => {
    expect(hashEstavel('abc')).toBe(hashEstavel('abc'))
    expect(hashEstavel('abc')).not.toBe(hashEstavel('abd'))
    expect(hashEstavel('qualquer coisa')).toBeGreaterThanOrEqual(0)
  })

  it('pessoa: cor estável, que não depende da ordem em que as pessoas chegam', () => {
    const uma = coresSemRepetir(IDS)
    const outra = coresSemRepetir([...IDS].reverse())
    expect([...uma.entries()].sort()).toEqual([...outra.entries()].sort())
  })

  it('pessoa: a equipe do piloto (6) nunca divide cor', () => {
    const cores = coresSemRepetir(IDS)
    expect(new Set(cores.values()).size).toBe(IDS.length)
    for (const cor of cores.values()) {
      expect(cor).toBeGreaterThanOrEqual(0)
      expect(cor).toBeLessThan(QUANTIDADE_DE_CORES)
    }
  })

  it('com mais de 9 categorias, as cores voltam a se repetir sem travar', () => {
    const muitas = Array.from({ length: 14 }, (_, i) => `pessoa-${String(i)}`)
    const cores = coresSemRepetir(muitas)
    expect(cores.size).toBe(14)
    expect(new Set(cores.values()).size).toBe(QUANTIDADE_DE_CORES)
  })

  it('área: na ordem do catálogo, sem repetir, e a mesma para a mesma equipe', () => {
    const catalogo = ['eng_ambiental', 'biologo', 'geologo', 'quimico']
    const cores = coresDasAreas(['geologo', 'eng_ambiental', 'biologo'], catalogo)
    expect(cores.get('eng_ambiental')).toBe(0)
    expect(cores.get('biologo')).toBe(1)
    expect(cores.get('geologo')).toBe(2)
    expect(coresDasAreas(['biologo', 'geologo', 'eng_ambiental'], catalogo)).toEqual(cores)
  })

  it('iniciais para marcar no evento, além da cor', () => {
    expect(iniciaisDe('Bruno Tavares')).toBe('BT')
    expect(iniciaisDe('Ana Paula da Silva')).toBe('AS')
    expect(iniciaisDe('Eduardo')).toBe('ED')
    expect(iniciaisDe('Engenharia ambiental e sanitária')).toBe('ES')
    expect(iniciaisDe('  ')).toBe('?')
  })
})
