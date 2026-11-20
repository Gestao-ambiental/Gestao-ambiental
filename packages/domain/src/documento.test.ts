import { describe, expect, it } from 'vitest'

import { cpfValido, mascararDocumento, tipoDoDocumento } from './documento'

describe('documento de quem paga (CPF ou CNPJ)', () => {
  it('CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('5299822472')).toBe(false)
  })

  it('CNPJ numérico e alfanumérico pelos dígitos verificadores', () => {
    expect(tipoDoDocumento('11.222.333/0001-81')).toBe('cnpj')
    expect(tipoDoDocumento('11.222.333/0001-80')).toBeNull()
    expect(tipoDoDocumento('00.000.000/0000-00')).toBeNull()
    // Exemplo da Receita para o CNPJ alfanumérico.
    expect(tipoDoDocumento('12.ABC.345/01DE-35')).toBe('cnpj')
    expect(tipoDoDocumento('12.ABC.345/01DE-36')).toBeNull()
  })

  it('tipo do documento: CPF, CNPJ ou nada', () => {
    expect(tipoDoDocumento('529.982.247-25')).toBe('cpf')
    expect(tipoDoDocumento('11222333000181')).toBe('cnpj')
    expect(tipoDoDocumento('12345')).toBeNull()
    expect(tipoDoDocumento('')).toBeNull()
  })

  it('máscara enquanto digita', () => {
    expect(mascararDocumento('529')).toBe('529')
    expect(mascararDocumento('5299822')).toBe('529.982.2')
    expect(mascararDocumento('52998224725')).toBe('529.982.247-25')
    expect(mascararDocumento('112223330001')).toBe('11.222.333/0001')
    expect(mascararDocumento('11222333000181')).toBe('11.222.333/0001-81')
    expect(mascararDocumento('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })
})
