import { describe, expect, it } from 'vitest'

import { linhaDaMudanca, pedeEmailNaHora } from './aviso-de-norma'

describe('aviso de mudança de norma (L7)', () => {
  it('e-mail na hora só para revogação com licença ativa', () => {
    expect(pedeEmailNaHora('revogada', 1)).toBe(true)
    expect(pedeEmailNaHora('revogada', 0)).toBe(false)
    expect(pedeEmailNaHora('alterada', 3)).toBe(false)
    expect(pedeEmailNaHora('nova', 3)).toBe(false)
  })

  it('linha da mudança com o rótulo, a norma e onde afeta', () => {
    expect(
      linhaDaMudanca({
        tipo: 'revogada',
        normaTitulo: 'IN 02 · Efluentes',
        empreendimentoNome: 'Metalúrgica',
        licenca: 'LAO 4821/2023',
      }),
    ).toBe('Norma revogada · IN 02 · Efluentes · Metalúrgica (LAO 4821/2023)')
    expect(
      linhaDaMudanca({
        tipo: 'alterada',
        normaTitulo: 'Portaria 10',
        empreendimentoNome: 'Padaria',
        licenca: null,
      }),
    ).toBe('Norma alterada · Portaria 10 · Padaria')
    expect(
      linhaDaMudanca({
        tipo: 'outra',
        normaTitulo: 'Lei 1',
        empreendimentoNome: null,
        licenca: null,
      }),
    ).toBe('Mudança de norma · Lei 1')
  })
})
