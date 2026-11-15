import { describe, expect, it } from 'vitest'

import { cargaDoMes, ehMesDeExecucao, mesesDeExecucao, rotuloDoMes } from './carga-da-equipe'
import { dataCivil } from './data-civil'

describe('meses de execução', () => {
  it('começa no mês de hoje e vira o ano', () => {
    const meses = mesesDeExecucao(dataCivil('2026-11-12'), 3)
    expect(meses).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })

  it('rótulo curto e só aceita o primeiro dia do mês', () => {
    expect(rotuloDoMes('2026-12-01')).toBe('dez/2026')
    expect(rotuloDoMes('2027-01-01')).toBe('jan/2027')
    expect(ehMesDeExecucao('2026-12-01')).toBe(true)
    expect(ehMesDeExecucao('2026-12-15')).toBe(false)
    expect(ehMesDeExecucao('dez/2026')).toBe(false)
  })
})

describe('carga do mês', () => {
  const jornadas = [
    { membroId: 'helena', horasMes: 87 },
    { membroId: 'eduardo', horasMes: 173 },
  ]
  const comprometido = [
    { membroId: 'helena', mes: '2026-12-01', minutos: 40 * 60 },
    { membroId: 'helena', mes: '2027-01-01', minutos: 80 * 60 },
    { membroId: 'eduardo', mes: '2026-12-01', minutos: 10 * 60 },
  ]

  it('soma aprovados e este orçamento, só da pessoa e do mês', () => {
    const c = cargaDoMes('helena', '2026-12-01', jornadas, comprometido, [
      { responsavelId: 'helena', mesPrevisto: '2026-12-01', minutos: 30 * 60 },
      { responsavelId: 'helena', mesPrevisto: '2026-12-01', minutos: 10 * 60 },
      { responsavelId: 'helena', mesPrevisto: '2027-01-01', minutos: 60 },
      { responsavelId: 'eduardo', mesPrevisto: '2026-12-01', minutos: 60 },
      { responsavelId: null, mesPrevisto: '2026-12-01', minutos: 60 },
    ])
    expect(c).toEqual({
      jornadaMinutos: 87 * 60,
      comprometidoMinutos: 40 * 60,
      desteOrcamentoMinutos: 40 * 60,
      totalMinutos: 80 * 60,
      acimaDaJornada: false,
    })
  })

  it('avisa quando passa da jornada', () => {
    const c = cargaDoMes('helena', '2027-01-01', jornadas, comprometido, [
      { responsavelId: 'helena', mesPrevisto: '2027-01-01', minutos: 8 * 60 },
    ])
    // 80 h aprovadas + 8 h = 88 h > 87 h
    expect(c.acimaDaJornada).toBe(true)
  })

  it('pessoa fora da equipe de Custos e taxas não tem jornada', () => {
    const c = cargaDoMes('camila', '2026-12-01', jornadas, comprometido, [
      { responsavelId: 'camila', mesPrevisto: '2026-12-01', minutos: 1_000 * 60 },
    ])
    expect(c.jornadaMinutos).toBeNull()
    expect(c.acimaDaJornada).toBe(false)
  })
})
