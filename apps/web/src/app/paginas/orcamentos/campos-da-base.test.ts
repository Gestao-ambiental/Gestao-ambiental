import { describe, expect, it } from 'vitest'

import { profissoesDosMembros } from './campos-da-base'

describe('profissoesDosMembros (ADR-0021)', () => {
  it('formado leva o rótulo da lista; em curso, o do curso, num grupo à parte', () => {
    const mapa = profissoesDosMembros([
      { id: 'helena', profissao: 'eng_ambiental', profissaoEmCurso: false },
      { id: 'lia', profissao: 'eng_ambiental', profissaoEmCurso: true },
      { id: 'ana', profissao: null, profissaoEmCurso: false },
    ])
    expect(mapa.get('helena')).toBe('Engenheiro ambiental')
    expect(mapa.get('lia')).toBe('Estudante de engenharia ambiental')
    // Sem profissão, fica de fora (vale o texto da linha).
    expect(mapa.has('ana')).toBe(false)
  })
})
