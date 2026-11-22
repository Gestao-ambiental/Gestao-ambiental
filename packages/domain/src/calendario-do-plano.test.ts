import { describe, expect, it } from 'vitest'

import { entraNoPlano, previaDoCalendario, type ItemDoPlano } from './calendario-do-plano'

const BRUNO = 'membro-bruno'
const CAMILA = 'membro-camila'

function item(parcial: Partial<ItemDoPlano> & Pick<ItemDoPlano, 'id' | 'codigo'>): ItemDoPlano {
  return {
    titulo: parcial.codigo,
    natureza: 'obrigacao',
    revisao: 'aceita',
    responsavelId: BRUNO,
    prazo: null,
    ...parcial,
  }
}

// O mesmo plano de supabase/tests/100_cadastro_de_licenca.test.sql, em que ativar_plano devolve 8:
// validade 31/05/2024, mensal desde 31/01/2024 (5), única em 30/06/2023 (1), a cada 45 dias desde
// 31/03/2024 (2), contínua e informação geral (0).
const PLANO_DO_BANCO: ItemDoPlano[] = [
  item({ id: 'a', codigo: '1', natureza: 'agrupador' }),
  item({ id: 'b', codigo: '1.1', natureza: 'informacao_geral' }),
  item({
    id: 'c',
    codigo: '2.1',
    titulo: 'Relatório mensal',
    prazo: { recorrencia: 'mensal', dataReferencia: '2023-01-31', primeiraData: '2024-01-31' },
  }),
  item({ id: 'd', codigo: '2.2', natureza: 'condicao_continua' }),
  item({
    id: 'e',
    codigo: '2.3',
    titulo: 'Laudo único',
    prazo: { recorrencia: 'unica', dataReferencia: '2023-01-31', primeiraData: '2023-06-30' },
  }),
  item({
    id: 'f',
    codigo: '2.4',
    titulo: 'Análise do corpo receptor',
    responsavelId: CAMILA,
    prazo: {
      recorrencia: 'personalizada',
      unidade: 'dia',
      intervalo: 45,
      dataReferencia: '2023-01-31',
      primeiraData: '2024-03-31',
    },
  }),
]

const CONTEXTO = { validade: '2024-05-31', referencia: '2023-01-31', siglaDoTipo: 'LAO' } as const

describe('previaDoCalendario', () => {
  it('conta o mesmo total que ativar_plano devolve no caso do banco (8)', () => {
    const previa = previaDoCalendario(PLANO_DO_BANCO, CONTEXTO)
    expect(previa.total).toBe(8)
    expect(previa.comProblema).toEqual([])
  })

  it('agrupa todas as condicionantes por mês, em ordem de data, com o responsável', () => {
    const previa = previaDoCalendario(PLANO_DO_BANCO, CONTEXTO)
    expect(previa.meses.map((m) => m.mes)).toEqual([
      '2023-06',
      '2024-01',
      '2024-02',
      '2024-03',
      '2024-04',
      '2024-05',
    ])
    const marco = previa.meses.find((m) => m.mes === '2024-03')
    expect(marco?.prazos.map((p) => [p.data, p.codigo, p.responsavelId])).toEqual([
      ['2024-03-31', '2.1', BRUNO],
      ['2024-03-31', '2.4', CAMILA],
    ])
    const maio = previa.meses.find((m) => m.mes === '2024-05')
    expect(maio?.prazos.map((p) => [p.data, p.codigo, p.ciclo])).toEqual([
      ['2024-05-15', '2.4', 2],
      ['2024-05-31', '2.1', 5],
    ])
  })

  it('dá a primeira data e o total de cada condicionante; sem prazo, null', () => {
    const { porItem } = previaDoCalendario(PLANO_DO_BANCO, CONTEXTO)
    expect(porItem.c).toEqual({ primeiraData: '2024-01-31', total: 5 })
    expect(porItem.e).toEqual({ primeiraData: '2023-06-30', total: 1 })
    expect(porItem.f).toEqual({ primeiraData: '2024-03-31', total: 2 })
    expect(porItem.b).toEqual({ primeiraData: null, total: 0 })
    expect(porItem.d).toEqual({ primeiraData: null, total: 0 })
  })

  it('contínua não gera prazo, como no banco', () => {
    const previa = previaDoCalendario(
      [item({ id: 'x', codigo: '3', prazo: { recorrencia: 'continua' } })],
      CONTEXTO,
    )
    expect(previa.total).toBe(0)
    expect(previa.porItem.x).toEqual({ primeiraData: null, total: 0 })
    expect(previa.comProblema).toEqual([])
  })

  it('pendente e descartada ficam fora do total', () => {
    const mensal = { recorrencia: 'mensal', primeiraData: '2024-01-31' } as const
    const previa = previaDoCalendario(
      [
        item({ id: 'p', codigo: '1', revisao: 'pendente', prazo: mensal }),
        item({ id: 'q', codigo: '2', revisao: 'descartada', prazo: mensal }),
      ],
      CONTEXTO,
    )
    expect(previa.total).toBe(0)
    expect(previa.meses).toEqual([])
  })

  it('sem primeira data, usa a sugerida pelo marco (sugerirPrimeiraData)', () => {
    const previa = previaDoCalendario(
      [item({ id: 's', codigo: '1', prazo: { recorrencia: 'trimestral' } })],
      { validade: '2024-01-31', referencia: '2023-01-31', siglaDoTipo: 'LAO' },
    )
    expect(previa.porItem.s).toEqual({ primeiraData: '2023-04-30', total: 4 })
  })

  it('prazo confirmado sem referência gravada conta da primeira data, como o banco', () => {
    // Marco 31/01: com a referência, 30/04 → 31/07; sem ela (banco com data_referencia nula), 30/07.
    const previa = previaDoCalendario(
      [
        item({
          id: 'r',
          codigo: '1',
          prazo: { recorrencia: 'trimestral', primeiraData: '2023-04-30' },
        }),
      ],
      { validade: '2023-08-15', referencia: '2023-01-31', siglaDoTipo: 'LAO' },
    )
    expect(previa.meses.flatMap((m) => m.prazos.map((p) => p.data))).toEqual([
      '2023-04-30',
      '2023-07-30',
    ])
  })

  it('obrigação aceita sem prazo que feche vai para comProblema e não conta', () => {
    const previa = previaDoCalendario(
      [
        item({ id: 'u', codigo: '1', prazo: null }),
        item({ id: 'v', codigo: '2', prazo: { recorrencia: 'unica' } }),
      ],
      CONTEXTO,
    )
    expect(previa.total).toBe(0)
    expect(previa.comProblema).toEqual(['u', 'v'])
  })
})

describe('entraNoPlano', () => {
  it('só obrigação aceita entra', () => {
    expect(entraNoPlano({ natureza: 'obrigacao', revisao: 'aceita' })).toBe(true)
    expect(entraNoPlano({ natureza: 'condicao_continua', revisao: 'aceita' })).toBe(false)
    expect(entraNoPlano({ natureza: 'obrigacao', revisao: 'pendente' })).toBe(false)
  })
})
