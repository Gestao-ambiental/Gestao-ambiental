// Relatórios .docx das normas (ADR-0050, LEG-10): matriz legal do empreendimento e mudanças que o
// alcançaram. Roda no navegador, sem rede; carregado sob demanda (a biblioteca docx é grande).
import { formatarDataCivil, type DataCivil, type LinhaDaMatriz } from '@gestao-ambiental/domain'
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

import type { MudancaDoEmpreendimento } from '@/lib/api/relatorio-de-normas'

export { baixarArquivo } from '@/lib/docx-do-modelo'

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const

function celula(texto: string, cabecalho = false): TableCell {
  return new TableCell({
    borders: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA },
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: cabecalho })] })],
  })
}

function tabela(cabecalho: string[], linhas: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: cabecalho.map((t) => celula(t, true)) }),
      ...linhas.map((l) => new TableRow({ children: l.map((t) => celula(t)) })),
    ],
  })
}

function cabecalhoDoRelatorio(titulo: string, empreendimento: string, linha: string): Paragraph[] {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(titulo)] }),
    new Paragraph({ children: [new TextRun({ text: empreendimento, bold: true })] }),
    new Paragraph({ children: [new TextRun(linha)] }),
  ]
}

export function gerarMatrizLegal(
  empreendimento: string,
  linhas: readonly LinhaDaMatriz[],
  hoje: DataCivil,
): Promise<Blob> {
  const documento = new Document({
    sections: [
      {
        children: [
          ...cabecalhoDoRelatorio(
            'Matriz legal',
            empreendimento,
            `Situação em ${formatarDataCivil(hoje)}`,
          ),
          tabela(
            ['Norma', 'Situação', 'Avaliação', 'Ação', 'Evidências'],
            linhas.map((l) => [l.norma, l.rotuloDaSituacao, l.avaliacao, l.acao, l.evidencia]),
          ),
        ],
      },
    ],
  })
  return Packer.toBlob(documento)
}

const TIPO: Record<string, string> = {
  nova: 'Nova',
  alterada: 'Alterada',
  revogada: 'Revogada',
  republicada: 'Republicada',
}

export function gerarMudancasDoEmpreendimento(
  empreendimento: string,
  mudancas: readonly MudancaDoEmpreendimento[],
  desde: DataCivil,
  hoje: DataCivil,
): Promise<Blob> {
  const blocos: (Paragraph | Table)[] = [
    ...cabecalhoDoRelatorio(
      'Mudanças na legislação',
      empreendimento,
      `De ${formatarDataCivil(desde)} a ${formatarDataCivil(hoje)}`,
    ),
  ]
  if (mudancas.length === 0) {
    blocos.push(new Paragraph('Nenhuma mudança no período.'))
  }
  for (const m of mudancas) {
    const publicada = formatarDataCivil(m.publicadaEm.slice(0, 10) as DataCivil)
    blocos.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`${m.normaTitulo} · ${TIPO[m.tipo] ?? m.tipo}`)],
      }),
      new Paragraph({
        children: [
          new TextRun(
            [
              `Publicada em ${publicada}`,
              m.licencas.length > 0 ? `Licenças: ${m.licencas.join(', ')}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ],
      }),
    )
    if (m.resumo) blocos.push(new Paragraph(m.resumo))
    for (const item of m.oQueMuda) blocos.push(new Paragraph({ text: item, bullet: { level: 0 } }))
    if (m.urlOficial) blocos.push(new Paragraph(`Fonte oficial: ${m.urlOficial}`))
  }
  return Packer.toBlob(new Document({ sections: [{ children: blocos }] }))
}
