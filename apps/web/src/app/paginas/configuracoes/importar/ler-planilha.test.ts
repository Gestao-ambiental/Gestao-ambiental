// Leitura do arquivo da importação (ADR-0043) com o SheetJS de verdade: .xlsx e .csv, CPF
// descartado antes de sair do Worker, limites e formatos recusados.
import { CAMPOS_DA_IMPORTACAO } from '@gestao-ambiental/domain'
import { describe, expect, it } from 'vitest'
import { read, utils, write } from 'xlsx'

import { lerPlanilha } from './ler-planilha'
import { gerarModeloDaPlanilha, nomeDoModelo } from './modelo-da-planilha'

function xlsx(abas: Record<string, unknown[][]>): ArrayBuffer {
  const livro = utils.book_new()
  for (const [nome, linhas] of Object.entries(abas)) {
    utils.book_append_sheet(livro, utils.aoa_to_sheet(linhas), nome)
  }
  return write(livro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function bytes(valores: number[]): ArrayBuffer {
  return new Uint8Array(valores).buffer
}

const texto = (t: string) => new TextEncoder().encode(t).buffer

describe('modelo da planilha', () => {
  it('gera o .xlsx só com o cabeçalho da entidade, sem linha de exemplo', () => {
    for (const entidade of ['empreendimento', 'licenca'] as const) {
      const livro = read(gerarModeloDaPlanilha(entidade), { type: 'array' })
      const nome = livro.SheetNames[0] ?? ''
      const linhas = utils.sheet_to_json<string[]>(livro.Sheets[nome] ?? {}, { header: 1 })
      expect(linhas).toEqual([CAMPOS_DA_IMPORTACAO[entidade].map((c) => c.rotulo)])
    }
    expect(nomeDoModelo('licenca')).toBe('modelo-licencas.xlsx')
    expect(nomeDoModelo('empreendimento')).toBe('modelo-empreendimentos.xlsx')
  })
})

describe('leitura do .xlsx', () => {
  it('lê cada aba com cabeçalho, número da linha do Excel e texto formatado', async () => {
    const arquivo = xlsx({
      Carteira: [
        ['Relatório da carteira'],
        [],
        ['Empreendimento', 'Nº', 'Validade', ''],
        ['Metalúrgica', 4821, 46481],
        [],
        ['Têxtil Vale', '12/2020', '04/04/2027'],
      ],
      Vazia: [],
    })
    const resultado = await lerPlanilha(arquivo, 'Carteira.XLSX')
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resultado.abas.map((a) => a.nome)).toEqual(['Carteira'])
    const [aba] = resultado.abas
    // O título acima do cabeçalho fica de fora; a linha vazia no meio também.
    expect(aba?.tabela.cabecalhos).toEqual(['Empreendimento', 'Nº', 'Validade'])
    expect(aba?.tabela.linhas.map((l) => l.numeroLinha)).toEqual([4, 6])
    expect(aba?.tabela.linhas[0]?.celulas).toEqual([
      { valor: 'Metalúrgica', texto: 'Metalúrgica' },
      { valor: 4821, texto: '4821' },
      { valor: 46481, texto: '46481' },
    ])
  })

  it('descarta a coluna de CPF dentro da leitura: o CPF não chega à tabela', async () => {
    const arquivo = xlsx({
      Planilha1: [
        ['Empreendimento', 'CPF do sócio', 'Validade'],
        ['Metalúrgica', '529.982.247-25', 46481],
      ],
    })
    const resultado = await lerPlanilha(arquivo, 'carteira.xlsx')
    if (!resultado.ok) throw new Error(resultado.erro)
    const [aba] = resultado.abas
    expect(aba?.descartadas).toEqual(['CPF do sócio'])
    expect(aba?.tabela.cabecalhos).toEqual(['Empreendimento', 'Validade'])
    expect(JSON.stringify(resultado)).not.toContain('529')
    expect(aba?.tabela.linhas[0]?.celulas[1]).toEqual({ valor: 46481, texto: '46481' })
  })

  it('planilha de uma coluna: a primeira linha preenchida é o cabeçalho', async () => {
    const resultado = await lerPlanilha(
      xlsx({ A: [['Empreendimento'], ['Metalúrgica']] }),
      'a.xlsx',
    )
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resultado.abas[0]?.tabela).toEqual({
      cabecalhos: ['Empreendimento'],
      linhas: [{ numeroLinha: 2, celulas: [{ valor: 'Metalúrgica', texto: 'Metalúrgica' }] }],
    })
  })

  it('datas do sistema 1904 (Excel antigo do Mac) viram o número do sistema 1900', async () => {
    const livro = utils.book_new()
    const aba = utils.aoa_to_sheet([
      ['Empreendimento', 'Validade'],
      ['A', 45019],
    ])
    const celula = aba.B2 as { z?: string }
    celula.z = 'dd/mm/yyyy'
    utils.book_append_sheet(livro, aba, 'A')
    livro.Workbook = { WBProps: { date1904: true } }
    const arquivo = write(livro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const resultado = await lerPlanilha(arquivo, 'a.xlsx')
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resultado.abas[0]?.tabela.linhas[0]?.celulas[1]?.valor).toBe(45019 + 1462)
  })

  it('cabeçalho vazio ou repetido ganha nome único', async () => {
    const arquivo = xlsx({
      A: [
        ['Nome', '', 'Nome'],
        ['x', 'y', 'z'],
      ],
    })
    const resultado = await lerPlanilha(arquivo, 'a.xlsx')
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resultado.abas[0]?.tabela.cabecalhos).toEqual(['Nome', 'Coluna B', 'Nome (2)'])
  })

  it('recusa formato, arquivo grande, mais de 1.000 linhas e arquivo sem linhas', async () => {
    expect(await lerPlanilha(xlsx({ A: [['x'], ['y']] }), 'a.xls')).toEqual({
      ok: false,
      erro: 'formato_nao_aceito',
    })
    // .xlsx que não é zip (ex.: um .xls renomeado) não é lido.
    expect(await lerPlanilha(bytes([0xd0, 0xcf, 0x11, 0xe0]), 'a.xlsx')).toEqual({
      ok: false,
      erro: 'formato_nao_aceito',
    })
    expect(await lerPlanilha(new ArrayBuffer(5 * 1024 * 1024 + 1), 'a.csv')).toEqual({
      ok: false,
      erro: 'arquivo_grande',
    })
    const muitas = [
      ['Empreendimento'],
      ...Array.from({ length: 1001 }, (_, i) => [`E${String(i)}`]),
    ]
    expect(await lerPlanilha(xlsx({ A: muitas }), 'a.xlsx')).toEqual({
      ok: false,
      erro: 'linhas_demais',
    })
    expect(await lerPlanilha(xlsx({ A: [['Empreendimento']] }), 'a.xlsx')).toEqual({
      ok: false,
      erro: 'sem_linhas',
    })
    expect(await lerPlanilha(bytes([0x50, 0x4b, 0x00, 0x00]), 'a.xlsx')).toEqual({
      ok: false,
      erro: 'arquivo_ilegivel',
    })
  })
})

