import { describe, expect, it } from 'vitest'

import {
  documentoDoTitularParaGravar,
  formatarDocumentoDoTitular,
  rotuloDoDocumentoDoTitular,
  situacaoDoDocumentoDoTitular,
} from './documento-do-titular'

describe('documento do titular (CNPJ ou CPF)', () => {
  it('aceita CPF válido, recusa CPF com dígito errado e mantém o CNPJ como antes', () => {
    expect(situacaoDoDocumentoDoTitular('')).toBe('vazio')
    expect(situacaoDoDocumentoDoTitular('529.982.247-25')).toBe('completo')
    expect(situacaoDoDocumentoDoTitular('529.982.247-26')).toBe('cpf_invalido')
    expect(situacaoDoDocumentoDoTitular('11.222.333/0001-81')).toBe('completo')
    expect(situacaoDoDocumentoDoTitular('11.222.333/0001')).toBe('incompleto')
  })

  it('grava só letras e dígitos e exibe o CPF mascarado', () => {
    expect(documentoDoTitularParaGravar('529.982.247-25')).toBe('52998224725')
    expect(documentoDoTitularParaGravar('529.982.247')).toBeNull()
    expect(formatarDocumentoDoTitular('52998224725')).toBe('***.982.247-**')
    expect(formatarDocumentoDoTitular('11222333000181')).toBe('11.222.333/0001-81')
    expect(rotuloDoDocumentoDoTitular('52998224725')).toBe('CPF')
    expect(rotuloDoDocumentoDoTitular('11222333000181')).toBe('CNPJ')
  })
})
