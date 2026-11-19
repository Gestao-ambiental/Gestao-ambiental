// Conversão do documento do editor para .docx (ADR-0036, fatia 2): o arquivo abre como zip do Word
// e leva títulos, negrito, listas (numerada recomeçando) e tabela.
import type { NoDoDocumento } from '@gestao-ambiental/domain'
import { Packer } from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { documentoWord } from './docx-do-modelo'

async function xmlDoDocumento(doc: NoDoDocumento): Promise<string> {
  const zip = unzipSync(new Uint8Array(await Packer.toArrayBuffer(documentoWord(doc))))
  const xml = zip['word/document.xml']
  if (!xml) throw new Error('sem word/document.xml')
  return strFromU8(xml)
}

const lista = (tipo: 'bulletList' | 'orderedList', itens: string[]): NoDoDocumento => ({
  type: tipo,
  content: itens.map((texto) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }],
  })),
})

describe('documentoWord', () => {
  it('converte título, texto com marcas, alinhamento, listas e tabela', async () => {
    const xml = await xmlDoDocumento({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Relatório de efluentes' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Licença ' },
            { type: 'text', text: 'LAO 4821/2023', marks: [{ type: 'bold' }] },
          ],
        },
        lista('bulletList', ['Coleta']),
        lista('orderedList', ['Primeiro', 'Segundo']),
        lista('orderedList', ['De novo']),
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parâmetro' }] }],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valor' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DBO' }] }],
                },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })
    expect(xml).toContain('Relatório de efluentes')
    expect(xml).toContain('w:val="Heading1"')
    expect(xml).toContain('w:val="center"')
    expect(xml).toMatch(/<w:b\/>.*LAO 4821\/2023/s)
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('DBO')
    // Duas listas numeradas: cada uma com o próprio numId, para recomeçar do 1.
    const numeros = new Set([...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]))
    expect(numeros.size).toBeGreaterThanOrEqual(3)
  })

  it('documento vazio gera um parágrafo em branco', async () => {
    const xml = await xmlDoDocumento({ type: 'doc', content: [] })
    expect(xml).toContain('<w:body>')
    expect(xml).toContain('<w:p>')
  })
})