describe('leitura do .csv', () => {
  it('UTF-8 com ";" e valores como texto (sem virar número nem data)', async () => {
    const resultado = await lerPlanilha(
      texto('Empreendimento;CNPJ;Validade\nMetalúrgica;00123456000190;04/04/2027\n'),
      'carteira.csv',
    )
    if (!resultado.ok) throw new Error(resultado.erro)
    const [aba] = resultado.abas
    expect(aba?.tabela.cabecalhos).toEqual(['Empreendimento', 'CNPJ', 'Validade'])
    expect(aba?.tabela.linhas[0]?.celulas.map((c) => c.valor)).toEqual([
      'Metalúrgica',
      '00123456000190',
      '04/04/2027',
    ])
  })

  it('windows-1252 com ","', async () => {
    // "Órgão,Cliente\nIMA,José" em windows-1252.
    const latino = bytes([
      0xd3, 0x72, 0x67, 0xe3, 0x6f, 0x2c, 0x43, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x65, 0x0a, 0x49,
      0x4d, 0x41, 0x2c, 0x4a, 0x6f, 0x73, 0xe9,
    ])
    const resultado = await lerPlanilha(latino, 'a.csv')
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resultado.abas[0]?.tabela.cabecalhos).toEqual(['Órgão', 'Cliente'])
    expect(resultado.abas[0]?.tabela.linhas[0]?.celulas[1]?.texto).toBe('José')
  })

  it('texto HTML com nome .csv não é lido', async () => {
    expect(await lerPlanilha(texto('<table><tr><td>x</td></tr></table>'), 'a.csv')).toEqual({
      ok: false,
      erro: 'arquivo_ilegivel',
    })
  })
})
