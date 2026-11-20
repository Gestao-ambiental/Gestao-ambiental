// Editor de texto do modelo (ADR-0036): barra de formatação, inserir campo e a área de texto.
import {
  CAMPOS_DO_MODELO,
  GRUPOS_DE_CAMPO,
  type ChaveDoCampo,
  type NoDoDocumento,
} from '@gestao-ambiental/domain'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Fragment, type ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

import { extensoesDoModelo } from './extensoes'
import './editor-modelo.css'

interface Props {
  conteudoInicial: NoDoDocumento
  aoMudar: (conteudo: NoDoDocumento) => void
  somenteLeitura?: boolean
}

export function EditorDeModelo({ conteudoInicial, aoMudar, somenteLeitura = false }: Props) {
  const editor = useEditor({
    extensions: extensoesDoModelo(),
    content: conteudoInicial,
    editable: !somenteLeitura,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: 'editor-modelo',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Texto do modelo',
      },
    },
    onUpdate: ({ editor: atual }) => {
      aoMudar(atual.getJSON() as NoDoDocumento)
    },
  })

  return (
    <div className="flex min-w-0 flex-col rounded-(--raio) border bg-(--folha)">
      {somenteLeitura ? null : <BarraDoEditor editor={editor} />}
      <div className="max-h-[70vh] min-h-[360px] overflow-y-auto px-(--e-6) py-(--e-4)">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function BotaoDaBarra({
  rotulo,
  ativo,
  aoClicar,
  children,
}: {
  rotulo: string
  ativo?: boolean
  aoClicar: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo}
      onMouseDown={(e) => {
        e.preventDefault()
      }}
      onClick={aoClicar}
      className={cn(
        'inline-flex h-(--controle-mini) min-w-(--controle-mini) cursor-pointer items-center justify-center rounded-(--raio) px-(--e-15) corpo-medio text-(--tinta) transicao-estado hover:bg-(--toque)',
        ativo && 'bg-(--escolha) text-(--link) hover:bg-(--escolha-toque)',
      )}
    >
      {children}
    </button>
  )
}

function Separador() {
  return <span aria-hidden className="mx-(--e-1) h-5 w-px bg-(--regra)" />
}

type Estilo = 'paragrafo' | 'titulo1' | 'titulo2' | 'titulo3'

function estiloAtual(e: Editor): Estilo {
  if (e.isActive('heading', { level: 1 })) return 'titulo1'
  if (e.isActive('heading', { level: 2 })) return 'titulo2'
  if (e.isActive('heading', { level: 3 })) return 'titulo3'
  return 'paragrafo'
}

function BarraDoEditor({ editor }: { editor: Editor }) {
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      estilo: estiloAtual(e),
      negrito: e.isActive('bold'),
      italico: e.isActive('italic'),
      sublinhado: e.isActive('underline'),
      marcadores: e.isActive('bulletList'),
      numerada: e.isActive('orderedList'),
      alinhamento:
        (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ??
        'left',
      naTabela: e.isActive('table'),
    }),
  })

  function trocarEstilo(estilo: Estilo) {
    const cadeia = editor.chain().focus()
    if (estilo === 'paragrafo') cadeia.setParagraph().run()
    else cadeia.setHeading({ level: Number(estilo.slice(-1)) as 1 | 2 | 3 }).run()
  }

  function inserirCampo(chave: ChaveDoCampo) {
    editor.chain().focus().insertContent({ type: 'campo', attrs: { chave } }).run()
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      className="flex flex-wrap items-center gap-(--e-05) border-b px-(--e-2) py-(--e-15)"
    >
      <label className="sr-only" htmlFor="estilo-do-paragrafo">
        Estilo do parágrafo
      </label>
      <select
        id="estilo-do-paragrafo"
        value={estado.estilo}
        onChange={(e) => {
          trocarEstilo(e.target.value as Estilo)
        }}
        className="h-(--controle-mini) rounded-(--raio) border border-(--campo-borda) bg-(--campo) px-(--e-15) corpo text-(--tinta)"
      >
        <option value="paragrafo">Texto</option>
        <option value="titulo1">Título 1</option>
        <option value="titulo2">Título 2</option>
        <option value="titulo3">Título 3</option>
      </select>
      <Separador />
      <BotaoDaBarra
        rotulo="Negrito"
        ativo={estado.negrito}
        aoClicar={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">N</span>
      </BotaoDaBarra>
      <BotaoDaBarra
        rotulo="Itálico"
        ativo={estado.italico}
        aoClicar={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </BotaoDaBarra>
      <BotaoDaBarra
        rotulo="Sublinhado"
        ativo={estado.sublinhado}
        aoClicar={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">S</span>
      </BotaoDaBarra>
      <Separador />
      <BotaoDaBarra
        rotulo="Lista com marcadores"
        ativo={estado.marcadores}
        aoClicar={() => editor.chain().focus().toggleBulletList().run()}
      >
        <Icone nome="list" />
      </BotaoDaBarra>
      <BotaoDaBarra
        rotulo="Lista numerada"
        ativo={estado.numerada}
        aoClicar={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </BotaoDaBarra>
      <Separador />
      {(
        [
          ['left', 'Alinhar à esquerda', 'Esq.'],
          ['center', 'Centralizar', 'Centro'],
          ['right', 'Alinhar à direita', 'Dir.'],
          ['justify', 'Justificar', 'Just.'],
        ] as const
      ).map(([valor, rotulo, curto]) => (
        <BotaoDaBarra
          key={valor}
          rotulo={rotulo}
          ativo={estado.alinhamento === valor}
          aoClicar={() => editor.chain().focus().setTextAlign(valor).run()}
        >
          {curto}
        </BotaoDaBarra>
      ))}
      <Separador />
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-(--controle-mini) cursor-pointer items-center gap-(--e-1) rounded-(--raio) px-(--e-15) corpo-medio text-(--tinta) transicao-estado hover:bg-(--toque)">
          Tabela
          <Icone nome="chevron-down" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            Inserir tabela
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!estado.naTabela}
            onSelect={() => editor.chain().focus().addRowAfter().run()}
          >
            Inserir linha abaixo
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!estado.naTabela}
            onSelect={() => editor.chain().focus().addColumnAfter().run()}
          >
            Inserir coluna à direita
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!estado.naTabela}
            onSelect={() => editor.chain().focus().deleteRow().run()}
          >
            Excluir linha
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!estado.naTabela}
            onSelect={() => editor.chain().focus().deleteColumn().run()}
          >
            Excluir coluna
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!estado.naTabela}
            onSelect={() => editor.chain().focus().deleteTable().run()}
            className="text-(--atraso-texto)"
          >
            Excluir tabela
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-(--controle-mini) cursor-pointer items-center gap-(--e-1) rounded-(--raio) border border-(--regra-forte) bg-(--folha) px-(--e-2) corpo-medio text-(--tinta) transicao-estado hover:bg-(--toque)">
          <Icone nome="plus" />
          Inserir campo
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
          {GRUPOS_DE_CAMPO.map((grupo, indice) => (
            <Fragment key={grupo}>
              {indice > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>{grupo}</DropdownMenuLabel>
              {CAMPOS_DO_MODELO.filter((c) => c.grupo === grupo).map((campo) => (
                <DropdownMenuItem
                  key={campo.chave}
                  onSelect={() => {
                    inserirCampo(campo.chave)
                  }}
                >
                  {campo.rotulo}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
