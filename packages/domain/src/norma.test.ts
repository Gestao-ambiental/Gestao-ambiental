import { describe, expect, it } from 'vitest'

import {
  TIPOS_DE_NORMA,
  chaveDaNorma,
  lerIdentificadorDeNorma,
  lerTodosOsIdentificadores,
  normalizarNumeroDaNorma,
  tituloCurtoDaNorma,
} from './norma'

describe('lerIdentificadorDeNorma', () => {
  it('reconhece as instruções normativas do IMA, com e sem órgão', () => {
    expect(lerIdentificadorDeNorma('IN 02')).toEqual({ tipo: 'instrucao_normativa', numero: '2' })
    expect(lerIdentificadorDeNorma('IN IMA nº 2')).toEqual({
      tipo: 'instrucao_normativa',
      numero: '2',
      orgao: 'IMA',
    })
    expect(lerIdentificadorDeNorma('Instrução Normativa nº 07')).toEqual({
      tipo: 'instrucao_normativa',
      numero: '7',
    })
    expect(lerIdentificadorDeNorma('Instrucao Normativa n° 84')).toEqual({
      tipo: 'instrucao_normativa',
      numero: '84',
    })
  })

  it('reconhece resoluções do CONSEMA e do CONAMA, com ano por barra ou por extenso', () => {
    expect(lerIdentificadorDeNorma('Resolução CONSEMA nº 250/2024')).toEqual({
      tipo: 'resolucao',
      numero: '250',
      ano: 2024,
      orgao: 'CONSEMA',
    })
    expect(lerIdentificadorDeNorma('Res. CONSEMA 251/2024')).toEqual({
      tipo: 'resolucao',
      numero: '251',
      ano: 2024,
      orgao: 'CONSEMA',
    })
    expect(lerIdentificadorDeNorma('Resolução CONAMA nº 237, de 19 de dezembro de 1997')).toEqual({
      tipo: 'resolucao',
      numero: '237',
      ano: 1997,
      orgao: 'CONAMA',
    })
    expect(lerIdentificadorDeNorma('Anexo VI da Resolução CONSEMA nº 250, de 2024')).toEqual({
      tipo: 'resolucao',
      numero: '250',
      ano: 2024,
      orgao: 'CONSEMA',
    })
  })

  it('reconhece leis, leis complementares e decretos, tirando o ponto de milhar', () => {
    expect(lerIdentificadorDeNorma('Lei 14.675/2009')).toEqual({
      tipo: 'lei',
      numero: '14675',
      ano: 2009,
    })
    expect(lerIdentificadorDeNorma('Lei nº 9.605, de 12 de fevereiro de 1998')).toEqual({
      tipo: 'lei',
      numero: '9605',
      ano: 1998,
    })
    expect(lerIdentificadorDeNorma('Lei Complementar 140/2011')).toEqual({
      tipo: 'lei_complementar',
      numero: '140',
      ano: 2011,
    })
    expect(lerIdentificadorDeNorma('Decreto 6.514/2008')).toEqual({
      tipo: 'decreto',
      numero: '6514',
      ano: 2008,
    })
    expect(lerIdentificadorDeNorma('Lei Federal nº 12.651, de 25 de maio de 2012')).toEqual({
      tipo: 'lei',
      numero: '12651',
      ano: 2012,
    })
  })

  it('reconhece portarias com órgão e número com zeros à esquerda', () => {
    expect(lerIdentificadorDeNorma('Portaria IMA 096/2026')).toEqual({
      tipo: 'portaria',
      numero: '96',
      ano: 2026,
      orgao: 'IMA',
    })
    expect(lerIdentificadorDeNorma('Instrução Normativa SAMA nº 2/2026')).toEqual({
      tipo: 'instrucao_normativa',
      numero: '2',
      ano: 2026,
      orgao: 'SAMA',
    })
  })

  it('devolve null quando não reconhece', () => {
    expect(lerIdentificadorDeNorma('')).toBeNull()
    expect(lerIdentificadorDeNorma('Licença ambiental de operação vigente')).toBeNull()
    expect(lerIdentificadorDeNorma('Lei de crimes ambientais')).toBeNull()
    // "in" minúsculo não é instrução normativa
    expect(lerIdentificadorDeNorma('published in 2024')).toBeNull()
    expect(lerIdentificadorDeNorma('Inclui 3 itens')).toBeNull()
  })
})

describe('lerTodosOsIdentificadores', () => {
  it('devolve todas as normas citadas, na ordem, sem repetir', () => {
    const texto =
      'Considerando a Lei nº 9.605, de 12 de fevereiro de 1998, a Resolução CONAMA nº 237/1997 ' +
      'e a Lei 9.605/1998; atende à IN 02 e à Instrução Normativa nº 2.'
    expect(lerTodosOsIdentificadores(texto)).toEqual([
      { tipo: 'lei', numero: '9605', ano: 1998 },
      { tipo: 'resolucao', numero: '237', ano: 1997, orgao: 'CONAMA' },
      { tipo: 'instrucao_normativa', numero: '2' },
    ])
  })

  it('junta a citação sem ano com a que traz o ano', () => {
    expect(
      lerTodosOsIdentificadores('Resolução CONSEMA nº 250 ... Resolução CONSEMA nº 250/2024'),
    ).toEqual([{ tipo: 'resolucao', numero: '250', ano: 2024, orgao: 'CONSEMA' }])
  })

  it('mantém separadas normas de anos diferentes', () => {
    expect(lerTodosOsIdentificadores('Lei 1/2000 e Lei 1/2001')).toHaveLength(2)
  })

  it('sem norma, lista vazia', () => {
    expect(lerTodosOsIdentificadores('Nada a citar.')).toEqual([])
  })
})

