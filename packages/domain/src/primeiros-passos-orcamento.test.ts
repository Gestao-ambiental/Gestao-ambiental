import { describe, expect, it } from 'vitest'

import {
  ETAPAS_DA_CONFIGURACAO,
  etapaDaConfiguracao,
  exibirConviteDeConfiguracao,
  horasDaEquipe,
  pendenciasDaConfiguracao,
  resumoDaConfiguracao,
  rotuloDoConviteDeConfiguracao,
  valorFoiInformado,
  type PessoaDoRascunho,
} from './primeiros-passos-orcamento'

function pessoa(extra: Partial<PessoaDoRascunho>): PessoaDoRascunho {
  return {
    id: 'p',
    membroId: 'm',
    socio: false,
    profissao: null,
    forma: 'clt',
    custoMensalCentavos: null,
    horasNoMes: null,
    custoDiariaCentavos: null,
    horasPorDiaria: null,
    diasNoMes: null,
    custoProjetoCentavos: null,
    horasDoProjeto: null,
    ...extra,
  }
}

const tributosCompletos = {
  tributosPb: 0,
  taxasPb: 0,
  taxaPorCobrancaCentavos: 0,
  taxaPorAssinaturaCentavos: 0,
  margemDesejadaPb: 3_000,
  margemMinimaPb: 2_500,
  margensConfirmadas: true,
}

describe('primeiros passos do orçamento', () => {
  it('convida apenas sem base e sem dispensa da pessoa', () => {
    const inicial = { baseConfigurada: false, conviteDispensado: false, possuiRascunho: false }
    expect(exibirConviteDeConfiguracao(inicial)).toBe(true)
    expect(exibirConviteDeConfiguracao({ ...inicial, conviteDispensado: true })).toBe(false)
    expect(exibirConviteDeConfiguracao({ ...inicial, baseConfigurada: true })).toBe(false)
  })

  it('diferencia iniciar de retomar sem publicar ou bloquear a lista', () => {
    const estado = { baseConfigurada: false, conviteDispensado: false, possuiRascunho: false }
    expect(rotuloDoConviteDeConfiguracao(estado)).toBe('Configurar em poucos passos')
    expect(rotuloDoConviteDeConfiguracao({ ...estado, possuiRascunho: true })).toBe(
      'Continuar configuração',
    )
  })

  it('reconhece somente as seis etapas previstas', () => {
    expect(ETAPAS_DA_CONFIGURACAO).toHaveLength(6)
    for (const etapa of ETAPAS_DA_CONFIGURACAO) expect(etapaDaConfiguracao(etapa)).toBe(etapa)
    expect(etapaDaConfiguracao('outra')).toBeNull()
    expect(etapaDaConfiguracao(null)).toBeNull()
  })

  it('não confunde ausência com zero digitado', () => {
    expect(valorFoiInformado(null)).toBe(false)
    expect(valorFoiInformado(undefined)).toBe(false)
    expect(valorFoiInformado(Number.NaN)).toBe(false)
    expect(valorFoiInformado(0)).toBe(true)
    expect(valorFoiInformado(12)).toBe(true)
  })
})

