import { describe, expect, it } from 'vitest'

import { destacarTrecho, limparDestaques } from './destacar-trecho'

/** Camada de texto como a do pdf.js: um span por pedaço de linha. */
function camada(...pedacos: string[]): HTMLElement {
  const div = document.createElement('div')
  for (const pedaco of pedacos) {
    const span = document.createElement('span')
    span.textContent = pedaco
    div.append(span)
  }
  return div
}

function marcado(div: HTMLElement): string {
  return [...div.querySelectorAll('.destaque-ia')].map((m) => m.textContent).join('|')
}

describe('destacar o trecho de onde a IA tirou o campo', () => {
  it('acha o trecho dentro de um pedaço e marca só ele', () => {
    const div = camada('LICENÇA AMBIENTAL DE OPERAÇÃO SEI Nº 109/2020 - SAMA.UAT')
    const marca = destacarTrecho(div, ['109/2020'])
    expect(marca?.textContent).toBe('109/2020')
    expect(div.textContent).toBe('LICENÇA AMBIENTAL DE OPERAÇÃO SEI Nº 109/2020 - SAMA.UAT')
  })

  it('ignora caixa, acento e espaços, mesmo partido em pedaços', () => {
    const div = camada('A presente licença é válida até 19/08/', '2024 totalizando 48 meses.')
    destacarTrecho(div, ['valida ate 19/08/2024'])
    expect(marcado(div)).toBe('válida até 19/08/|2024')
  })

  it('usa o primeiro trecho que aparecer; sem nenhum, não marca nada', () => {
    const div = camada('Licença Ambiental de Operação')
    expect(destacarTrecho(div, [null, 'Licença Ambiental de Operação', 'LAO'])).not.toBeNull()
    expect(marcado(div)).toBe('Licença Ambiental de Operação')

    expect(destacarTrecho(div, ['Instituto do Meio Ambiente', 'ab'])).toBeNull()
    expect(marcado(div)).toBe('')
    expect(div.textContent).toBe('Licença Ambiental de Operação')
  })

  it('um destaque novo tira o anterior', () => {
    const div = camada('Emissão 20/08/2020 · Validade 19/08/2024')
    destacarTrecho(div, ['20/08/2020'])
    destacarTrecho(div, ['19/08/2024'])
    expect(marcado(div)).toBe('19/08/2024')
    limparDestaques(div)
    expect(div.querySelectorAll('.destaque-ia')).toHaveLength(0)
    expect(div.querySelector('span')?.childNodes).toHaveLength(1)
  })
})
