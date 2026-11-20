// Trecho apontado pela IA dentro do editor (ADR-0040): achar, sublinhar, aplicar a sugestão.
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Apontamento } from '@/lib/api/conferencia-ia'

import { extensoesDoModelo } from '../modelos/extensoes'
import {
  acharTrecho,
  aplicarSugestao,
  mostrarApontamentos,
  sublinhadoDaIa,
} from './apontamentos-no-texto'

const apontamento: Apontamento = {
  origem: 'ia',
  categoria: 'licenca',
  gravidade: 'corrigir',
  trecho: 'LAO 4812/2023',
  problema: 'Número da licença diferente do cadastro.',
  sugestao: 'Use LAO 4821/2023.',
  substituicao: 'LAO 4821/2023',
}

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

function criar(aoEscolher = vi.fn()) {
  editor = new Editor({
    extensions: [...extensoesDoModelo(), sublinhadoDaIa(aoEscolher)],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Relatório' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Conforme a ' },
            { type: 'text', text: 'LAO 4812', marks: [{ type: 'bold' }] },
            { type: 'text', text: '/2023, emitida pelo IMA.' },
          ],
        },
      ],
    },
  })
  return editor
}

describe('acharTrecho', () => {
  it('acha o trecho mesmo quando ele atravessa marcas diferentes', () => {
    const e = criar()
    const intervalo = acharTrecho(e.state.doc, 'LAO 4812/2023')
    expect(intervalo).not.toBeNull()
    if (!intervalo) return
    expect(e.state.doc.textBetween(intervalo.from, intervalo.to)).toBe('LAO 4812/2023')
  })

  it('devolve nulo quando o trecho não está no texto ou é vazio', () => {
    const e = criar()
    expect(acharTrecho(e.state.doc, 'LAO 9999/2020')).toBeNull()
    expect(acharTrecho(e.state.doc, '   ')).toBeNull()
  })
})

describe('sublinhado e sugestão', () => {
  it('sublinha o trecho com a classe da gravidade e marca o escolhido', () => {
    const e = criar()
    mostrarApontamentos(e, [{ indice: 0, apontamento }], 0)
    const sublinhados = e.view.dom.querySelectorAll('.trecho-apontado')
    expect([...sublinhados].map((n) => n.textContent).join('')).toBe('LAO 4812/2023')
    expect(sublinhados[0]).toHaveClass('trecho-apontado-corrigir', 'trecho-apontado-ativo')
    expect(sublinhados[0]).toHaveAttribute('data-apontamento', '0')
  })

  it('aplicar a sugestão troca o trecho e tira o sublinhado', () => {
    const e = criar()
    mostrarApontamentos(e, [{ indice: 0, apontamento }], null)
    expect(aplicarSugestao(e, apontamento)).toBe(true)
    expect(e.getText()).toContain('Conforme a LAO 4821/2023, emitida pelo IMA.')
    expect(e.view.dom.querySelector('.trecho-apontado')).toBeNull()
    // Já trocado: não acha mais o trecho.
    expect(aplicarSugestao(e, apontamento)).toBe(false)
  })

  it('sem substituição, não troca nada', () => {
    const e = criar()
    expect(aplicarSugestao(e, { ...apontamento, substituicao: '' })).toBe(false)
    expect(e.getText()).toContain('LAO 4812/2023')
  })
})
