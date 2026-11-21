import { describe, expect, it } from 'vitest'

import { compararVersoes, dividirEmDispositivos } from './diferenca-de-norma'

const VERSAO_1 = `INSTRUÇÃO NORMATIVA Nº 2
Dispõe sobre o licenciamento.
Art. 1º Esta Instrução Normativa
estabelece   os critérios.
Art. 6º O requerimento deve conter:
§ 1º O prazo é de 30 dias.
§ 2º São documentos obrigatórios:
I - requerimento assinado;
II – certidão da prefeitura:
a) original;
b) cópia autenticada.
Parágrafo único. Vale para todas as atividades.
Art. 10. Esta Instrução entra em vigor na data de sua publicação.`

describe('dividirEmDispositivos', () => {
  it('separa artigos, parágrafos, incisos e alíneas com caminho e rótulo', () => {
    const dispositivos = dividirEmDispositivos(VERSAO_1)
    expect(dispositivos.map((d) => [d.caminho, d.rotulo])).toEqual([
      ['art1', 'Art. 1º'],
      ['art6', 'Art. 6º'],
      ['art6.par1', 'Art. 6º, § 1º'],
      ['art6.par2', 'Art. 6º, § 2º'],
      ['art6.par2.incI', 'Art. 6º, § 2º, inciso I'],
      ['art6.par2.incII', 'Art. 6º, § 2º, inciso II'],
      ['art6.par2.incII.alia', 'Art. 6º, § 2º, inciso II, alínea a'],
      ['art6.par2.incII.alib', 'Art. 6º, § 2º, inciso II, alínea b'],
      ['art6.parUnico', 'Art. 6º, Parágrafo único'],
      ['art10', 'Art. 10'],
    ])
  })

  it('normaliza os espaços e junta as linhas do mesmo dispositivo', () => {
    const [art1, , , , incI] = dividirEmDispositivos(VERSAO_1)
    expect(art1?.texto).toBe('Esta Instrução Normativa estabelece os critérios.')
    expect(incI?.texto).toBe('requerimento assinado;')
  })

  it('deixa de fora o que vem antes do primeiro artigo', () => {
    expect(dividirEmDispositivos('Ementa.\nI - solto\nArt. 1º Texto.')).toEqual([
      { caminho: 'art1', rotulo: 'Art. 1º', texto: 'Texto.' },
    ])
  })

  it('reconhece artigo com letra e inciso direto no artigo', () => {
    const dispositivos = dividirEmDispositivos(
      'Art. 6º-A Fica criado o cadastro:\nI - de atividades;\nArt. 7º - A empresa deve informar.',
    )
    expect(dispositivos).toEqual([
      { caminho: 'art6A', rotulo: 'Art. 6º-A', texto: 'Fica criado o cadastro:' },
      { caminho: 'art6A.incI', rotulo: 'Art. 6º-A, inciso I', texto: 'de atividades;' },
      { caminho: 'art7', rotulo: 'Art. 7º', texto: 'A empresa deve informar.' },
    ])
  })

  it('separa dispositivos no meio da linha, depois de fim de frase', () => {
    const dispositivos = dividirEmDispositivos(
      'Art. 1º Objeto. Art. 2º São requisitos: I - um; II - dois. § 1º Prazo.',
    )
    expect(dispositivos.map((d) => d.caminho)).toEqual([
      'art1',
      'art2',
      'art2.incI',
      'art2.incII',
      'art2.par1',
    ])
  })

  it('caminho repetido ganha sufixo', () => {
    const dispositivos = dividirEmDispositivos('Art. 1º A.\nArt. 2º B.\nArt. 1º C.')
    expect(dispositivos.map((d) => d.caminho)).toEqual(['art1', 'art2', 'art1#2'])
  })

  it('texto vazio não tem dispositivos', () => {
    expect(dividirEmDispositivos('')).toEqual([])
  })
})

describe('compararVersoes', () => {
  it('versões iguais, mudando só espaços e quebras, não têm diferença', () => {
    const resultado = compararVersoes(VERSAO_1, VERSAO_1.replace(/\n/g, '\n\n  '))
    expect(resultado).toEqual({
      estruturada: true,
      incluidos: [],
      revogados: [],
      alterados: [],
      iguais: 10,
    })
  })

  it('aponta incluídos, alterados e revogados (sumiu ou passou a dizer Revogado)', () => {
    const nova = VERSAO_1.replace('O prazo é de 30 dias.', 'O prazo é de 60 dias.')
      .replace('I - requerimento assinado;', 'I - (Revogado)')
      .replace(
        'Parágrafo único. Vale para todas as atividades.\n',
        'Art. 7º Fica criado o cadastro.\n',
      )
    const resultado = compararVersoes(VERSAO_1, nova)
    expect(resultado).toEqual({
      estruturada: true,
      incluidos: [{ caminho: 'art7', rotulo: 'Art. 7º', texto: 'Fica criado o cadastro.' }],
      revogados: [
        {
          caminho: 'art6.par2.incI',
          rotulo: 'Art. 6º, § 2º, inciso I',
          texto: 'requerimento assinado;',
        },
        {
          caminho: 'art6.parUnico',
          rotulo: 'Art. 6º, Parágrafo único',
          texto: 'Vale para todas as atividades.',
        },
      ],
      alterados: [
        {
          caminho: 'art6.par1',
          rotulo: 'Art. 6º, § 1º',
          antes: 'O prazo é de 30 dias.',
          depois: 'O prazo é de 60 dias.',
        },
      ],
      iguais: 7,
    })
  })

  it('dispositivo já revogado nas duas versões conta como igual', () => {
    const anterior = 'Art. 1º (Revogado).\nArt. 2º Texto.'
    const nova = 'Art. 1º (Revogado pela Lei nº 1/2020).\nArt. 2º Texto.\nArt. 3º (Revogado)'
    expect(compararVersoes(anterior, nova)).toEqual({
      estruturada: true,
      incluidos: [],
      revogados: [],
      alterados: [],
      iguais: 2,
    })
  })

  it('sem 2 artigos dos dois lados, só diz se o texto mudou', () => {
    expect(compararVersoes('Aviso de  consulta\npública.', 'Aviso de consulta pública.')).toEqual({
      estruturada: false,
      mudou: false,
    })
    expect(compararVersoes('Aviso de consulta.', 'Aviso de audiência.')).toEqual({
      estruturada: false,
      mudou: true,
    })
    expect(compararVersoes('Art. 1º Único artigo.', VERSAO_1)).toEqual({
      estruturada: false,
      mudou: true,
    })
  })
})