describe('normalizarNumeroDaNorma', () => {
  it('tira pontos e zeros à esquerda, mas não zera o número', () => {
    expect(normalizarNumeroDaNorma('096')).toBe('96')
    expect(normalizarNumeroDaNorma('14.675')).toBe('14675')
    expect(normalizarNumeroDaNorma('0')).toBe('0')
  })
})

describe('chaveDaNorma', () => {
  const FORMATO = /^[a-z0-9]+(;[a-z0-9_.]+)+$/

  it('estadual: uf;órgão;tipo;número[;ano]', () => {
    const chave = chaveDaNorma({
      esfera: 'estadual',
      orgao: 'IMA',
      tipo: 'instrucao_normativa',
      numero: '02',
    })
    expect(chave).toBe('sc;ima;instrucao_normativa;2')
    expect(chave).toMatch(FORMATO)
    expect(
      chaveDaNorma({
        esfera: 'estadual',
        uf: 'SC',
        orgao: 'CONSEMA',
        tipo: 'resolucao',
        numero: '250',
        ano: 2024,
      }),
    ).toBe('sc;consema;resolucao;250;2024')
  })

  it('federal: br;órgão;tipo;número[;ano]', () => {
    const chave = chaveDaNorma({
      esfera: 'federal',
      orgao: 'federal',
      tipo: 'lei',
      numero: '9.605',
      ano: 1998,
    })
    expect(chave).toBe('br;federal;lei;9605;1998')
    expect(chave).toMatch(FORMATO)
  })

  it('municipal: uf;ibge;órgão;tipo;número[;ano]', () => {
    const chave = chaveDaNorma({
      esfera: 'municipal',
      municipioIbge: '4209102',
      orgao: 'SAMA',
      tipo: 'instrucao_normativa',
      numero: '2',
      ano: 2026,
    })
    expect(chave).toBe('sc;4209102;sama;instrucao_normativa;2;2026')
    expect(chave).toMatch(FORMATO)
  })

  it('tira acentos e símbolos do órgão', () => {
    expect(
      chaveDaNorma({ esfera: 'estadual', orgao: 'Secretaria Ágil', tipo: 'portaria', numero: '1' }),
    ).toBe('sc;secretariaagil;portaria;1')
  })

  it('recusa municipal sem IBGE e chave sem órgão ou número', () => {
    expect(() =>
      chaveDaNorma({ esfera: 'municipal', orgao: 'SAMA', tipo: 'lei', numero: '1' }),
    ).toThrow(/IBGE/)
    expect(() =>
      chaveDaNorma({
        esfera: 'municipal',
        municipioIbge: '42091',
        orgao: 'SAMA',
        tipo: 'lei',
        numero: '1',
      }),
    ).toThrow(/IBGE/)
    expect(() => chaveDaNorma({ esfera: 'federal', orgao: '', tipo: 'lei', numero: '1' })).toThrow()
    expect(() =>
      chaveDaNorma({ esfera: 'federal', orgao: 'federal', tipo: 'lei', numero: '//' }),
    ).toThrow()
  })

  it('todos os tipos do banco cabem no formato da chave', () => {
    for (const tipo of TIPOS_DE_NORMA) {
      expect(chaveDaNorma({ esfera: 'estadual', orgao: 'IMA', tipo, numero: '1' })).toMatch(FORMATO)
    }
  })
})

describe('tituloCurtoDaNorma', () => {
  it('monta o título como a norma é citada', () => {
    expect(tituloCurtoDaNorma({ tipo: 'instrucao_normativa', numero: '2' })).toBe('IN 2')
    expect(
      tituloCurtoDaNorma({ tipo: 'resolucao', numero: '250', ano: 2024, orgao: 'CONSEMA' }),
    ).toBe('Resolução CONSEMA 250/2024')
    expect(tituloCurtoDaNorma({ tipo: 'portaria', numero: '96', ano: 2026, orgao: 'IMA' })).toBe(
      'Portaria IMA 96/2026',
    )
  })

  it('leis e decretos com 4 ou mais dígitos ganham ponto de milhar', () => {
    expect(tituloCurtoDaNorma({ tipo: 'lei', numero: '14675', ano: 2009 })).toBe('Lei 14.675/2009')
    expect(tituloCurtoDaNorma({ tipo: 'decreto', numero: '6514', ano: 2008 })).toBe(
      'Decreto 6.514/2008',
    )
    expect(tituloCurtoDaNorma({ tipo: 'lei_complementar', numero: '140', ano: 2011 })).toBe(
      'Lei Complementar 140/2011',
    )
    expect(tituloCurtoDaNorma({ tipo: 'resolucao', numero: '1000' })).toBe('Resolução 1000')
  })

  it('volta ao título a partir do texto lido', () => {
    const id = lerIdentificadorDeNorma('Lei nº 9.605, de 12 de fevereiro de 1998')
    expect(id && tituloCurtoDaNorma(id)).toBe('Lei 9.605/1998')
  })
})
