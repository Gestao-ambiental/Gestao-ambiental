import { describe, expect, it } from 'vitest'

import { classificarAto } from './classificar-ato'

describe('classificarAto', () => {
  it('ementa que revoga (Portaria IMA 096/2026)', () => {
    expect(classificarAto('Revoga a Instrução Normativa nº 84')).toEqual({
      acao: 'revoga',
      alvos: [{ tipo: 'instrucao_normativa', numero: '84' }],
    })
  })

  it('o próprio ato, citado antes do verbo, não é alvo', () => {
    expect(classificarAto('Portaria IMA 096/2026 – Revoga a Instrução Normativa nº 84')).toEqual({
      acao: 'revoga',
      alvos: [{ tipo: 'instrucao_normativa', numero: '84' }],
    })
  })

  it('ementa que altera (Res. CONSEMA 314/2026)', () => {
    expect(classificarAto('Altera o Anexo VI da Resolução CONSEMA nº 250, de 2024')).toEqual({
      acao: 'altera',
      alvos: [{ tipo: 'resolucao', numero: '250', ano: 2024, orgao: 'CONSEMA' }],
    })
  })

  it('ementa que altera lei federal', () => {
    expect(classificarAto('Altera a Lei nº 6.938, de 31 de agosto de 1981')).toEqual({
      acao: 'altera',
      alvos: [{ tipo: 'lei', numero: '6938', ano: 1981 }],
    })
  })

  it('outros verbos de alteração', () => {
    expect(classificarAto('Dá nova redação ao art. 2º da Lei 14.675/2009').acao).toBe('altera')
    expect(classificarAto('Acrescenta o art. 6º-A à IN 02').acao).toBe('altera')
    expect(classificarAto('Inclui atividades na Resolução CONSEMA nº 250/2024').acao).toBe('altera')
  })

  it('altera e revoga ao mesmo tempo vale como altera, com todos os alvos', () => {
    expect(
      classificarAto('Altera a Resolução CONSEMA nº 250/2024 e revoga a Resolução CONSEMA nº 98'),
    ).toEqual({
      acao: 'altera',
      alvos: [
        { tipo: 'resolucao', numero: '250', ano: 2024, orgao: 'CONSEMA' },
        { tipo: 'resolucao', numero: '98', orgao: 'CONSEMA' },
      ],
    })
  })

  it('regulamenta', () => {
    expect(classificarAto('Regulamenta a Lei Complementar 140/2011')).toEqual({
      acao: 'regulamenta',
      alvos: [{ tipo: 'lei_complementar', numero: '140', ano: 2011 }],
    })
  })

  it('sem verbo é norma nova, sem alvos', () => {
    expect(
      classificarAto(
        'Dispõe sobre o licenciamento de postos de combustíveis, nos termos da Lei 14.675/2009',
      ),
    ).toEqual({ acao: 'nova', alvos: [] })
  })

  it('"revogam-se as disposições em contrário" não torna o ato uma revogação', () => {
    expect(classificarAto('Estabelece critérios. Revogam-se as disposições em contrário.')).toEqual(
      { acao: 'nova', alvos: [] },
    )
  })

  it('palavras derivadas não contam como verbo', () => {
    expect(classificarAto('Consolida as alterações e a regulamentação vigente').acao).toBe('nova')
  })
})
