// Editor de texto do modelo (ADR-0036): barra de formatação, inserir campo e a área de texto.
// A área de texto é uma folha de papel sóbria, no tamanho de uma página: é o que vira Word.
import {
  CAMPOS_DO_MODELO,
  GRUPOS_DE_CAMPO,
  type ChaveDoCampo,
  type NoDoDocumento,
} from '@gestao-ambiental/domain'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Fragment } from 'react'

import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { classeSelecao } from '@/components/ui/estilos-campo'
import type { NomeIcone } from '@/components/ui/icone'
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
    // Sem rolagem interna: a página rola e a barra fica presa no topo (sticky).
    <div className="flex min-w-0 flex-col rounded-(--raio-painel) border bg-(--chao)">
      {somenteLeitura ? null : <BarraDoEditor editor={editor} />}
      <div className="px-(--e-2) py-(--e-3) sm:px-(--e-6) sm:py-(--e-8)">
        {/* Folha A4 (794px a 96 dpi), margens largas como no Word. */}
        <div className="mx-auto w-full max-w-[794px] rounded-(--raio-mini) border border-(--regra) bg-(--folha) px-(--e-5) py-(--e-6) sm:px-[72px] sm:py-[64px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

/**
 * Botão de ícone da barra que liga e desliga: aria-pressed acompanha o "selecionado", e o
 * mousedown não tira o foco do texto (a seleção continua onde estava).
 */
function BotaoDaBarra({
  icone,
  rotulo,
  ativo,
  aoClicar,
}: {
  icone: NomeIcone
  rotulo: string
  ativo: boolean
  aoClicar: () => void
}) {
  return (
    <BotaoIcone
      icone={icone}
      rotulo={rotulo}
      selecionado={ativo}
      aria-pressed={ativo}
      className="max-md:shrink-0"
      onMouseDown={(e) => {
        e.preventDefault()
      }}
      onClick={aoClicar}
    />
  )
}

const ALINHAMENTOS = [
  { valor: 'left', rotulo: 'Alinhar à esquerda', icone: 'text-align-left' },
  { valor: 'center', rotulo: 'Centralizar', icone: 'text-align-center' },
  { valor: 'right', rotulo: 'Alinhar à direita', icone: 'text-align-right' },
  { valor: 'justify', rotulo: 'Justificar', icone: 'text-align-justify' },
] as const

function Separador() {
  return <span aria-hidden className="mx-(--e-1) h-5 w-px shrink-0 bg-(--regra)" />
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
      // No celular, uma linha só que rola de lado, com "Inserir campo" primeiro.
      className="sticky top-0 z-10 flex flex-wrap items-center gap-(--e-05) rounded-t-(--raio-painel) border-b bg-(--folha) px-(--e-2) py-(--e-15) max-md:flex-nowrap max-md:overflow-x-auto"
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
        className={cn(classeSelecao, 'w-[124px] max-md:shrink-0')}
      >
        <option value="paragrafo">Texto</option>
        <option value="titulo1">Título 1</option>
        <option value="titulo2">Título 2</option>
        <option value="titulo3">Título 3</option>
      </select>
      <Separador />
      <BotaoDaBarra
        icone="text-b"
        rotulo="Negrito"
        ativo={estado.negrito}
        aoClicar={() => editor.chain().focus().toggleBold().run()}
      />
      <BotaoDaBarra
        icone="text-italic"
        rotulo="Itálico"
        ativo={estado.italico}
        aoClicar={() => editor.chain().focus().toggleItalic().run()}
      />
      <BotaoDaBarra
        icone="text-underline"
        rotulo="Sublinhado"
        ativo={estado.sublinhado}
        aoClicar={() => editor.chain().focus().toggleUnderline().run()}
      />
      <Separador />
      <BotaoDaBarra
        icone="list-bullets"
        rotulo="Lista com marcadores"
        ativo={estado.marcadores}
        aoClicar={() => editor.chain().focus().toggleBulletList().run()}
      />
      <BotaoDaBarra
        icone="list-numbers"
        rotulo="Lista numerada"
        ativo={estado.numerada}
        aoClicar={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Separador />
      {ALINHAMENTOS.map(({ valor, rotulo, icone }) => (
        <BotaoDaBarra
          key={valor}
          icone={icone}
          rotulo={rotulo}
          ativo={estado.alinhamento === valor}
          aoClicar={() => editor.chain().focus().setTextAlign(valor).run()}
        />
      ))}
      <Separador />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BotaoIcone
            icone="table"
            rotulo="Tabela"
            selecionado={estado.naTabela}
            className="max-md:shrink-0"
          />
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
      <span className="flex-1 max-md:hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Botao iconeAntes="plus" className="max-md:order-first max-md:mr-(--e-1) max-md:shrink-0">
            Inserir campo
          </Botao>
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
