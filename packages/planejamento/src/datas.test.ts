import { describe, expect, it } from 'vitest'
import { mesDoDia, paraData, paraDia, primeiroDiaDoMes, rotuloDoMes } from './datas'

describe('datas civis', () => {
  it('converte data em dia e de volta', () => {
    expect(paraDia('1970-01-01')).toBe(0)
    expect(paraDia('2027-03-31')).toBe(20908)
    for (const data of ['2024-02-29', '2026-12-31', '2027-01-01', '2100-02-28']) {
      expect(paraData(paraDia(data) ?? Number.NaN)).toBe(data)
    }
  })

  it('recusa data inexistente e formato errado', () => {
    for (const valor of ['2027-02-29', '2027-13-01', '2027-1-5', '31/03/2027', '', null, 20908]) {
      expect(paraDia(valor)).toBeNull()
    }
  })

  it('soma dias atravessando fevereiro e a virada do ano', () => {
    const dia = (data: string) => paraDia(data) ?? Number.NaN
    expect(paraData(dia('2027-03-01') - 14)).toBe('2027-02-15')
    expect(paraData(dia('2028-03-01') - 1)).toBe('2028-02-29')
    expect(paraData(dia('2026-12-31') + 1)).toBe('2027-01-01')
  })

  it('agrupa dias por mês', () => {
    const marco = mesDoDia(paraDia('2027-03-31') ?? Number.NaN)
    expect(rotuloDoMes(marco)).toBe('2027-03')
    expect(paraData(primeiroDiaDoMes(marco + 1))).toBe('2027-04-01')
    expect(rotuloDoMes(marco + 10)).toBe('2028-01')
  })
})
