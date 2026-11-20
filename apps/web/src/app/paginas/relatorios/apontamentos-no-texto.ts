// Apontamentos da IA dentro do texto do relatório (ADR-0040): o trecho fica sublinhado no editor, o
// clique no sublinhado escolhe o apontamento e "Aplicar sugestão" troca o trecho pela substituição.
// O trecho que a IA devolve é literal; quando não aparece mais no texto (alguém já corrigiu), o
// apontamento continua na lista, sem sublinhado.
import { Extension, type Editor } from '@tiptap/core'
import type { Node as NoDoProseMirror } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import type { Apontamento } from '@/lib/api/conferencia-ia'

export interface Intervalo {
  from: number
  to: number
}

/** Onde o trecho aparece primeiro no documento (dentro de um mesmo bloco de texto). */
export function acharTrecho(doc: NoDoProseMirror, trecho: string): Intervalo | null {
  const alvo = trecho.trim()
  if (!alvo) return null
  let achado: Intervalo | null = null
  doc.descendants((no, pos) => {
    if (achado) return false
    if (!no.isTextblock) return true
    // Texto do bloco e, para cada caractere, a posição no documento (nó não textual = 1 posição).
    let texto = ''
    const posicoes: number[] = []
    no.forEach((filho, deslocamento) => {
      const inicio = pos + 1 + deslocamento
      if (filho.isText) {
        const t = filho.text ?? ''
        for (let i = 0; i < t.length; i++) posicoes.push(inicio + i)
        texto += t
      } else {
        posicoes.push(inicio)
        texto += '￼'
      }
    })
    const indice = texto.indexOf(alvo)
    if (indice >= 0) {
      const from = posicoes[indice]
      const ultimo = posicoes[indice + alvo.length - 1]
      if (from !== undefined && ultimo !== undefined) achado = { from, to: ultimo + 1 }
    }
    return false
  })
  return achado
}

export interface ApontamentoNoTexto {
  indice: number
  apontamento: Apontamento
}

interface Estado {
  apontamentos: ApontamentoNoTexto[]
  ativo: number | null
  decoracoes: DecorationSet
}

export const chaveDosApontamentos = new PluginKey<Estado>('apontamentos-da-ia')

function decorar(doc: NoDoProseMirror, apontamentos: ApontamentoNoTexto[], ativo: number | null) {
  const decoracoes: Decoration[] = []
  for (const { indice, apontamento } of apontamentos) {
    const intervalo = acharTrecho(doc, apontamento.trecho)
    if (!intervalo) continue
    decoracoes.push(
      Decoration.inline(
        intervalo.from,
        intervalo.to,
        {
          class: [
            'trecho-apontado',
            `trecho-apontado-${apontamento.gravidade}`,
            indice === ativo ? 'trecho-apontado-ativo' : '',
          ]
            .filter(Boolean)
            .join(' '),
          'data-apontamento': String(indice),
        },
        { indice },
      ),
    )
  }
  return DecorationSet.create(doc, decoracoes)
}

/**
 * Extensão do editor do relatório. A tela atualiza a lista com `mostrarApontamentos` e recebe o
 * apontamento clicado em `aoEscolher`.
 */
export function sublinhadoDaIa(aoEscolher: (indice: number) => void) {
  return Extension.create({
    name: 'sublinhadoDaIa',
    addProseMirrorPlugins() {
      return [
        new Plugin<Estado>({
          key: chaveDosApontamentos,
          state: {
            init: (_, { doc }) => ({
              apontamentos: [],
              ativo: null,
              decoracoes: DecorationSet.create(doc, []),
            }),
            apply(tr, anterior, _velho, novo) {
              const meta = tr.getMeta(chaveDosApontamentos) as
                { apontamentos?: ApontamentoNoTexto[]; ativo?: number | null } | undefined
              if (!meta && !tr.docChanged) return anterior
              const apontamentos = meta?.apontamentos ?? anterior.apontamentos
              const ativo = meta && 'ativo' in meta ? (meta.ativo ?? null) : anterior.ativo
              return { apontamentos, ativo, decoracoes: decorar(novo.doc, apontamentos, ativo) }
            },
          },
          props: {
            decorations: (estado) => chaveDosApontamentos.getState(estado)?.decoracoes,
            handleClick(view, pos) {
              const estado = chaveDosApontamentos.getState(view.state)
              const achada = estado?.decoracoes.find(pos, pos)[0]
              const indice = (achada?.spec as { indice?: number } | undefined)?.indice
              if (indice === undefined) return false
              aoEscolher(indice)
              return false
            },
          },
        }),
      ]
    },
  })
}

export function mostrarApontamentos(
  editor: Editor,
  apontamentos: ApontamentoNoTexto[],
  ativo: number | null,
): void {
  editor.view.dispatch(editor.state.tr.setMeta(chaveDosApontamentos, { apontamentos, ativo }))
}

/** Troca o trecho pela substituição. Devolve false quando o trecho não está mais no texto. */
export function aplicarSugestao(editor: Editor, apontamento: Apontamento): boolean {
  if (!apontamento.substituicao) return false
  const intervalo = acharTrecho(editor.state.doc, apontamento.trecho)
  if (!intervalo) return false
  editor.view.dispatch(
    editor.state.tr.insertText(apontamento.substituicao, intervalo.from, intervalo.to),
  )
  return true
}

/** Leva a seleção e a rolagem até o trecho. */
export function irAoTrecho(editor: Editor, apontamento: Apontamento): boolean {
  const intervalo = acharTrecho(editor.state.doc, apontamento.trecho)
  if (!intervalo) return false
  editor.chain().focus().setTextSelection(intervalo).scrollIntoView().run()
  return true
}
