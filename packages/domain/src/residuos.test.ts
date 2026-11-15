import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  conferirCdfMtr,
  converterQuantidade,
  formatarQuantidade,
  lerQuantidade,
  prazosDaObrigacaoResiduo,
  proximosPrazosDaObrigacaoResiduo,
  unidadeDoPainel,
  type MtrParaConferir,
} from './residuos'

describe('prazos das obrigações de resíduos', () => {
  it('DMR trimestral: mês seguinte ao trimestre, com a transição do 1º semestre de 2026', () => {
    const prazos = prazosDaObrigacaoResiduo(
      'dmr_trimestral',
      dataCivil('2026-01-01'),
      dataCivil('2027-12-31'),
    )
    expect(prazos.map((p) => [p.referencia, p.inicio, p.prazo])).toEqual([
      ['1º semestre de 2026', '2026-07-01', '2026-09-30'],
      ['3º trimestre de 2026', '2026-10-01', '2026-10-31'],
      ['4º trimestre de 2026', '2027-01-01', '2027-01-31'],
      ['1º trimestre de 2027', '2027-04-01', '2027-04-30'],
      ['2º trimestre de 2027', '2027-07-01', '2027-07-31'],
      ['3º trimestre de 2027', '2027-10-01', '2027-10-31'],
    ])
  })

  it('próximo prazo de cada obrigação a partir de hoje', () => {
    const hoje = dataCivil('2026-11-14')
    expect(proximosPrazosDaObrigacaoResiduo('dmr_trimestral', hoje)[0]?.prazo).toBe('2027-01-31')
    expect(proximosPrazosDaObrigacaoResiduo('dmrsu_mensal', hoje)[0]).toEqual({
      tipo: 'dmrsu_mensal',
      referencia: 'outubro de 2026',
      inicio: '2026-11-01',
      prazo: '2026-11-30',
    })
    expect(proximosPrazosDaObrigacaoResiduo('inventario_nacional', hoje)[0]?.prazo).toBe(
      '2027-03-31',
    )
    expect(proximosPrazosDaObrigacaoResiduo('rapp_ibama', hoje)[0]).toMatchObject({
      inicio: '2027-02-01',
      prazo: '2027-03-31',
    })
    // O próprio dia do prazo ainda é "próximo".
    expect(
      proximosPrazosDaObrigacaoResiduo('dmrsu_mensal', dataCivil('2026-11-30'))[0]?.prazo,
    ).toBe('2026-11-30')
  })
})

describe('unidades e quantidades', () => {
  it('converte só entre unidades do mesmo tipo', () => {
    expect(converterQuantidade(1.5, 't', 'kg')).toBe(1500)
    expect(converterQuantidade(250, 'l', 'm3')).toBe(0.25)
    expect(converterQuantidade(3, 'un', 'kg')).toBeNull()
    expect(unidadeDoPainel('kg')).toBe('t')
    expect(unidadeDoPainel('l')).toBe('m3')
  })

  it('lê e formata no padrão brasileiro', () => {
    expect(lerQuantidade('1.234,5')).toBe(1234.5)
    expect(lerQuantidade('0,25')).toBe(0.25)
    expect(lerQuantidade('0')).toBeNull()
    expect(lerQuantidade('1,23456')).toBeNull()
    expect(formatarQuantidade(1234.5, 't')).toBe('1.234,5 t')
    expect(formatarQuantidade(0.25, 'm3')).toBe('0,25 m³')
  })
})

describe('conferência CDF x MTR', () => {
  const hoje = dataCivil('2026-11-14')
  const mtr = (
    parcial: Partial<MtrParaConferir> & Pick<MtrParaConferir, 'id'>,
  ): MtrParaConferir => ({
    numero: parcial.id,
    emitidoEm: dataCivil('2026-10-01'),
    situacao: 'recebido',
    cdfIds: [],
    itens: [],
    ...parcial,
  })
  const item = {
    id: 'i1',
    residuoCodigo: '200301',
    residuoDescricao: 'Resíduos urbanos misturados',
    quantidade: 1.5,
    unidade: 't' as const,
  }

  it('acusa MTR sem CDF depois de 30 dias e ignora cancelado, recente e em armazenamento', () => {
    const pendencias = conferirCdfMtr(
      [
        mtr({ id: 'velho', emitidoEm: dataCivil('2026-10-14') }),
        mtr({ id: 'trinta', emitidoEm: dataCivil('2026-10-15') }),
        mtr({ id: 'cancelado', situacao: 'cancelado' }),
        mtr({ id: 'armazenado', situacao: 'em_armazenamento' }),
        mtr({ id: 'com-cdf', cdfIds: ['c1'] }),
      ],
      hoje,
    )
    expect(pendencias).toEqual([
      { tipo: 'mtr_sem_cdf', mtrId: 'velho', numero: 'velho', emitidoEm: '2026-10-14', dias: 31 },
    ])
  })

  it('compara a soma dos CDFs com o MTR, convertendo kg em t, sem tolerância', () => {
    const certo = mtr({
      id: 'certo',
      cdfIds: ['c1', 'c2'],
      itens: [
        {
          ...item,
          recebido: [
            { cdfId: 'c1', quantidade: 1000, unidade: 'kg' },
            { cdfId: 'c2', quantidade: 0.5, unidade: 't' },
          ],
        },
      ],
    })
    const diferente = mtr({
      id: 'diferente',
      cdfIds: ['c3'],
      itens: [{ ...item, recebido: [{ cdfId: 'c3', quantidade: 1499.9, unidade: 'kg' }] }],
    })
    const outraUnidade = mtr({
      id: 'outra',
      cdfIds: ['c4'],
      itens: [{ ...item, recebido: [{ cdfId: 'c4', quantidade: 2, unidade: 'm3' }] }],
    })
    const semQuantidade = mtr({ id: 'sem', cdfIds: ['c5'], itens: [{ ...item, recebido: [] }] })

    expect(conferirCdfMtr([certo, diferente, outraUnidade, semQuantidade], hoje)).toEqual([
      {
        tipo: 'quantidade_diferente',
        mtrId: 'diferente',
        numero: 'diferente',
        itemId: 'i1',
        residuoCodigo: '200301',
        residuoDescricao: 'Resíduos urbanos misturados',
        cdfIds: ['c3'],
        unidade: 't',
        quantidadeMtr: 1.5,
        quantidadeCdf: 1.4999,
        diferenca: -0.0001,
      },
      {
        tipo: 'unidades_diferentes',
        mtrId: 'outra',
        numero: 'outra',
        itemId: 'i1',
        residuoCodigo: '200301',
        residuoDescricao: 'Resíduos urbanos misturados',
        cdfIds: ['c4'],
        unidadeMtr: 't',
        unidadesCdf: ['m3'],
      },
    ])
  })
})
