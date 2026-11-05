import { describe, expect, it } from 'vitest'

import {
  dataPorExtenso,
  lerDataDigitada,
  mascararData,
  montarData,
  nomeDoMes,
  semanasDoMes,
} from './calendario'

describe('grade do calendário', () => {
  it('seis semanas de domingo a sábado, com os dias dos meses vizinhos', () => {
    const fevereiro = semanasDoMes(2027, 2)
    expect(fevereiro).toHaveLength(6)
    expect(fevereiro.every((s) => s.length === 7)).toBe(true)
    // 01/02/2027 é segunda: a grade começa no domingo 31/01
    expect(fevereiro[0]?.[0]).toBe('2027-01-31')
    expect(fevereiro[2]?.[1]).toBe('2027-02-15')
    expect(fevereiro[5]?.[6]).toBe('2027-03-13')
  })

  it('mês que começa no domingo começa na primeira célula', () => {
    expect(semanasDoMes(2026, 11)[0]?.[0]).toBe('2026-11-01')
    expect(semanasDoMes(2026, 10)[0]?.[0]).toBe('2026-09-27')
  })

  it('nomes e extenso em português', () => {
    expect(nomeDoMes(3)).toBe('março')
    expect(dataPorExtenso('2027-02-15')).toBe('15 de fevereiro de 2027')
    expect(montarData(2027, 2, 5)).toBe('2027-02-05')
  })
})

describe('data digitada', () => {
  it('a máscara põe as barras e corta no ano', () => {
    expect(mascararData('14')).toBe('14')
    expect(mascararData('1402')).toBe('14/02')
    expect(mascararData('140220')).toBe('14/02/20')
    expect(mascararData('14/02/20231')).toBe('14/02/2023')
    expect(mascararData('ab')).toBe('')
  })

  it('lê dd/mm/aaaa e aaaa-mm-dd colado', () => {
    expect(lerDataDigitada('15/02/2027')).toEqual({ situacao: 'valida', data: '2027-02-15' })
    expect(lerDataDigitada(' 2027-02-15 ')).toEqual({ situacao: 'valida', data: '2027-02-15' })
    expect(lerDataDigitada('29/02/2028')).toEqual({ situacao: 'valida', data: '2028-02-29' })
  })

  it('separa vazia, incompleta e inexistente', () => {
    expect(lerDataDigitada('')).toEqual({ situacao: 'vazia' })
    expect(lerDataDigitada('14/02')).toEqual({ situacao: 'incompleta' })
    expect(lerDataDigitada('14/02/23')).toEqual({ situacao: 'incompleta' })
    expect(lerDataDigitada('31/02/2027')).toEqual({ situacao: 'inexistente' })
    expect(lerDataDigitada('29/02/2027')).toEqual({ situacao: 'inexistente' })
    expect(lerDataDigitada('2027-13-01')).toEqual({ situacao: 'inexistente' })
  })
})
