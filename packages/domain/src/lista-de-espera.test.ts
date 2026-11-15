import { describe, expect, it } from 'vitest'

import { formatarContato, linkDoContato, normalizarContato } from './lista-de-espera'

describe('Lista de espera: contato', () => {
  it('e-mail fica em minúsculas, sem espaços', () => {
    expect(normalizarContato(' Marina@Exemplo.test ')).toEqual({
      tipo: 'email',
      valor: 'marina@exemplo.test',
    })
  })

  it('WhatsApp ganha o DDI 55 e fica só com dígitos', () => {
    expect(normalizarContato('(47) 99999-1234')).toEqual({
      tipo: 'whatsapp',
      valor: '5547999991234',
    })
    expect(normalizarContato('+55 47 3333-1234')?.valor).toBe('554733331234')
  })

  it('recusa o que não é e-mail nem celular brasileiro', () => {
    expect(normalizarContato('pedro@semponto')).toBeNull()
    expect(normalizarContato('1234')).toBeNull()
    expect(normalizarContato('(07) 99999-1234')).toBeNull()
    expect(normalizarContato('')).toBeNull()
  })

  it('formata e monta o link para responder', () => {
    const whats = { tipo: 'whatsapp', valor: '5547999991234' } as const
    expect(formatarContato(whats)).toBe('+55 (47) 99999-1234')
    expect(linkDoContato(whats)).toBe('https://wa.me/5547999991234')
    const email = { tipo: 'email', valor: 'marina@exemplo.test' } as const
    expect(formatarContato(email)).toBe('marina@exemplo.test')
    expect(linkDoContato(email)).toBe('mailto:marina@exemplo.test')
  })
})
