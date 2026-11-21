import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  horasDaExecucao,
  minutosDoLancamentoValidos,
  situacaoDaParcela,
  situacaoFinanceira,
} from './execucao-do-orcamento'

const HOJE = dataCivil('2026-11-21')

describe('execução do orçamento', () => {
  it('horas: diferença é orçado menos lançado, e a proporção', () => {
    expect(
      horasDaExecucao([
        { orcadoMinutos: 600, lancadoMinutos: 90 },
        { orcadoMinutos: 60, lancadoMinutos: 120 },
      ]),
    ).toEqual({
      orcadoMinutos: 660,
      lancadoMinutos: 210,
      diferencaMinutos: 450,
      proporcao: 210 / 660,
    })
  })

  it('nada orçado: proporção nula', () => {
    expect(horasDaExecucao([{ orcadoMinutos: 0, lancadoMinutos: 30 }]).proporcao).toBeNull()
  })

  it('dinheiro: recebido, a receber e o vencido sem receber', () => {
    const parcelas = [
      { valorCentavos: 33330, recebidoCentavos: 33330, venceEm: dataCivil('2026-10-12') },
      { valorCentavos: 33330, recebidoCentavos: 10000, venceEm: dataCivil('2026-11-11') },
      { valorCentavos: 33341, recebidoCentavos: 0, venceEm: dataCivil('2026-12-11') },
      { valorCentavos: 100, recebidoCentavos: 0, venceEm: null },
    ]
    expect(situacaoFinanceira(parcelas, HOJE)).toEqual({
      aprovadoCentavos: 100101,
      recebidoCentavos: 43330,
      aReceberCentavos: 56771,
      vencidoCentavos: 23330,
    })
  })

  it('vence hoje ainda não é vencida; recebido a mais não vira saldo negativo', () => {
    expect(
      situacaoDaParcela({ valorCentavos: 100, recebidoCentavos: 0, venceEm: HOJE }, HOJE),
    ).toBe('a_receber')
    expect(
      situacaoDaParcela(
        { valorCentavos: 100, recebidoCentavos: 0, venceEm: dataCivil('2026-11-20') },
        HOJE,
      ),
    ).toBe('vencida')
    expect(
      situacaoDaParcela({ valorCentavos: 100, recebidoCentavos: 150, venceEm: null }, HOJE),
    ).toBe('recebida')
    expect(
      situacaoFinanceira([{ valorCentavos: 100, recebidoCentavos: 150, venceEm: null }], HOJE)
        .aReceberCentavos,
    ).toBe(0)
  })

  it('minutos de 1 a 1440', () => {
    expect(minutosDoLancamentoValidos(1)).toBe(true)
    expect(minutosDoLancamentoValidos(1440)).toBe(true)
    expect(minutosDoLancamentoValidos(0)).toBe(false)
    expect(minutosDoLancamentoValidos(1441)).toBe(false)
    expect(minutosDoLancamentoValidos(1.5)).toBe(false)
  })
})
