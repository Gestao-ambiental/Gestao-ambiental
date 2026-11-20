// Extensões do editor de modelo (ADR-0036). O nó `campo` é um marcador inline e indivisível: no
// editor aparece como o rótulo ("Validade da licença"); no .docx vira o valor do cadastro.
import { marcadorSemValor, rotuloDoCampo } from '@gestao-ambiental/domain'
import { mergeAttributes, Node, type Extensions } from '@tiptap/core'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'

export const NoCampo = Node.create({
  name: 'campo',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      chave: {
        default: null,
        parseHTML: (elemento) => elemento.getAttribute('data-campo'),
        renderHTML: (atributos) => ({ 'data-campo': String(atributos.chave) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-campo]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const chave = String(node.attrs.chave)
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'campo-do-modelo' }),
      rotuloDoCampo(chave),
    ]
  },

  renderText({ node }) {
    return marcadorSemValor(String(node.attrs.chave))
  },
})

/** O conjunto de recursos do editor; o .docx sabe converter cada um deles. */
export function extensoesDoModelo(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      heading: { levels: [1, 2, 3] },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    NoCampo,
  ]
}
