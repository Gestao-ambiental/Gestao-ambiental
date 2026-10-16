import { describe, expect, it } from 'vitest'

import { formatarDataCivil } from './index'

describe('formatarDataCivil', () => {
  it('exibe a data civil como dd/mm/aaaa', () => {
    expect(formatarDataCivil('2027-01-12')).toBe('12/01/2027')
  })

  it('não desloca o dia pelo fuso do aparelho', () => {
    expect(formatarDataCivil('2026-12-31')).toBe('31/12/2026')
  })
})
