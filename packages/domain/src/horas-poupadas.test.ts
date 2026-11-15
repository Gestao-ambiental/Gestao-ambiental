import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  calcularHorasPoupadas,
  contaComoTempoAtivo,
  ehRotaDeAcompanhamento,
  errosDaLinhaDeBase,
  formatarHoras,
  juntandoDados,
  mesesDoResumo,
  precisaResponderLinhaDeBase,
  semanasParaAcompanhamento,
  type EntradaDasHorasPoupadas,
} from './horas-poupadas'

const base: EntradaDasHorasPoupadas = {
  condicionantesIa: 20,
  segundosIa: 20 * 60, // 1 min por condicionante com IA
  condicionantesManuais: 0,
  segundosManuais: 0,
  segundosAcompanhamento: 3600, // 1 h medida no mês
  semanas: 4,
  linhaDeBase: { horasSemanaConferindo: 5, minutosPorCondicionante: 10 },
  horaCentavos: 10000,
}

describe('horas poupadas (ADR-0027)', () => {
  it('sem 5 condicionantes manuais medidas, vale o declarado; com elas, o medido', () => {
    // Declarado: (10 − 1) × 20 ÷ 60 = 3 h no cadastro; acompanhamento 5 × 4 − 1 = 19 h.
    const declarado = calcularHorasPoupadas(base)
    expect(declarado.manualMedido).toBe(false)
    expect(declarado.minutosManual).toBe(10)
    expect(declarado.horasCadastro).toBeCloseTo(3)
    expect(declarado.horasAcompanhamento).toBeCloseTo(19)
    expect(declarado.horasTotal).toBeCloseTo(22)
    expect(declarado.reaisCentavos).toBe(220000)
    expect(declarado.estimado).toBe(true)

    // Medido: 5 condicionantes em 20 min = 4 min cada → (4 − 1) × 20 ÷ 60 = 1 h.
    const medido = calcularHorasPoupadas({
      ...base,
      condicionantesManuais: 5,
      segundosManuais: 20 * 60,
      linhaDeBase: null,
    })
    expect(medido.manualMedido).toBe(true)
    expect(medido.minutosManual).toBeCloseTo(4)
    expect(medido.horasCadastro).toBeCloseTo(1)
    expect(medido.horasAcompanhamento).toBe(0)
    expect(medido.estimado).toBe(false)
  })

  it('nunca negativo; sem custo da hora, sem reais', () => {
    const resultado = calcularHorasPoupadas({
      ...base,
      segundosIa: 20 * 15 * 60, // IA levou 15 min por condicionante: pior que à mão
      segundosAcompanhamento: 30 * 3600, // mais do que as 20 h declaradas
      horaCentavos: null,
    })
    expect(resultado.horasCadastro).toBe(0)
    expect(resultado.horasAcompanhamento).toBe(0)
    expect(resultado.horasTotal).toBe(0)
    expect(resultado.reaisCentavos).toBeNull()
  })

  it('mês sem acompanhamento medido não devolve as horas declaradas', () => {
    const resultado = calcularHorasPoupadas({ ...base, segundosAcompanhamento: 0 })
    expect(resultado.horasAcompanhamento).toBe(0)
  })

  it('"Juntando dados" até 30 dias da primeira tarefa ou 10 condicionantes', () => {
    const agora = new Date('2026-11-14T12:00:00Z')
    expect(juntandoDados(null, agora, 0)).toBe(true)
    expect(juntandoDados('2026-10-20T12:00:00Z', agora, 9)).toBe(true)
    expect(juntandoDados('2026-10-15T12:00:00Z', agora, 0)).toBe(false)
    expect(juntandoDados(null, agora, 10)).toBe(false)
  })

  it('tempo ativo: aba visível e interação nos últimos 2 minutos', () => {
    expect(contaComoTempoAtivo(200_000, 100_000, true)).toBe(true)
    expect(contaComoTempoAtivo(221_000, 100_000, true)).toBe(false)
    expect(contaComoTempoAtivo(200_000, 100_000, false)).toBe(false)
    expect(contaComoTempoAtivo(200_000, null, true)).toBe(false)
  })

  it('rotas de acompanhamento, semanas do mês, seletor e linha de base', () => {
    expect(
      ['/', '/calendario', '/empreendimentos/e1', '/acompanhamentos', '/residuos/painel'].map(
        ehRotaDeAcompanhamento,
      ),
    ).toEqual([true, true, true, true, true])
    expect(
      ['/licencas/x/condicionantes', '/orcamentos', '/admin'].map(ehRotaDeAcompanhamento),
    ).toEqual([false, false, false])
    expect(semanasParaAcompanhamento(dataCivil('2026-10-01'), dataCivil('2026-11-14'))).toBeCloseTo(
      31 / 7,
    )
    expect(semanasParaAcompanhamento(dataCivil('2026-11-01'), dataCivil('2026-11-14'))).toBeCloseTo(
      2,
    )
    expect(mesesDoResumo(dataCivil('2026-02-10'), 3)).toEqual([
      '2026-02-01',
      '2026-01-01',
      '2025-12-01',
    ])
    const agora = new Date('2026-11-14T12:00:00Z')
    expect(precisaResponderLinhaDeBase(null, agora, null)).toBe(true)
    expect(precisaResponderLinhaDeBase('2026-10-01T12:00:00Z', agora, null)).toBe(false)
    expect(precisaResponderLinhaDeBase('2026-08-01T12:00:00Z', agora, null)).toBe(true)
    expect(precisaResponderLinhaDeBase(null, agora, '2026-11-20T00:00:00Z')).toBe(false)
    expect(
      errosDaLinhaDeBase({
        licencasAtivas: '12',
        horasSemanaConferindo: '6,5',
        minutosPorCondicionante: '',
        surpresasPorMes: '1,5',
      }),
    ).toEqual({
      minutosPorCondicionante: 'Informe um número',
      surpresasPorMes: 'Use um número inteiro',
    })
    expect(formatarHoras(12.345)).toBe('12,3 h')
  })
})
