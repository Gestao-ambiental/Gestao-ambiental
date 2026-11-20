import { describe, expect, it } from 'vitest'

import {
  arrumarNome,
  lerTitularDaLicenca,
  nomeDaUnidadeSugerido,
  titularEncontrado,
} from './titular-da-licenca'

const LAO_IMA = `GOVERNO DO ESTADO DE SANTA CATARINA
INSTITUTO DO MEIO AMBIENTE - IMA
LICENÇA AMBIENTAL DE OPERAÇÃO - LAO Nº 4521/2023
Razão Social: INDÚSTRIA HORIZONTE LTDA.   CNPJ: 11.222.333/0001-81
Endereço do Empreendimento: Rua Dona Francisca, 8300, Distrito Industrial, Joinville/SC
Atividade: 12.80.10 - Fabricação de peças metálicas
Validade: 04/04/2027`

describe('titular da licença lido do texto do PDF', () => {
  it('lê razão social, CNPJ, endereço e município da LAO do IMA', () => {
    expect(lerTitularDaLicenca(LAO_IMA)).toEqual({
      razaoSocial: 'Indústria Horizonte Ltda.',
      cnpj: '11222333000181',
      endereco: 'Rua Dona Francisca, 8300, Distrito Industrial, Joinville/SC',
      municipio: 'Joinville',
    })
  })

  it('aceita outros rótulos do titular e CNPJ na linha seguinte', () => {
    const texto =
      'AUTORIZAÇÃO AMBIENTAL\nRequerente: Metalúrgica Norte S.A.\nCNPJ 11.222.333/0001-81\nMunicípio: São Bento do Sul - SC'
    const titular = lerTitularDaLicenca(texto)
    expect(titular.razaoSocial).toBe('Metalúrgica Norte S.A.')
    expect(titular.cnpj).toBe('11222333000181')
    expect(titular.municipio).toBe('São Bento do Sul')
  })

  it('sem rótulo, pega o nome com forma societária logo antes do CNPJ', () => {
    const texto =
      'Fica licenciada a ECO TRANSPORTES LTDA, inscrita no CNPJ sob o nº 11.222.333/0001-81, para operar'
    expect(lerTitularDaLicenca(texto).razaoSocial).toBe('Eco Transportes Ltda')
  })

  it('ignora CNPJ com verificador errado e nunca captura CPF', () => {
    const texto = 'Interessado: Fulano de Tal\nCPF: 123.456.789-09\nCNPJ: 11.222.333/0001-80'
    const titular = lerTitularDaLicenca(texto)
    expect(titular.cnpj).toBeNull()
    expect(JSON.stringify(titular)).not.toContain('12345678909')
  })

  it('PDF sem texto útil não inventa titular', () => {
    const titular = lerTitularDaLicenca('   \n  \n')
    expect(titular).toEqual({ razaoSocial: null, cnpj: null, endereco: null, municipio: null })
    expect(titularEncontrado(titular)).toBe(false)
    expect(nomeDaUnidadeSugerido(titular)).toBe('Matriz')
  })

  it('sugere a unidade pelo município e arruma nomes em caixa alta', () => {
    expect(nomeDaUnidadeSugerido(lerTitularDaLicenca(LAO_IMA))).toBe('Unidade Joinville')
    expect(arrumarNome('POSTO DE COMBUSTÍVEIS DO VALE EIRELI')).toBe(
      'Posto de Combustíveis do Vale EIRELI',
    )
    expect(arrumarNome('Já Arrumado Ltda.')).toBe('Já Arrumado Ltda.')
  })
})
