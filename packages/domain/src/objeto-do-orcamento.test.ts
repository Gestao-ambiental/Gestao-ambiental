import { describe, expect, it } from 'vitest'

import { OBJETO_INICIAL, objetoAindaAutomatico, objetoAutomatico } from './objeto-do-orcamento'

describe('objeto automático do orçamento', () => {
  it('sem modelo nem serviço, usa o inicial', () => {
    expect(objetoAutomatico({ servicos: [] })).toBe(OBJETO_INICIAL)
    expect(objetoAutomatico({ modelo: '  ', servicos: ['', '   '] })).toBe(OBJETO_INICIAL)
  })

  it('o modelo aplicado vence o primeiro serviço', () => {
    expect(objetoAutomatico({ modelo: 'Licenciamento (LO)', servicos: ['Vistoria inicial'] })).toBe(
      'Licenciamento (LO)',
    )
  })

  it('sem modelo, usa o primeiro serviço com nome, sem espaços sobrando', () => {
    expect(objetoAutomatico({ servicos: ['', '  AUA   da padaria ', 'Outro'] })).toBe(
      'AUA da padaria',
    )
  })

  it('corta nome longo em 200 caracteres', () => {
    const longo = 'a'.repeat(300)
    const objeto = objetoAutomatico({ servicos: [longo] })
    expect(objeto).toHaveLength(200)
    expect(objeto.endsWith('…')).toBe(true)
  })

  it('reconhece o objeto que ainda é automático', () => {
    expect(objetoAindaAutomatico(OBJETO_INICIAL, [])).toBe(true)
    expect(objetoAindaAutomatico('', ['Vistoria'])).toBe(true)
    expect(objetoAindaAutomatico('Vistoria', ['Vistoria', 'Relatório'])).toBe(true)
  })

  it('objeto escrito à mão ou nome de modelo não é trocado', () => {
    expect(objetoAindaAutomatico('AUA da padaria', ['Vistoria'])).toBe(false)
    expect(objetoAindaAutomatico('Licenciamento (LO)', [])).toBe(false)
  })
})
