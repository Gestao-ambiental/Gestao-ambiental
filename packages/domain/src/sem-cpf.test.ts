import { describe, expect, it } from 'vitest'

import { MARCADOR_DE_CPF, contemCpf, removerCpf } from './sem-cpf'

describe('removerCpf', () => {
  it('troca o CPF mascarado de uma portaria', () => {
    expect(removerCpf('Fulano de Tal – CPF: 004.XXX.XXX-61')).toBe(
      `Fulano de Tal – CPF: ${MARCADOR_DE_CPF}`,
    )
    expect(removerCpf('Beltrana, CPF ***.123.456-**, interessada')).toBe(
      `Beltrana, CPF ${MARCADOR_DE_CPF}, interessada`,
    )
  })

  it('troca o CPF formatado, onde quer que esteja', () => {
    expect(removerCpf('inscrito sob o nº 123.456.789-09.')).toBe(
      `inscrito sob o nº ${MARCADOR_DE_CPF}.`,
    )
    expect(removerCpf('123.456.789-09 e 987.654.321-00')).toBe(
      `${MARCADOR_DE_CPF} e ${MARCADOR_DE_CPF}`,
    )
  })

  it('troca 11 dígitos só quando "CPF" vem antes', () => {
    expect(removerCpf('CPF: 12345678909')).toBe(`CPF: ${MARCADOR_DE_CPF}`)
    expect(removerCpf('CPF/MF nº 12345678909')).toBe(`CPF/MF nº ${MARCADOR_DE_CPF}`)
    // Telefone com 11 dígitos, sem a palavra CPF, fica.
    expect(removerCpf('Fone 47999998888')).toBe('Fone 47999998888')
  })

  it('não mexe em CNPJ, processo nem data', () => {
    const texto =
      'CNPJ 12.345.678/0001-90 (12345678000190), processo SEI 12345.000123/2024-11, ' +
      'autos 0001234-56.2024.8.24.0038, LAO 1234/2024, em 19.12.1997 e 19/12/1997.'
    expect(removerCpf(texto)).toBe(texto)
  })
})

describe('contemCpf', () => {
  it('diz se há CPF inteiro ou mascarado', () => {
    expect(contemCpf('Fulano de Tal – CPF: 004.XXX.XXX-61')).toBe(true)
    expect(contemCpf('CPF 12345678909')).toBe(true)
    expect(contemCpf('CNPJ 12.345.678/0001-90')).toBe(false)
    expect(contemCpf('')).toBe(false)
  })
})
