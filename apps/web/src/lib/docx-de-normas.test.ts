import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { gerarMatrizLegal, gerarMudancasDoEmpreendimento } from './docx-de-normas'

async function textoDoDocx(blob: Blob): Promise<string> {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const xml = zip['word/document.xml']
  return xml ? strFromU8(xml) : ''
}

describe('relatórios .docx das normas (LEG-10)', () => {
  it('matriz legal com o cabeçalho e uma linha por requisito', async () => {
    const blob = await gerarMatrizLegal(
      'Posto Litoral',
      [
        {
          norma: 'IN 2 · Combustíveis',
          situacao: 'conforme',
          rotuloDaSituacao: 'Conforme',
          avaliacao: '10/11/2026 · Ana Ribeiro',
          acao: '',
          evidencia: '1',
        },
      ],
      '2026-11-20',
    )
    const xml = await textoDoDocx(blob)
    expect(xml).toContain('Matriz legal')
    expect(xml).toContain('Posto Litoral')
    expect(xml).toContain('Situação em 20/11/2026')
    expect(xml).toContain('IN 2 · Combustíveis')
  })

  it('mudanças do período com o resumo, ou a frase de vazio', async () => {
    const blob = await gerarMudancasDoEmpreendimento(
      'Posto Litoral',
      [
        {
          mudancaId: 'm1',
          normaId: 'n1',
          normaTitulo: 'IN 2 · Combustíveis',
          tipo: 'alterada',
          publicadaEm: '2026-11-19T13:00:00Z',
          resumo: 'Renovação com 180 dias.',
          oQueMuda: ['Prazo maior'],
          urlOficial: 'https://in.ima.sc.gov.br/x',
          licencas: ['LAO 100/2024'],
        },
      ],
      '2026-10-21',
      '2026-11-20',
    )
    const xml = await textoDoDocx(blob)
    expect(xml).toContain('IN 2 · Combustíveis · Alterada')
    expect(xml).toContain('Renovação com 180 dias.')
    expect(xml).toContain('Licenças: LAO 100/2024')

    const vazio = await textoDoDocx(
      await gerarMudancasDoEmpreendimento('Posto Litoral', [], '2026-10-21', '2026-11-20'),
    )
    expect(vazio).toContain('Nenhuma mudança no período.')
  })
})
