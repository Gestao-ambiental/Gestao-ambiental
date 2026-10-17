import { describe, expect, it } from 'vitest'

import { adicionarMeses, type DataCivil } from './data-civil'
import { ocorrencias, primeiraOcorrenciaSugerida, sugerirDatasDeDependencia } from './recorrencia'

describe('portados de tests/domain.test.mjs do protótipo', () => {
  // protótipo: tests/domain.test.mjs:140
  it('licença de dez anos gera toda a série, sem limitar a cinco anos', () => {
    const datas = ocorrencias('2027-09-03', '2036-09-03', 12)
    expect(datas).toHaveLength(10)
    expect(datas.at(-1)).toBe('2036-09-03')
    expect(datas.every((d) => d <= '2036-09-03')).toBe(true)
  })

  // protótipo: tests/domain.test.mjs:146
  it('fim de mês não deriva a data base nas próximas ocorrências', () => {
    expect(ocorrencias('2028-01-31', '2028-04-30', 1)).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ])
    expect(adicionarMeses('2028-02-29', 12)).toBe('2029-02-28')
  })

  // protótipo: tests/domain.test.mjs:169
  it('recorrência rejeita período inválido e data base depois da validade', () => {
    expect(() => ocorrencias('2027-01-01', '2026-01-01', 12)).toThrow()
    expect(() => ocorrencias('2027-01-01', '2030-01-01', 0)).toThrow()
  })

  // protótipo: tests/domain.test.mjs:335 ("once" → 'unica'; o original devolvia "" em vez de null)
  it('condicionante anual sugere o primeiro aniversário da assinatura', () => {
    expect(primeiraOcorrenciaSugerida('anual', '2026-05-22', '2030-05-22')).toBe('2027-05-22')
    expect(primeiraOcorrenciaSugerida('trimestral', '2026-05-22', '2030-05-22')).toBe('2026-08-22')
    expect(primeiraOcorrenciaSugerida('semestral', '2026-05-22', '2030-05-22')).toBe('2026-11-22')
    expect(primeiraOcorrenciaSugerida('unica', '2026-05-22')).toBeNull()
  })

  // protótipo: tests/domain.test.mjs:598 (analysis → dependente, cleaning → origem)
  it('dependência de 90 dias oferece datas concretas nos dois sentidos', () => {
    expect(sugerirDatasDeDependencia('2027-05-22', '2027-05-22', 90)).toEqual({
      dependente: '2027-08-20',
      origem: '2027-02-21',
    })
  })
})

describe('ocorrencias: fim de mês e ano bissexto', () => {
  it('31/01 mensal em ano não bissexto vai a 28/02 e volta a 31/03', () => {
    expect(ocorrencias('2027-01-31', '2027-04-30', 1)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ])
  })

  it('29/02 anual só repete 29/02 em ano bissexto', () => {
    expect(ocorrencias('2028-02-29', '2032-03-01', 12)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('inclui a validade quando a última entrega cai exatamente nela', () => {
    expect(ocorrencias('2026-01-15', '2026-03-15', 1)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ])
  })

  it('base igual à validade gera uma única entrega', () => {
    expect(ocorrencias('2026-06-30', '2026-06-30', 12)).toEqual(['2026-06-30'])
  })

  it('rejeita data base ou validade vazia ou inexistente vinda de fora (banco, formulário)', () => {
    expect(() => ocorrencias('' as DataCivil, '2027-01-01', 1)).toThrow(/data base/)
    expect(() => ocorrencias('2026-01-01', '2027-02-30', 1)).toThrow(/data base/)
  })

  it('rejeita periodicidade fracionária ou negativa', () => {
    expect(() => ocorrencias('2026-01-01', '2027-01-01', 1.5)).toThrow(/periodicidade/)
    expect(() => ocorrencias('2026-01-01', '2027-01-01', -1)).toThrow(/periodicidade/)
  })

  it('aceita até 1.200 entregas e recusa a série maior', () => {
    expect(ocorrencias('1926-01-01', '2025-12-01', 1)).toHaveLength(1200)
    expect(() => ocorrencias('1926-01-01', '2026-01-01', 1)).toThrow(/1\.200/)
  })
})

describe('primeiraOcorrenciaSugerida', () => {
  it('não sugere data depois da validade', () => {
    expect(primeiraOcorrenciaSugerida('anual', '2026-05-22', '2027-05-21')).toBeNull()
  })

  it('sem assinatura não sugere', () => {
    expect(primeiraOcorrenciaSugerida('mensal', null)).toBeNull()
  })

  it('mensal a partir de 31/01 respeita o fim de fevereiro', () => {
    expect(primeiraOcorrenciaSugerida('mensal', '2027-01-31')).toBe('2027-02-28')
    expect(primeiraOcorrenciaSugerida('mensal', '2028-01-31')).toBe('2028-02-29')
  })

  it('contínua não tem primeira entrega por ciclo', () => {
    expect(primeiraOcorrenciaSugerida('continua', '2026-05-22')).toBeNull()
  })
})

describe('sugerirDatasDeDependencia', () => {
  it('rejeita intervalo inválido', () => {
    expect(() => sugerirDatasDeDependencia('2027-05-22', '2027-05-22', 0)).toThrow(/intervalo/)
  })
})
