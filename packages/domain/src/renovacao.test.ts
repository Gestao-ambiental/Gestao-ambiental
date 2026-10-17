import { describe, expect, it } from 'vitest'

import { adicionarDias, diferencaEmDias } from './data-civil'
import {
  ANTECEDENCIA_PREPARACAO_PADRAO_DIAS,
  DIAS_LIMITE_PROTOCOLO_LAO,
  antecedenciaPreparacao,
  datasRenovacaoLao,
  etapasRenovacaoLao,
} from './renovacao'

describe('portados de tests/domain.test.mjs do protótipo', () => {
  // protótipo: tests/domain.test.mjs:195
  it('datas e etapas da renovação usam dias extras antes do prazo fixo de protocolo', () => {
    const vencimento = '2027-01-12'
    expect(datasRenovacaoLao(vencimento, 30)).toEqual({
      antecedenciaDias: 30,
      inicioPreparacao: adicionarDias(vencimento, -150),
      limiteProtocolo: adicionarDias(vencimento, -120),
    })
    expect(datasRenovacaoLao(vencimento, 60)).toEqual({
      antecedenciaDias: 60,
      inicioPreparacao: adicionarDias(vencimento, -180),
      limiteProtocolo: adicionarDias(vencimento, -120),
    })
    expect(etapasRenovacaoLao(vencimento, 30).map((etapa) => etapa.prazo)).toEqual([
      adicionarDias(vencimento, -150),
      adicionarDias(vencimento, -140),
      adicionarDias(vencimento, -130),
      adicionarDias(vencimento, -120),
    ])
    expect(etapasRenovacaoLao(vencimento, 0)).toHaveLength(1)
    expect(etapasRenovacaoLao(vencimento, 1)).toHaveLength(2)
  })
})

describe('regras de renovação da LAO', () => {
  it('limite de protocolo = vencimento menos 120 dias corridos', () => {
    expect(DIAS_LIMITE_PROTOCOLO_LAO).toBe(120)
    // 12/01/2027 − 120 dias corridos = 14/09/2026 (atravessa a virada do ano)
    expect(datasRenovacaoLao('2027-01-12').limiteProtocolo).toBe('2026-09-14')
    // atravessa 29/02 de ano bissexto: 2028-06-28 − 120 = 2028-02-29
    expect(datasRenovacaoLao('2028-06-28').limiteProtocolo).toBe('2028-02-29')
  })

  it('início da preparação = limite menos a antecedência (padrão 30)', () => {
    expect(ANTECEDENCIA_PREPARACAO_PADRAO_DIAS).toBe(30)
    const datas = datasRenovacaoLao('2027-01-12')
    expect(datas.antecedenciaDias).toBe(30)
    expect(diferencaEmDias(datas.limiteProtocolo, datas.inicioPreparacao)).toBe(30)
    expect(datas.inicioPreparacao).toBe('2026-08-15')
  })

  it('trocar a antecedência de 30 para 60 não muda o limite de protocolo', () => {
    const com30 = datasRenovacaoLao('2027-01-12', 30)
    const com60 = datasRenovacaoLao('2027-01-12', 60)
    expect(com60.limiteProtocolo).toBe(com30.limiteProtocolo)
    expect(diferencaEmDias(com30.inicioPreparacao, com60.inicioPreparacao)).toBe(30)
  })

  it('a última etapa vence no limite de protocolo, qualquer que seja a antecedência', () => {
    for (const antecedencia of [0, 1, 15, 30, 60]) {
      const etapas = etapasRenovacaoLao('2027-01-12', antecedencia)
      expect(etapas.at(-1)).toEqual({
        titulo: 'Protocolar pedido de renovação',
        prazo: '2026-09-14',
        concluida: false,
      })
    }
  })

  it('a primeira etapa começa no início da preparação', () => {
    const { inicioPreparacao } = datasRenovacaoLao('2027-01-12', 60)
    expect(etapasRenovacaoLao('2027-01-12', 60)[0]?.prazo).toBe(inicioPreparacao)
  })

  it('antecedência até 29 dias tem 3 etapas; 30 ou mais tem 4', () => {
    expect(etapasRenovacaoLao('2027-01-12', 29).map((e) => e.titulo)).toEqual([
      'Abrir preparação da renovação',
      'Conferir documentação',
      'Protocolar pedido de renovação',
    ])
    expect(etapasRenovacaoLao('2027-01-12', 30)).toHaveLength(4)
  })

  it('antecedência vazia ou inválida cai no padrão de 30 dias', () => {
    expect(antecedenciaPreparacao(undefined)).toBe(30)
    expect(antecedenciaPreparacao(null)).toBe(30)
    expect(antecedenciaPreparacao('')).toBe(30)
    expect(antecedenciaPreparacao(-5)).toBe(30)
    expect(antecedenciaPreparacao(2.5)).toBe(30)
    expect(antecedenciaPreparacao('abc')).toBe(30)
    expect(antecedenciaPreparacao('45')).toBe(45)
    expect(antecedenciaPreparacao(0)).toBe(0)
  })
})
