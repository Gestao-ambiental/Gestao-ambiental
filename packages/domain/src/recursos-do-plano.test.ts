import { describe, expect, it } from 'vitest'

import {
  CATALOGO_PADRAO,
  PLANOS,
  recursoLiberado,
  situacaoComercial,
  type EntradaDaSituacao,
} from './planos'

// Recursos por plano e plano por contrato (ADR-0030); o mesmo de private.recurso_liberado e do
// ramo 'contrato' de private.situacao_comercial_calculada (teste 490).
const encerrada: EntradaDaSituacao = {
  hoje: '2027-06-01',
  criadaEm: '2027-03-24',
  fimDoBeta: '2027-01-31',
  diasDeTeste: 10,
  interna: false,
  assinatura: null,
  vencimentosEmAberto: [],
}

describe('recursos de cada plano', () => {
  it('Essencial sem recursos, Equipe com capacidade, Escala com todos', () => {
    expect(PLANOS.essencial.recursos).toEqual([])
    expect(PLANOS.equipe.recursos).toEqual(['capacidade'])
    expect(PLANOS.escala.recursos).toEqual([
      'capacidade',
      'integracao_ima',
      'financeiro',
      'analise_lotes',
    ])
  })
})

describe('plano por contrato', () => {
  it('tira do só leitura e aplica limites e orçamentos do plano, sem cobrança', () => {
    expect(situacaoComercial(encerrada).situacao).toBe('teste_encerrado')
    const s = situacaoComercial({ ...encerrada, contrato: { plano: 'escala', ate: '2027-12-31' } })
    expect(s).toMatchObject({
      situacao: 'contrato',
      somenteLeitura: false,
      orcamentosLiberados: true,
      planoVigente: 'escala',
      cicloVigente: null,
      limites: { pessoas: 25, empreendimentos: 100 },
      venceHoje: false,
    })
  })

  it('vale até a data; sem data, não vence', () => {
    const contrato = { plano: 'essencial' as const, ate: '2027-06-01' as const }
    expect(situacaoComercial({ ...encerrada, contrato }).situacao).toBe('contrato')
    expect(situacaoComercial({ ...encerrada, hoje: '2027-06-02', contrato }).situacao).toBe(
      'teste_encerrado',
    )
    expect(
      situacaoComercial({
        ...encerrada,
        hoje: '2030-01-01',
        contrato: { plano: 'equipe', ate: null },
      }).situacao,
    ).toBe('contrato')
  })

  it('conta interna vem antes do contrato', () => {
    expect(
      situacaoComercial({
        ...encerrada,
        interna: true,
        contrato: { plano: 'essencial', ate: null },
      }).situacao,
    ).toBe('interna')
  })

  it('ignora cobrança em aberto enquanto vale (o dinheiro não passa pelo Grama)', () => {
    const s = situacaoComercial({
      ...encerrada,
      contrato: { plano: 'equipe', ate: null },
      vencimentosEmAberto: ['2027-05-01'],
    })
    expect(s).toMatchObject({ situacao: 'contrato', somenteLeitura: false, emAtrasoDesde: null })
  })
})

describe('recurso liberado', () => {
  const comPlano = (plano: 'essencial' | 'equipe' | 'escala') =>
    situacaoComercial({ ...encerrada, contrato: { plano, ate: null } })

  it('segue o plano vigente', () => {
    expect(recursoLiberado(comPlano('essencial'), 'capacidade')).toBe(false)
    expect(recursoLiberado(comPlano('equipe'), 'capacidade')).toBe(true)
    expect(recursoLiberado(comPlano('equipe'), 'analise_lotes')).toBe(false)
    expect(recursoLiberado(comPlano('escala'), 'analise_lotes')).toBe(true)
    expect(recursoLiberado(comPlano('essencial'), 'orcamentos')).toBe(false)
    expect(recursoLiberado(comPlano('essencial'), 'ia')).toBe(false)
    expect(recursoLiberado(comPlano('equipe'), 'ia')).toBe(true)
  })

  it('teste libera tudo; só leitura não libera nada', () => {
    expect(
      recursoLiberado(situacaoComercial({ ...encerrada, hoje: '2027-03-25' }), 'analise_lotes'),
    ).toBe(true)
    expect(recursoLiberado(situacaoComercial(encerrada), 'capacidade')).toBe(false)
  })

  it('usa o catálogo editado pela central', () => {
    const catalogo = {
      ...CATALOGO_PADRAO,
      planos: {
        ...CATALOGO_PADRAO.planos,
        essencial: { ...PLANOS.essencial, recursos: ['financeiro' as const] },
      },
    }
    expect(recursoLiberado(comPlano('essencial'), 'financeiro', catalogo)).toBe(true)
  })
})
