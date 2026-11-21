import { describe, expect, it } from 'vitest'

import {
  ANTECEDENCIA_PADRAO_DIAS,
  antecedenciaValida,
  diasParaVencer,
  idsRenovados,
  rotuloDaSituacaoDoVencimento,
  situacaoDoVencimento,
} from './vencimento'

describe('situação do vencimento', () => {
  const hoje = '2026-11-20'
  const de = (validoAte: string, antecedenciaDias = 60, renovado = false) =>
    situacaoDoVencimento(
      { validoAte: validoAte as `${number}-${number}-${number}`, antecedenciaDias, renovado },
      hoje,
    )

  it('vigente fora da antecedência', () => {
    expect(de('2027-03-01')).toBe('vigente')
  })

  it('a vencer exatamente na antecedência e no próprio dia da validade', () => {
    // 20/11 + 60 dias = 19/01/2027
    expect(de('2027-01-19')).toBe('a_vencer')
    expect(de('2027-01-20')).toBe('vigente')
    expect(de(hoje)).toBe('a_vencer')
  })

  it('vencido no dia seguinte à validade', () => {
    expect(de('2026-11-19')).toBe('vencido')
  })

  it('antecedência 0: vigente até a véspera, a vencer só no dia', () => {
    expect(de('2026-11-21', 0)).toBe('vigente')
    expect(de(hoje, 0)).toBe('a_vencer')
    expect(de('2026-11-19', 0)).toBe('vencido')
  })

  it('renovado vale mais que vencido e que a vencer: o novo é que conta', () => {
    expect(de('2025-01-01', 60, true)).toBe('renovado')
    expect(de(hoje, 60, true)).toBe('renovado')
  })

  it('rótulos por extenso', () => {
    expect(rotuloDaSituacaoDoVencimento('vigente')).toBe('Vigente')
    expect(rotuloDaSituacaoDoVencimento('a_vencer')).toBe('A vencer')
    expect(rotuloDaSituacaoDoVencimento('vencido')).toBe('Vencido')
    expect(rotuloDaSituacaoDoVencimento('renovado')).toBe('Renovado')
  })

  it('dias para vencer: zero no dia, negativo depois', () => {
    expect(diasParaVencer('2026-11-30', hoje)).toBe(10)
    expect(diasParaVencer(hoje, hoje)).toBe(0)
    expect(diasParaVencer('2026-11-18', hoje)).toBe(-2)
  })
})

describe('antecedência', () => {
  it('padrão de 60 dias', () => {
    expect(ANTECEDENCIA_PADRAO_DIAS).toBe(60)
  })

  it('inteiro de 0 a 730', () => {
    expect(antecedenciaValida(0)).toBe(true)
    expect(antecedenciaValida(730)).toBe(true)
    expect(antecedenciaValida(731)).toBe(false)
    expect(antecedenciaValida(-1)).toBe(false)
    expect(antecedenciaValida(1.5)).toBe(false)
    expect(antecedenciaValida(Number.NaN)).toBe(false)
  })
})

describe('renovados', () => {
  it('são os que algum outro aponta como anterior', () => {
    const renovados = idsRenovados([
      { id: 'a', anteriorId: null },
      { id: 'b', anteriorId: 'a' },
      { id: 'c', anteriorId: 'b' },
    ])
    expect([...renovados].sort()).toEqual(['a', 'b'])
  })
})
