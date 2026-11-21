import { describe, expect, it } from 'vitest'

import {
  HORIZONTES_DA_RENOVACAO,
  HORIZONTE_PADRAO_DA_RENOVACAO,
  dentroDoHorizonte,
  ehHorizonteDaRenovacao,
  fimDoHorizonte,
  objetoDaRenovacao,
  orgaoEhIma,
  taxaSugeridaDaRenovacao,
} from './renovacao-orcamento'
import { TABELA_02, TABELA_03 } from './taxa-do-ima'

describe('horizonte do radar de renovações', () => {
  it('3, 6 ou 12 meses, 6 por padrão', () => {
    expect(HORIZONTES_DA_RENOVACAO).toEqual([3, 6, 12])
    expect(HORIZONTE_PADRAO_DA_RENOVACAO).toBe(6)
    expect(ehHorizonteDaRenovacao(12)).toBe(true)
    expect(ehHorizonteDaRenovacao(9)).toBe(false)
    expect(ehHorizonteDaRenovacao('6')).toBe(false)
    expect(ehHorizonteDaRenovacao(null)).toBe(false)
  })

  it('soma meses do calendário: 31/08 + 6 vira o último dia de fevereiro', () => {
    expect(fimDoHorizonte('2026-08-31', 6)).toBe('2027-02-28')
    // Ano bissexto: fevereiro tem 29.
    expect(fimDoHorizonte('2027-08-31', 6)).toBe('2028-02-29')
    expect(fimDoHorizonte('2026-11-20', 3)).toBe('2027-02-20')
    expect(fimDoHorizonte('2026-11-20', 12)).toBe('2027-11-20')
  })

  it('a validade entra até o último dia do horizonte, e vencidas também entram', () => {
    const hoje = '2026-08-31'
    expect(dentroDoHorizonte('2027-02-28', hoje, 6)).toBe(true)
    expect(dentroDoHorizonte('2027-03-01', hoje, 6)).toBe(false)
    expect(dentroDoHorizonte('2026-01-10', hoje, 3)).toBe(true)
    expect(dentroDoHorizonte('2028-02-29', '2027-08-31', 6)).toBe(true)
    expect(dentroDoHorizonte('2028-03-01', '2027-08-31', 6)).toBe(false)
  })
})

describe('objeto do orçamento de renovação', () => {
  it('"Renovação da" + a licença; sem licença, "Renovação da LAO"', () => {
    expect(objetoDaRenovacao('LAO 4821/2023')).toBe('Renovação da LAO 4821/2023')
    expect(objetoDaRenovacao('  LAO   77/2020 ')).toBe('Renovação da LAO 77/2020')
    expect(objetoDaRenovacao(null)).toBe('Renovação da LAO')
    expect(objetoDaRenovacao('   ')).toBe('Renovação da LAO')
  })
})

describe('é o IMA?', () => {
  it('reconhece a sigla e o nome, sem acento, caixa ou pontuação', () => {
    for (const orgao of [
      'IMA',
      'ima',
      'IMA/SC',
      'IMA - SC',
      'ima.sc',
      'Instituto do Meio Ambiente de SC',
      'INSTITUTO DO MEIO AMBIENTE DE SANTA CATARINA',
    ]) {
      expect(orgaoEhIma(orgao), orgao).toBe(true)
    }
  })

  it('outros órgãos não são o IMA, nem a antiga FATMA', () => {
    for (const orgao of ['FATMA', 'SAMA', 'SAMA Joinville', 'IMASUL', 'Prefeitura', '', null]) {
      expect(orgaoEhIma(orgao), String(orgao)).toBe(false)
    }
    expect(orgaoEhIma(undefined)).toBe(false)
  })
})

describe('taxa sugerida da renovação (fase LAO)', () => {
  const LAO = 2

  it('Tabela 02: classe porte,potencial da atividade enquadrada pela medida', () => {
    // 12.80.10 (usinagem com pintura), potencial M; AU(3) = 0,2312 ha cai no porte médio: M,M.
    const centavos = taxaSugeridaDaRenovacao('IMA', [
      { codigo: '12.80.10', porte: 'medio', medidas: { 'AU(3)': 0.2312 } },
    ])
    expect(centavos).toBe(TABELA_02['M,M'][LAO])
    expect(centavos).toBe(562079)
  })

  it('sem medida gravada, usa o porte gravado', () => {
    expect(
      taxaSugeridaDaRenovacao('IMA', [{ codigo: '12.80.10', porte: 'medio', medidas: {} }]),
    ).toBe(562079)
  })

  it('Tabela 03: atividade agropecuária pela classe I-A a III-B', () => {
    // 01.70.10, potencial M; 20.000 cabeças é porte pequeno: P,M = classe I-B.
    expect(
      taxaSugeridaDaRenovacao('IMA', [
        { codigo: '01.70.10', porte: 'pequeno', medidas: { CmáxC: 20000 } },
      ]),
    ).toBe(TABELA_03['I-B'][LAO])
  })

  it('fórmula com a medida: fator 1,25 da LAO sobre o preço básico', () => {
    // Suinocultura, 1.000 cabeças: Pr = 24,93 + 0,11 × 1.000 = 134,93; LAO = 168,66.
    expect(
      taxaSugeridaDaRenovacao('IMA', [
        { codigo: '01.54.00', porte: 'pequeno', medidas: { CmáxC: 1000 } },
      ]),
    ).toBe(16866)
  })

  it('fórmula sem a medida não tem valor', () => {
    expect(
      taxaSugeridaDaRenovacao('IMA', [{ codigo: '01.54.00', porte: 'pequeno', medidas: {} }]),
    ).toBeNull()
  })

  it('AuA não conta como renovação de LAO', () => {
    expect(
      taxaSugeridaDaRenovacao('IMA', [{ codigo: '00.30.03', porte: 'minimo', medidas: {} }]),
    ).toBeNull()
  })

  it('código fora do catálogo é ignorado; sem atividade, nulo', () => {
    expect(
      taxaSugeridaDaRenovacao('IMA', [{ codigo: '99.99.99', porte: 'medio', medidas: {} }]),
    ).toBeNull()
    expect(taxaSugeridaDaRenovacao('IMA', [])).toBeNull()
  })

  it('com várias atividades vale o maior valor de LAO; as sem valor ficam de fora', () => {
    expect(
      taxaSugeridaDaRenovacao('IMA/SC', [
        { codigo: '01.54.00', porte: 'pequeno', medidas: { CmáxC: 1000 } },
        { codigo: '12.80.10', porte: 'medio', medidas: { 'AU(3)': 0.2312 } },
        { codigo: '00.30.03', porte: 'minimo', medidas: {} },
        { codigo: '01.70.10', porte: 'pequeno', medidas: { CmáxC: 20000 } },
      ]),
    ).toBe(562079)
  })

  it('para outro órgão (ou sem órgão), não sugere', () => {
    const atividades = [
      { codigo: '12.80.10', porte: 'medio' as const, medidas: { 'AU(3)': 0.2312 } },
    ]
    expect(taxaSugeridaDaRenovacao('SAMA', atividades)).toBeNull()
    expect(taxaSugeridaDaRenovacao('FATMA', atividades)).toBeNull()
    expect(taxaSugeridaDaRenovacao(null, atividades)).toBeNull()
  })
})
