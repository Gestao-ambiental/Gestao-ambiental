import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  DIAS_DE_RENOVACAO_PROTEGIDA,
  DIAS_UTEIS_DE_NAO_PLANEJADA,
  DIAS_UTEIS_DE_URGENCIA,
  antecedenciaEmDiasUteis,
  ehNaoPlanejada,
  ehUrgencia,
  picoSobreMedia,
  proporcao,
  renovacaoProtegida,
} from './metricas-de-valor'

const d = dataCivil

describe('métricas de valor', () => {
  it('limiares: 3 e 5 dias úteis, 120 dias corridos', () => {
    expect([
      DIAS_UTEIS_DE_URGENCIA,
      DIAS_UTEIS_DE_NAO_PLANEJADA,
      DIAS_DE_RENOVACAO_PROTEGIDA,
    ]).toEqual([3, 5, 120])
  })

  it('antecedência em dias úteis pula fim de semana e feriado nacional, e é negativa no atraso', () => {
    // Sexta 13/11/2026 → sexta 20/11/2026 (Consciência Negra): 16, 17, 18 e 19.
    expect(antecedenciaEmDiasUteis(d('2026-11-13'), d('2026-11-20'))).toBe(4)
    expect(antecedenciaEmDiasUteis(d('2026-02-02'), d('2026-02-27'))).toBe(19)
    expect(antecedenciaEmDiasUteis(d('2026-02-13'), d('2026-02-13'))).toBe(0)
    expect(antecedenciaEmDiasUteis(d('2026-02-09'), d('2026-02-05'))).toBe(-2)
  })

  it('urgência: concluída no prazo com 3 dias úteis de folga ou menos; atrasada não conta', () => {
    expect(ehUrgencia(d('2026-02-10'), d('2026-02-13'))).toBe(true)
    // Sexta → quinta seguinte: 4 dias úteis.
    expect(ehUrgencia(d('2026-02-06'), d('2026-02-12'))).toBe(false)
    expect(ehUrgencia(d('2026-02-09'), d('2026-02-05'))).toBe(false)
  })

  it('não planejada: prazo a 5 dias úteis ou menos da criação (ou já vencido)', () => {
    expect(ehNaoPlanejada(d('2026-02-02'), d('2026-02-09'))).toBe(true)
    expect(ehNaoPlanejada(d('2026-02-02'), d('2026-02-10'))).toBe(false)
    expect(ehNaoPlanejada(d('2026-02-02'), d('2026-01-30'))).toBe(true)
  })

  it('renovação protegida: protocolo 120 dias ou mais antes do vencimento', () => {
    expect(renovacaoProtegida(d('2026-12-31'), d('2026-09-02'))).toBe(true)
    expect(renovacaoProtegida(d('2026-12-31'), d('2026-09-03'))).toBe(false)
    expect(renovacaoProtegida(d('2026-12-31'), null)).toBe(false)
  })

  it('sem denominador não há número; carga é pico ÷ média', () => {
    expect(proporcao(1, 0)).toBeNull()
    expect(proporcao(1, 4)).toBe(0.25)
    expect(picoSobreMedia(1, 4, 10)).toBe(2.5)
    expect(picoSobreMedia(0, 0, 10)).toBeNull()
  })
})
