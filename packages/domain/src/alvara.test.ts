import { describe, expect, it } from 'vitest'

import { idsRenovados, rotuloDaSituacaoDoAlvara, situacaoDoAlvara } from './alvara'

describe('situação do alvará', () => {
  const hoje = '2026-11-17'

  it('vigente até o dia da validade; vencido no dia seguinte', () => {
    expect(situacaoDoAlvara({ validade: hoje, renovado: false }, hoje)).toBe('vigente')
    expect(situacaoDoAlvara({ validade: '2026-11-16', renovado: false }, hoje)).toBe('vencido')
  })

  it('renovado vale mais que vencido: o novo é que conta', () => {
    expect(situacaoDoAlvara({ validade: '2025-01-01', renovado: true }, hoje)).toBe('renovado')
    expect(rotuloDaSituacaoDoAlvara('renovado')).toBe('Renovado')
  })

  it('renovados são os que algum outro aponta como anterior', () => {
    const renovados = idsRenovados([
      { id: 'a', anteriorId: null },
      { id: 'b', anteriorId: 'a' },
      { id: 'c', anteriorId: 'b' },
    ])
    expect([...renovados].sort()).toEqual(['a', 'b'])
  })
})
