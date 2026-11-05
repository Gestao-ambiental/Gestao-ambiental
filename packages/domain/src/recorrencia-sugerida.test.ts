import { describe, expect, it } from 'vitest'

import { recorrenciaSugerida } from './recorrencia-sugerida'

describe('recorrência sugerida pela periodicidade lida (só sugestão)', () => {
  it('presets pelo nome, com e sem acento e advérbio', () => {
    expect(recorrenciaSugerida('ANUAL')).toEqual({ recorrencia: 'anual' })
    expect(recorrenciaSugerida('anualmente')).toEqual({ recorrencia: 'anual' })
    expect(recorrenciaSugerida('Semestral')).toEqual({ recorrencia: 'semestral' })
    expect(recorrenciaSugerida('trimestralmente')).toEqual({ recorrencia: 'trimestral' })
    expect(recorrenciaSugerida('bimestral')).toEqual({ recorrencia: 'bimestral' })
    expect(recorrenciaSugerida('mensalmente')).toEqual({ recorrencia: 'mensal' })
    expect(recorrenciaSugerida('Na renovação da licença')).toEqual({ recorrencia: 'na_renovacao' })
  })

  it('"a cada N": meses viram preset quando dá; dias e anos viram personalizada', () => {
    expect(recorrenciaSugerida('a cada 6 meses')).toEqual({ recorrencia: 'semestral' })
    expect(recorrenciaSugerida('a cada 12 meses')).toEqual({ recorrencia: 'anual' })
    expect(recorrenciaSugerida('a cada 4 meses')).toEqual({
      recorrencia: 'personalizada',
      unidade: 'mes',
      intervalo: 4,
    })
    expect(recorrenciaSugerida('a cada 90 dias')).toEqual({
      recorrencia: 'personalizada',
      unidade: 'dia',
      intervalo: 90,
    })
    expect(recorrenciaSugerida('a cada 2 anos')).toEqual({
      recorrencia: 'personalizada',
      unidade: 'mes',
      intervalo: 24,
    })
  })

  it('mesma frequência dita de dois jeitos continua clara', () => {
    expect(recorrenciaSugerida('anual (a cada 12 meses)')).toEqual({ recorrencia: 'anual' })
  })

  it('leitura ambígua ou sem frequência: nada sugerido', () => {
    expect(recorrenciaSugerida('anual e na renovação da licença')).toBeNull()
    expect(recorrenciaSugerida('semestral ou anual')).toBeNull()
    expect(recorrenciaSugerida('quando solicitado pelo órgão')).toBeNull()
    expect(recorrenciaSugerida('')).toBeNull()
    expect(recorrenciaSugerida(null)).toBeNull()
  })
})
