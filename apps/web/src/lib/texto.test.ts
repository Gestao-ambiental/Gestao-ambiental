import { describe, expect, it } from 'vitest'

import { iniciais, tamanhoLegivel } from './texto'

describe('texto', () => {
  it('tamanho legível em KB (nunca 0) e em MB com vírgula', () => {
    expect(tamanhoLegivel(100)).toBe('1 KB')
    expect(tamanhoLegivel(350 * 1024)).toBe('350 KB')
    expect(tamanhoLegivel(2.4 * 1024 * 1024)).toBe('2,4 MB')
  })

  it('iniciais: até duas, em maiúsculas', () => {
    expect(iniciais('Metalúrgica Rio Cubatão')).toBe('MR')
  })
})
