import { describe, expect, it } from 'vitest'

import { ehDiaUtil } from './dias-uteis'

describe('dias úteis', () => {
  it('sábado, domingo e feriado não são úteis', () => {
    expect(ehDiaUtil('2026-09-19')).toBe(false) // sábado
    expect(ehDiaUtil('2026-09-20')).toBe(false) // domingo
    expect(ehDiaUtil('2026-09-21')).toBe(true) // segunda
    expect(ehDiaUtil('2026-09-21', ['2026-09-21'])).toBe(false)
  })
})
