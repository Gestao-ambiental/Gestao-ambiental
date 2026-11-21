import { describe, expect, it } from 'vitest'

import type { DataCivil } from './data-civil'
import type { UnidadePrazo } from './dias-uteis'
import {
  DIAS_MAXIMOS_DA_EXIGENCIA,
  ErroDeExigencia,
  ROTULO_DA_SITUACAO_DA_EXIGENCIA,
  metaInternaSugerida,
  metaInternaValida,
  prazoDaExigencia,
  prorrogacaoValida,
  situacaoDaExigencia,
} from './exigencia'

// Mesma tabela do pgTAP 743 (private.prazo_da_exigencia). A meta só existe no domínio.
const CASOS: [DataCivil, number, UnidadePrazo, DataCivil, DataCivil][] = [
  ['2026-11-18', 5, 'corridos', '2026-11-23', '2026-11-23'],
  ['2026-11-18', 3, 'corridos', '2026-11-21', '2026-11-19'],
  ['2026-11-18', 2, 'uteis', '2026-11-23', '2026-11-23'],
  ['2026-11-13', 1, 'uteis', '2026-11-16', '2026-11-16'],
  ['2026-12-23', 3, 'uteis', '2026-12-29', '2026-12-29'],
  ['2026-12-30', 5, 'uteis', '2027-01-07', '2027-01-07'],
  ['2027-03-24', 2, 'uteis', '2027-03-29', '2027-03-29'],
  ['2027-03-16', 10, 'corridos', '2027-03-26', '2027-03-25'],
  ['2026-01-01', 365, 'corridos', '2027-01-01', '2026-12-31'],
]

describe('prazo da exigência (casos cruzados com o pgTAP 743)', () => {
  it.each(CASOS)(
    'recebido %s, %i dias %s: prazo %s, meta %s',
    (recebido, dias, contagem, prazo, meta) => {
      expect(prazoDaExigencia(recebido, dias, contagem)).toEqual({
        prazoOficial: prazo,
        metaInterna: meta,
      })
      expect(metaInternaSugerida(prazo)).toBe(meta)
    },
  )

  it('conta a partir do dia seguinte ao recebimento, sem contar o próprio dia', () => {
    expect(prazoDaExigencia('2026-11-18', 1, 'corridos').prazoOficial).toBe('2026-11-19')
  })

  it('em corridos, o prazo que cai no sábado não é empurrado; a meta antecipa', () => {
    const { prazoOficial, metaInterna } = prazoDaExigencia('2026-11-18', 3, 'corridos')
    expect(prazoOficial).toBe('2026-11-21')
    expect(metaInterna).toBe('2026-11-19')
  })

  it('recusa dias fora de 1 a 365, fracionários e data inválida', () => {
    expect(DIAS_MAXIMOS_DA_EXIGENCIA).toBe(365)
    expect(() => prazoDaExigencia('2026-01-01', 366, 'corridos')).toThrow(ErroDeExigencia)
    expect(() => prazoDaExigencia('2026-01-01', 0, 'uteis')).toThrow(ErroDeExigencia)
    expect(() => prazoDaExigencia('2026-01-01', 2.5, 'uteis')).toThrow(ErroDeExigencia)
    expect(() => prazoDaExigencia('2026-02-30', 5, 'uteis')).toThrow(ErroDeExigencia)
  })
})

describe('meta interna e prorrogação', () => {
  it('meta sugerida é o próprio prazo se útil, senão o dia útil anterior', () => {
    expect(metaInternaSugerida('2026-11-23')).toBe('2026-11-23')
    expect(metaInternaSugerida('2026-11-22')).toBe('2026-11-19')
    expect(metaInternaSugerida('2027-01-03')).toBe('2026-12-31')
  })

  it('meta sugerida nunca fica antes do recebimento (ofício do fim de semana, prazo curto)', () => {
    // Recebido no sábado 21/11/2026, 1 dia corrido: prazo no domingo 22. O dia útil anterior seria
    // a quinta 19 (sexta 20 é feriado), antes do recebimento, e o banco recusaria a meta.
    const { prazoOficial, metaInterna } = prazoDaExigencia('2026-11-21', 1, 'corridos')
    expect(prazoOficial).toBe('2026-11-22')
    expect(metaInterna).toBe('2026-11-21')
    expect(metaInternaValida(metaInterna, '2026-11-21', prazoOficial)).toBe(true)
    expect(metaInternaSugerida('2026-11-22', '2026-11-21')).toBe('2026-11-21')
    expect(metaInternaSugerida('2026-11-22', '2026-11-18')).toBe('2026-11-19')
  })

  it('meta vale do recebimento ao prazo, inclusive', () => {
    expect(metaInternaValida('2026-11-18', '2026-11-18', '2026-11-23')).toBe(true)
    expect(metaInternaValida('2026-11-23', '2026-11-18', '2026-11-23')).toBe(true)
    expect(metaInternaValida('2026-11-17', '2026-11-18', '2026-11-23')).toBe(false)
    expect(metaInternaValida('2026-11-24', '2026-11-18', '2026-11-23')).toBe(false)
  })

  it('prorrogação só para depois do prazo atual', () => {
    expect(prorrogacaoValida('2026-11-23', '2026-11-24')).toBe(true)
    expect(prorrogacaoValida('2026-11-23', '2026-11-23')).toBe(false)
    expect(prorrogacaoValida('2026-11-23', '2026-11-20')).toBe(false)
  })
})

describe('situação da exigência', () => {
  const prazoOficial: DataCivil = '2026-11-23'

  it('aberta: antes do prazo, no dia e depois', () => {
    const aberta = { situacao: 'aberta' as const, prazoOficial, primeiraRespostaEm: null }
    expect(situacaoDaExigencia({ ...aberta, hoje: '2026-11-22' })).toBe('aberta')
    expect(situacaoDaExigencia({ ...aberta, hoje: '2026-11-23' })).toBe('vence_hoje')
    expect(situacaoDaExigencia({ ...aberta, hoje: '2026-11-24' })).toBe('atrasada')
  })

  it('respondida no prazo ou fora dele, pela data do primeiro protocolo', () => {
    const hoje: DataCivil = '2026-12-10'
    const respondida = { situacao: 'respondida' as const, prazoOficial, hoje }
    expect(situacaoDaExigencia({ ...respondida, primeiraRespostaEm: '2026-11-23' })).toBe(
      'respondida',
    )
    expect(situacaoDaExigencia({ ...respondida, primeiraRespostaEm: '2026-11-24' })).toBe(
      'respondida_fora_do_prazo',
    )
    expect(situacaoDaExigencia({ ...respondida, primeiraRespostaEm: null })).toBe('respondida')
  })

  it('todo rótulo é distinto', () => {
    const rotulos = Object.values(ROTULO_DA_SITUACAO_DA_EXIGENCIA)
    expect(rotulos).toEqual([
      'Aberta',
      'Vence hoje',
      'Atrasada',
      'Respondida',
      'Respondida fora do prazo',
    ])
    expect(new Set(rotulos).size).toBe(rotulos.length)
  })
})
