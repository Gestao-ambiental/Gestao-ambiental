import { describe, expect, it } from 'vitest'

import { chavesCitadas, chavesDaCitacao } from './base-legal'

describe('base legal citada na condicionante', () => {
  it('IN sem órgão é do IMA, e com ano também acha a do catálogo sem ano', () => {
    expect(chavesDaCitacao({ tipo: 'instrucao_normativa', numero: '2' })).toEqual([
      'sc;ima;instrucao_normativa;2',
    ])
    expect(chavesDaCitacao({ tipo: 'instrucao_normativa', numero: '2', ano: 2020 })).toEqual([
      'sc;ima;instrucao_normativa;2;2020',
      'sc;ima;instrucao_normativa;2',
    ])
  })

  it('CONAMA e IBAMA são federais; CONSEMA é estadual', () => {
    expect(
      chavesDaCitacao({ tipo: 'resolucao', numero: '237', ano: 1997, orgao: 'CONAMA' }),
    ).toEqual(['br;conama;resolucao;237;1997'])
    expect(
      chavesDaCitacao({ tipo: 'resolucao', numero: '250', ano: 2024, orgao: 'CONSEMA' }),
    ).toEqual(['sc;consema;resolucao;250;2024'])
  })

  it('lei e decreto sem esfera geram as duas candidatas', () => {
    expect(chavesDaCitacao({ tipo: 'lei', numero: '14675', ano: 2009 })).toEqual([
      'br;federal;lei;14675;2009',
      'sc;alesc;lei;14675;2009',
    ])
    expect(chavesDaCitacao({ tipo: 'decreto', numero: '421', ano: 2023 })).toEqual([
      'br;federal;decreto;421;2023',
      'sc;executivo;decreto;421;2023',
    ])
  })

  it('lê as citações do texto sem repetir', () => {
    const texto =
      'Atender à IN 02 do IMA e à Resolução CONSEMA nº 250/2024; conforme a Lei nº 9.605, de 12 de fevereiro de 1998, e de novo a IN 02.'
    expect(chavesCitadas(texto)).toEqual([
      'sc;ima;instrucao_normativa;2',
      'sc;consema;resolucao;250;2024',
      'br;federal;lei;9605;1998',
      'sc;alesc;lei;9605;1998',
    ])
    expect(chavesCitadas('Sem citação.')).toEqual([])
  })
})