// Mesmos cenários de supabase/tests/290_primeiros_passos_orcamento.test.sql.
describe('pendências da configuração (iguais às do banco)', () => {
  it('sem nada salvo, falta tudo', () => {
    expect(pendenciasDaConfiguracao({})).toEqual([
      'equipe',
      'horas',
      'contas',
      'precos',
      'tributos',
      'taxas',
      'margens',
    ])
  })

  it('diária sem dias no mês não forma a média; total das contas 0 digitado vale', () => {
    expect(
      pendenciasDaConfiguracao({
        equipe: {
          modo: 'equipe',
          horaTecnicaCentavos: null,
          equipe: [pessoa({ forma: 'diaria', custoDiariaCentavos: 40_000, horasPorDiaria: 8 })],
        },
        contas: { custosFixosMensaisCentavos: 0, contas: [], horasFaturaveisMes: null },
      }),
    ).toEqual(['equipe', 'precos', 'tributos', 'taxas', 'margens'])
  })

  it('custo da hora e horas zerados faltam; margens sem confirmação faltam', () => {
    expect(
      pendenciasDaConfiguracao({
        equipe: { modo: 'manual', equipe: [], horaTecnicaCentavos: 0 },
        contas: { custosFixosMensaisCentavos: null, contas: [], horasFaturaveisMes: 0 },
        tributos: { ...tributosCompletos, margensConfirmadas: false },
      }),
    ).toEqual(['equipe', 'horas', 'contas', 'precos', 'margens'])
  })

  it('conta detalhada sem valor e taxa não informada continuam pendentes', () => {
    const equipe = {
      modo: 'equipe' as const,
      horaTecnicaCentavos: null,
      equipe: [
        pessoa({
          forma: 'pro_labore',
          socio: true,
          custoMensalCentavos: 1_000_000,
          horasNoMes: 160,
        }),
        pessoa({ id: 'p2', membroId: 'm2', forma: 'clt', horasNoMes: 173 }),
        pessoa({ id: 'p3', membroId: 'm3', forma: 'projeto', custoProjetoCentavos: 300_000 }),
      ],
    }
    const contas = {
      custosFixosMensaisCentavos: null,
      horasFaturaveisMes: null,
      contas: [
        { descricao: 'Aluguel', valorCentavos: 0 },
        { descricao: 'Energia', valorCentavos: null },
      ],
    }
    expect(pendenciasDaConfiguracao({ equipe, contas })).toEqual([
      'contas',
      'precos',
      'tributos',
      'taxas',
      'margens',
    ])
    expect(
      pendenciasDaConfiguracao({
        equipe,
        contas: { ...contas, contas: [{ descricao: 'Aluguel', valorCentavos: 0 }] },
        precos: { horasVenda: [{}], valorVisitaCentavos: null, custoKmCentavos: null },
        tributos: { ...tributosCompletos, taxaPorAssinaturaCentavos: null },
      }),
    ).toEqual(['taxas'])
  })

  it('com equipe, as horas faturáveis vêm de quem tem custo e horas do mês', () => {
    expect(
      horasDaEquipe([
        pessoa({ custoMensalCentavos: 1_000_000, horasNoMes: 160 }),
        pessoa({ horasNoMes: 173 }),
        pessoa({ forma: 'diaria', custoDiariaCentavos: 40_000, horasPorDiaria: 8, diasNoMes: 10 }),
      ]),
    ).toBe(240)
  })
})

describe('resumo da configuração', () => {
  it('equipe: hora média, horas da equipe e contas por hora (10.000 ÷ 160 h = 62,50; 500 ÷ 160 = 3,13)', () => {
    expect(
      resumoDaConfiguracao({
        equipe: {
          modo: 'equipe',
          horaTecnicaCentavos: null,
          equipe: [pessoa({ custoMensalCentavos: 1_000_000, horasNoMes: 160 })],
        },
        contas: {
          custosFixosMensaisCentavos: null,
          horasFaturaveisMes: null,
          contas: [
            { descricao: 'Aluguel', valorCentavos: 0 },
            { descricao: 'Energia', valorCentavos: 50_000 },
          ],
        },
        precos: { horasVenda: [{}, {}], valorVisitaCentavos: null, custoKmCentavos: null },
      }),
    ).toEqual({
      horaTecnicaCentavos: 6_250,
      horasFaturaveisMes: 160,
      custosFixosMensaisCentavos: 50_000,
      contasPorHoraCentavos: 313,
      quantidadeDePrecos: 2,
    })
  })

  it('sem horas ou sem contas, o que depende delas fica pendente (nulo), não zero', () => {
    expect(
      resumoDaConfiguracao({
        equipe: { modo: 'manual', equipe: [], horaTecnicaCentavos: 9_500 },
        contas: { custosFixosMensaisCentavos: 960_000, contas: [], horasFaturaveisMes: null },
      }),
    ).toEqual({
      horaTecnicaCentavos: 9_500,
      horasFaturaveisMes: null,
      custosFixosMensaisCentavos: 960_000,
      contasPorHoraCentavos: null,
      quantidadeDePrecos: 0,
    })
  })
})
