import { describe, expect, it } from 'vitest'

import { PROFISSOES } from './profissao-e-cargo'
import {
  CONSELHOS,
  conselhoDoCodigo,
  conselhoSugerido,
  descreverRegistro,
  ehUf,
  profissoesComRegistro,
  rotuloDaSituacaoDoRegistro,
  situacaoDoRegistro,
  UFS,
} from './registro-profissional'

describe('situação do registro', () => {
  const hoje = '2026-11-17'

  it('confirmado pela Gestão, em dia ou sem validade', () => {
    expect(situacaoDoRegistro({ confirmado: true, validoAte: '2027-03-31' }, hoje)).toBe(
      'confirmado',
    )
    expect(situacaoDoRegistro({ confirmado: true, validoAte: null }, hoje)).toBe('confirmado')
  })

  it('aguardando a Gestão enquanto não confirmado', () => {
    expect(situacaoDoRegistro({ confirmado: false, validoAte: null }, hoje)).toBe(
      'aguardando_confirmacao',
    )
  })

  it('vencido vale mais que a confirmação; vence no dia seguinte à validade', () => {
    expect(situacaoDoRegistro({ confirmado: true, validoAte: '2026-11-16' }, hoje)).toBe('vencido')
    expect(situacaoDoRegistro({ confirmado: false, validoAte: '2026-11-16' }, hoje)).toBe('vencido')
    expect(situacaoDoRegistro({ confirmado: true, validoAte: hoje }, hoje)).toBe('confirmado')
  })

  it('tem rótulo para cada situação', () => {
    expect(rotuloDaSituacaoDoRegistro('aguardando_confirmacao')).toBe('Aguardando confirmação')
    expect(rotuloDaSituacaoDoRegistro('vencido')).toBe('Vencido')
    expect(rotuloDaSituacaoDoRegistro('confirmado')).toBe('Confirmado')
  })
})

describe('texto do registro', () => {
  it('monta sigla do regional, UF e número', () => {
    expect(descreverRegistro({ conselho: 'crea', numero: '123456', uf: 'SC' })).toBe(
      'Crea-SC 123456',
    )
    expect(descreverRegistro({ conselho: 'crbio', numero: '45678', uf: 'PR' })).toBe(
      'CRBio-PR 45678',
    )
  })

  it('sem UF, só a sigla; outro conselho fica só com a UF e o número', () => {
    expect(descreverRegistro({ conselho: 'crea', numero: ' 99 ', uf: null })).toBe('Crea 99')
    expect(descreverRegistro({ conselho: 'outro', numero: '99', uf: 'SC' })).toBe('SC 99')
    expect(descreverRegistro({ conselho: 'outro', numero: '99', uf: null })).toBe('99')
  })
})

describe('conselhos e profissões', () => {
  it('toda profissão da lista tem sugestão definida (conselho ou nenhum)', () => {
    for (const profissao of PROFISSOES) {
      const sugestao = conselhoSugerido(profissao.codigo)
      expect(sugestao === null || conselhoDoCodigo(sugestao) === sugestao).toBe(true)
    }
  })

  it('sugere o conselho mais comum e deixa em aberto quando há mais de um', () => {
    expect(conselhoSugerido('eng_ambiental')).toBe('crea')
    expect(conselhoSugerido('biologo')).toBe('crbio')
    expect(conselhoSugerido('arquiteto_urbanista')).toBe('cau')
    expect(conselhoSugerido('gestor_ambiental')).toBeNull()
    expect(conselhoSugerido('arqueologo')).toBeNull()
  })

  it('código desconhecido não vira conselho', () => {
    expect(conselhoDoCodigo('crx')).toBeNull()
    expect(conselhoDoCodigo('crq')).toBe('crq')
    expect(CONSELHOS.at(-1)?.codigo).toBe('outro')
  })

  it('registro só para profissão concluída: a principal fora de curso e as outras', () => {
    expect(
      profissoesComRegistro({
        profissao: 'biologo',
        profissaoEmCurso: false,
        outrasProfissoes: ['eng_ambiental'],
      }),
    ).toEqual(['biologo', 'eng_ambiental'])
    expect(
      profissoesComRegistro({
        profissao: 'biologo',
        profissaoEmCurso: true,
        outrasProfissoes: [],
      }),
    ).toEqual([])
    expect(
      profissoesComRegistro({ profissao: null, profissaoEmCurso: false, outrasProfissoes: [] }),
    ).toEqual([])
  })

  it('reconhece as 27 UFs e recusa o resto', () => {
    expect(UFS).toHaveLength(27)
    expect(ehUf('SC')).toBe(true)
    expect(ehUf('XX')).toBe(false)
    expect(ehUf('sc')).toBe(false)
  })
})
