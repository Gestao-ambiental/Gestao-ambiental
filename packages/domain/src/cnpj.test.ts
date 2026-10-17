import { describe, expect, it } from 'vitest'

import { formatarCnpj, mascararCnpj, normalizarCnpj, situacaoDoCnpj } from './cnpj'

describe('CNPJ', () => {
  it('normaliza tirando pontuação e limitando a 14 caracteres', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190')
    expect(normalizarCnpj(' ab.cd1.234/5ef6-78 ')).toBe('ABCD12345EF678')
    expect(normalizarCnpj('123456780001901234')).toBe('12345678000190')
  })

  it('mascara aos poucos, enquanto a pessoa digita', () => {
    expect(mascararCnpj('12')).toBe('12')
    expect(mascararCnpj('123')).toBe('12.3')
    expect(mascararCnpj('12345678')).toBe('12.345.678')
    expect(mascararCnpj('123456780001')).toBe('12.345.678/0001')
    expect(mascararCnpj('12345678000190')).toBe('12.345.678/0001-90')
  })

  it('aceita o CNPJ alfanumérico, mas os verificadores só com dígitos', () => {
    expect(mascararCnpj('ABCD12345EF678')).toBe('AB.CD1.234/5EF6-78')
    expect(mascararCnpj('ABCD12345EF6XY')).toBe('AB.CD1.234/5EF6')
  })

  it('situação: vazio é permitido, faltar caractere é incompleto', () => {
    expect(situacaoDoCnpj('')).toBe('vazio')
    expect(situacaoDoCnpj(' ./- ')).toBe('vazio')
    expect(situacaoDoCnpj('12.345.678/0001')).toBe('incompleto')
    expect(situacaoDoCnpj('12.345.678/0001-90')).toBe('completo')
    expect(situacaoDoCnpj('AB.CD1.234/5EF6-78')).toBe('completo')
  })

  it('formata o valor gravado e deixa vazio quando não há', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90')
    expect(formatarCnpj(null)).toBe('')
  })
})
