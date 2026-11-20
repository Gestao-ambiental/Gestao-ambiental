import { describe, expect, it } from 'vitest'

import { diferencaEmDias } from './data-civil'
import { diaUtilAnterior, ehDiaUtil, prazoDeOficio } from './dias-uteis'

describe('portados de tests/domain.test.mjs do protótipo', () => {
  // protótipo: tests/domain.test.mjs:231
  it('dias corridos e prazo interno são separados; sexta feriado antecipa para quinta', () => {
    const datas = prazoDeOficio('2026-08-20', 30, 'corridos', ['2026-09-18'])
    expect(datas.oficial).toBe('2026-09-19')
    expect(datas.interno).toBe('2026-09-17')
    expect(diferencaEmDias(datas.oficial, '2026-08-20')).toBe(30)
  })

  // protótipo: tests/domain.test.mjs:237
  it('dias úteis excluem final de semana e feriado configurado', () => {
    expect(prazoDeOficio('2026-09-04', 1, 'uteis', ['2026-09-07'])).toEqual({
      oficial: '2026-09-08',
      interno: '2026-09-08',
    })
    expect(diaUtilAnterior('2026-09-07', ['2026-09-07'])).toBe('2026-09-04')
  })
})

describe('dias úteis', () => {
  it('sábado, domingo e feriado não são úteis', () => {
    expect(ehDiaUtil('2026-09-19')).toBe(false) // sábado
    expect(ehDiaUtil('2026-09-20')).toBe(false) // domingo
    expect(ehDiaUtil('2026-09-21')).toBe(true) // segunda
    expect(ehDiaUtil('2026-09-21', ['2026-09-21'])).toBe(false)
  })

  it('prazo de ofício rejeita quantidade fora de 1 a 3650', () => {
    expect(() => prazoDeOficio('2026-09-04', 0)).toThrow(/prazo válido/)
    expect(() => prazoDeOficio('2026-09-04', 3651)).toThrow(/prazo válido/)
    expect(() => prazoDeOficio('2026-09-04', 1.5)).toThrow(/prazo válido/)
  })
})
