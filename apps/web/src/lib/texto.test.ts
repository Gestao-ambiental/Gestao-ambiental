import { describe, expect, it } from 'vitest'

import { ehUuid, iniciais, tamanhoLegivel } from './texto'

describe('texto', () => {
  it('tamanho legível em KB (nunca 0) e em MB com vírgula', () => {
    expect(tamanhoLegivel(100)).toBe('1 KB')
    expect(tamanhoLegivel(350 * 1024)).toBe('350 KB')
    expect(tamanhoLegivel(2.4 * 1024 * 1024)).toBe('2,4 MB')
  })

  it('iniciais: até duas, em maiúsculas', () => {
    expect(iniciais('Metalúrgica Rio Cubatão')).toBe('MR')
  })

  it('ehUuid aceita só o formato de uuid', () => {
    expect(ehUuid('5f0c7a9e-2b1d-4c3e-9f8a-1b2c3d4e5f60')).toBe(true)
    expect(ehUuid('5F0C7A9E-2B1D-4C3E-9F8A-1B2C3D4E5F60')).toBe(true)
    expect(ehUuid('abc')).toBe(false)
    expect(ehUuid('5f0c7a9e-2b1d-4c3e-9f8a-1b2c3d4e5f6')).toBe(false)
    expect(ehUuid(' 5f0c7a9e-2b1d-4c3e-9f8a-1b2c3d4e5f60')).toBe(false)
    expect(ehUuid('')).toBe(false)
    expect(ehUuid(null)).toBe(false)
  })
})
