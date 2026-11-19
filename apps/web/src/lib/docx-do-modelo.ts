// Converte o documento do editor (já preenchido) num .docx (ADR-0036, fatia 2). Roda no navegador,
// sem rede: a biblioteca docx monta o arquivo e o Packer devolve o Blob. Carregado sob demanda (a
// biblioteca é grande), só quando a pessoa pede o relatório.
import type { MarcaDoTexto, NoDoDocumento } from '@gestao-ambiental/domain'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

type Bloco = Paragraph | Table

const ALINHAMENTOS = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const

const TITULOS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const

const LISTA_NUMERADA = 'lista-numerada'
const NIVEIS_DE_LISTA = 6

interface Contexto {
  /** Cada lista numerada recomeça do 1: uma instância por lista. */
  proximaInstancia: number
}

interface Lista {
  tipo: 'marcadores' | 'numerada'
  nivel: number
  instancia: number
}

function alinhamento(no: NoDoDocumento) {
  const valor = no.attrs?.textAlign
  return typeof valor === 'string' && valor in ALINHAMENTOS
    ? ALINHAMENTOS[valor as keyof typeof ALINHAMENTOS]
    : undefined
}

function temMarca(marcas: MarcaDoTexto[] | undefined, tipo: string): boolean {
  return marcas?.some((m) => m.type === tipo) ?? false
}

function trechos(nos: NoDoDocumento[] | undefined): TextRun[] {
  const resultado: TextRun[] = []
  for (const no of nos ?? []) {
    if (no.type === 'hardBreak') {
      resultado.push(new TextRun({ text: '', break: 1 }))
      continue
    }
    if (no.type !== 'text' || !no.text) continue
    resultado.push(
      new TextRun({
        text: no.text,
        bold: temMarca(no.marks, 'bold') || undefined,
        italics: temMarca(no.marks, 'italic') || undefined,
        underline: temMarca(no.marks, 'underline') ? {} : undefined,
        strike: temMarca(no.marks, 'strike') || undefined,
      }),
    )
  }
  return resultado
}

function paragrafo(no: NoDoDocumento, lista: Lista | null, recuo: number): Paragraph {
  const nivel = no.attrs?.level
  const titulo = no.type === 'heading' && (nivel === 1 || nivel === 2 || nivel === 3)
  return new Paragraph({
    children: trechos(no.content),
    heading: titulo ? TITULOS[nivel] : undefined,
    alignment: alinhamento(no),
    bullet: lista?.tipo === 'marcadores' ? { level: lista.nivel } : undefined,
    numbering:
      lista?.tipo === 'numerada'
        ? { reference: LISTA_NUMERADA, level: lista.nivel, instance: lista.instancia }
        : undefined,
    indent: recuo > 0 ? { left: recuo } : undefined,
  })
}

function itensDaLista(
  no: NoDoDocumento,
  tipo: Lista['tipo'],
  nivel: number,
  ctx: Contexto,
): Bloco[] {
  const instancia = tipo === 'numerada' ? ctx.proximaInstancia++ : 0
  const lista: Lista = { tipo, nivel: Math.min(nivel, NIVEIS_DE_LISTA - 1), instancia }
  const resultado: Bloco[] = []
  for (const item of no.content ?? []) {
    let primeiro = true
    for (const filho of item.content ?? []) {
      if (filho.type === 'bulletList' || filho.type === 'orderedList') {
        resultado.push(...blocos([filho], ctx, nivel + 1, 0))
      } else if (filho.type === 'paragraph' || filho.type === 'heading') {
        // Só o primeiro parágrafo do item leva o marcador; os seguintes ficam alinhados ao texto.
        resultado.push(paragrafo(filho, primeiro ? lista : null, primeiro ? 0 : 720 * (nivel + 1)))
        primeiro = false
      } else {
        resultado.push(...blocos([filho], ctx, nivel + 1, 720 * (nivel + 1)))
      }
    }
  }
  return resultado
}

function tabela(no: NoDoDocumento, ctx: Contexto): Table | null {
  const linhas = (no.content ?? []).filter((l) => l.type === 'tableRow')
  if (linhas.length === 0) return null
  const borda = { style: BorderStyle.SINGLE, size: 4, color: '808080' }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: borda,
      bottom: borda,
      left: borda,
      right: borda,
      insideHorizontal: borda,
      insideVertical: borda,
    },
    rows: linhas.map(
      (linha) =>
        new TableRow({
          children: (linha.content ?? []).map((celula) => {
            const conteudo = blocos(celula.content ?? [], ctx, 0, 0)
            const colspan = Number(celula.attrs?.colspan ?? 1)
            const rowspan = Number(celula.attrs?.rowspan ?? 1)
            return new TableCell({
              children: conteudo.length > 0 ? conteudo : [new Paragraph('')],
              columnSpan: colspan > 1 ? colspan : undefined,
              rowSpan: rowspan > 1 ? rowspan : undefined,
            })
          }),
          tableHeader: (linha.content ?? []).every((c) => c.type === 'tableHeader') || undefined,
        }),
    ),
  })
}

function blocos(nos: NoDoDocumento[], ctx: Contexto, nivelDeLista: number, recuo: number): Bloco[] {
  const resultado: Bloco[] = []
  for (const no of nos) {
    switch (no.type) {
      case 'paragraph':
      case 'heading':
        resultado.push(paragrafo(no, null, recuo))
        break
      case 'bulletList':
        resultado.push(...itensDaLista(no, 'marcadores', nivelDeLista, ctx))
        break
      case 'orderedList':
        resultado.push(...itensDaLista(no, 'numerada', nivelDeLista, ctx))
        break
      case 'blockquote':
        resultado.push(...blocos(no.content ?? [], ctx, nivelDeLista, recuo + 720))
        break
      case 'horizontalRule':
        resultado.push(
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 1 } },
          }),
        )
        break
      case 'table': {
        const t = tabela(no, ctx)
        if (t) resultado.push(t, new Paragraph(''))
        break
      }
      default:
        if (no.content) resultado.push(...blocos(no.content, ctx, nivelDeLista, recuo))
    }
  }
  return resultado
}

/** Monta o documento Word a partir do documento do editor (já com os campos preenchidos). */
export function documentoWord(documento: NoDoDocumento): Document {
  const filhos = blocos(documento.content ?? [], { proximaInstancia: 1 }, 0, 0)
  return new Document({
    creator: 'Grama',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    numbering: {
      config: [
        {
          reference: LISTA_NUMERADA,
          levels: Array.from({ length: NIVEIS_DE_LISTA }, (_, nivel) => ({
            level: nivel,
            format: LevelFormat.DECIMAL,
            text: `%${String(nivel + 1)}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (nivel + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: filhos.length > 0 ? filhos : [new Paragraph('')] }],
  })
}

export function gerarDocx(documento: NoDoDocumento): Promise<Blob> {
  return Packer.toBlob(documentoWord(documento))
}

/** Baixa o arquivo pelo navegador (link temporário). */
export function baixarArquivo(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
