import { describe, expect, it } from 'vitest'

import {
  ROTULO_DO_TIPO_DE_LINHA,
  TIPOS_COM_RESPONSAVEL,
  TIPOS_LINHA_DE_PRAZO,
  faixaDeAtraso,
  rotuloDaSituacaoDoPrazo,
  situacaoDoPrazo,
  tipoAceitaResponsavel,
} from './situacao-prazo'

describe('situação do prazo (EQ-03)', () => {
  it('faixas de atraso: até 7, de 8 a 30 e mais de 30 dias', () => {
    expect(faixaDeAtraso(1)).toBe('ate_7')
    expect(faixaDeAtraso(7)).toBe('ate_7')
    expect(faixaDeAtraso(8)).toBe('de_8_a_30')
    expect(faixaDeAtraso(30)).toBe('de_8_a_30')
    expect(faixaDeAtraso(31)).toBe('mais_de_30')
  })

  it('ocorrência: atrasada, hoje, amanhã e em N dias (Protótipo 05)', () => {
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: -45 })).toEqual({
      tipo: 'atrasada',
      dias: 45,
      faixa: 'mais_de_30',
    })
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: 0 })).toEqual({ tipo: 'hoje' })
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: 1 })).toEqual({ tipo: 'amanha' })
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: 6 })).toEqual({ tipo: 'em_dias', dias: 6 })
  })

  it('em conferência só enquanto não atrasa', () => {
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: 2, emConferencia: true })).toEqual({
      tipo: 'em_conferencia',
    })
    expect(situacaoDoPrazo({ tipo: 'ocorrencia', dias: -2, emConferencia: true }).tipo).toBe(
      'atrasada',
    )
  })

  it('validade e limite de protocolo têm rótulos próprios', () => {
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'validade', dias: -3 }))).toBe(
      'Vencida há 3 dias',
    )
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'limite_protocolo', dias: -1 }))).toBe(
      'Prazo de protocolo vencido há 1 dia',
    )
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'limite_protocolo', dias: 6 }))).toBe(
      'Em 6 dias',
    )
  })

  it('rótulos com o número escrito', () => {
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'ocorrencia', dias: -1 }))).toBe(
      'Atrasada 1 dia',
    )
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'ocorrencia', dias: -12 }))).toBe(
      'Atrasada 12 dias',
    )
  })
})

describe('exigência e vencimento (base das oito funções)', () => {
  it('exigência é prazo com responsável: atrasa por faixa, sem "em conferência"', () => {
    expect(situacaoDoPrazo({ tipo: 'exigencia', dias: -10 })).toEqual({
      tipo: 'atrasada',
      dias: 10,
      faixa: 'de_8_a_30',
    })
    expect(situacaoDoPrazo({ tipo: 'exigencia', dias: 0 })).toEqual({ tipo: 'hoje' })
    expect(situacaoDoPrazo({ tipo: 'exigencia', dias: 1 })).toEqual({ tipo: 'amanha' })
    expect(situacaoDoPrazo({ tipo: 'exigencia', dias: 3, emConferencia: true })).toEqual({
      tipo: 'em_dias',
      dias: 3,
    })
  })

  it('vencimento é como validade: vence em vez de atrasar', () => {
    expect(situacaoDoPrazo({ tipo: 'vencimento', dias: -2 })).toEqual({ tipo: 'vencida', dias: 2 })
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'vencimento', dias: -1 }))).toBe(
      'Vencida há 1 dia',
    )
    expect(rotuloDaSituacaoDoPrazo(situacaoDoPrazo({ tipo: 'vencimento', dias: 30 }))).toBe(
      'Em 30 dias',
    )
    expect(situacaoDoPrazo({ tipo: 'vencimento', dias: 0 })).toEqual({ tipo: 'hoje' })
  })

  it('todo tipo tem rótulo próprio, sem repetir', () => {
    const rotulos = TIPOS_LINHA_DE_PRAZO.map((tipo) => ROTULO_DO_TIPO_DE_LINHA[tipo])
    expect(rotulos).toEqual([
      'Condicionante',
      'Validade',
      'Limite de protocolo',
      'Exigência',
      'Vencimento',
    ])
    expect(new Set(rotulos).size).toBe(rotulos.length)
  })

  it('ocorrência e exigência aceitam responsável; validade, limite e vencimento não', () => {
    expect(TIPOS_COM_RESPONSAVEL).toEqual(['ocorrencia', 'exigencia'])
    expect(TIPOS_LINHA_DE_PRAZO.filter(tipoAceitaResponsavel)).toEqual(['ocorrencia', 'exigencia'])
  })
})
