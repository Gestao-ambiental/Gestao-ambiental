import { describe, expect, it } from 'vitest'

import { ErroDeOrcamento, composicaoDaEquipe } from './orcamento'
import {
  horaDeCustoPorMembro,
  linhasMensaisDaEquipe,
  resumoDaPessoa,
  type RemuneracaoDaPessoa,
} from './remuneracao'

const vazio: RemuneracaoDaPessoa = {
  forma: null,
  custoMensalCentavos: null,
  horasNoMes: null,
  custoDiariaCentavos: null,
  horasPorDiaria: null,
  diasNoMes: null,
  custoProjetoCentavos: null,
  horasDoProjeto: null,
}

describe('como cada pessoa recebe (ADR-0018, fatia 3)', () => {
  it('CLT, pró-labore e estágio: custo do mês ÷ horas do mês', () => {
    expect(
      resumoDaPessoa({ ...vazio, forma: 'clt', custoMensalCentavos: 600_000, horasNoMes: 160 }),
    ).toEqual({ horaDeCustoCentavos: 3_750, custoMensalCentavos: 600_000, capacidadeHorasMes: 160 })
    // Estágio: bolsa e custo completo informados pela consultoria; meio período é a jornada.
    expect(
      resumoDaPessoa({ ...vazio, forma: 'estagio', custoMensalCentavos: 150_000, horasNoMes: 120 })
        .horaDeCustoCentavos,
    ).toBe(1_250)
  })

  it('diária: custo ÷ horas da diária; capacidade só com os dias informados', () => {
    const semDias = resumoDaPessoa({
      ...vazio,
      forma: 'diaria',
      custoDiariaCentavos: 40_000,
      horasPorDiaria: 8,
    })
    expect(semDias).toEqual({
      horaDeCustoCentavos: 5_000,
      custoMensalCentavos: null,
      capacidadeHorasMes: null,
    })
    const comDias = resumoDaPessoa({
      ...vazio,
      forma: 'diaria',
      custoDiariaCentavos: 40_000,
      horasPorDiaria: 8,
      diasNoMes: 10,
    })
    expect(comDias).toEqual({
      horaDeCustoCentavos: 5_000,
      custoMensalCentavos: 400_000,
      capacidadeHorasMes: 80,
    })
  })

  it('projeto: custo ÷ horas do projeto; não vira custo do mês', () => {
    expect(
      resumoDaPessoa({
        ...vazio,
        forma: 'projeto',
        custoProjetoCentavos: 300_000,
        horasDoProjeto: 45,
        horasNoMes: 20,
      }),
    ).toEqual({ horaDeCustoCentavos: 6_667, custoMensalCentavos: null, capacidadeHorasMes: 20 })
  })

  it('sem horas não há hora de custo; ausente nunca vira zero', () => {
    expect(resumoDaPessoa({ ...vazio, forma: 'clt', custoMensalCentavos: 100_000 })).toEqual({
      horaDeCustoCentavos: null,
      custoMensalCentavos: 100_000,
      capacidadeHorasMes: null,
    })
  })

  it('recusa valores fora dos limites', () => {
    expect(() => resumoDaPessoa({ ...vazio, forma: 'diaria', horasPorDiaria: 25 })).toThrow(
      ErroDeOrcamento,
    )
    expect(() =>
      resumoDaPessoa({ ...vazio, forma: 'diaria', horasPorDiaria: 8, diasNoMes: 32 }),
    ).toThrow(ErroDeOrcamento)
    expect(() => resumoDaPessoa({ ...vazio, forma: 'clt', custoMensalCentavos: -1 })).toThrow(
      ErroDeOrcamento,
    )
  })

  it('média e rateio usam só quem tem custo e horas do mês; a hora de cada membro vale sempre', () => {
    const equipe = [
      {
        ...vazio,
        membroId: 'a',
        socio: true,
        forma: 'pro_labore' as const,
        custoMensalCentavos: 1_000_000,
        horasNoMes: 160,
      },
      {
        ...vazio,
        membroId: 'b',
        socio: false,
        forma: 'diaria' as const,
        custoDiariaCentavos: 40_000,
        horasPorDiaria: 8,
        diasNoMes: 10,
      },
      {
        ...vazio,
        membroId: 'c',
        socio: false,
        forma: 'projeto' as const,
        custoProjetoCentavos: 300_000,
        horasDoProjeto: 45,
      },
    ]
    const c = composicaoDaEquipe(linhasMensaisDaEquipe(equipe))
    // (10.000 + 4.000) ÷ (160 + 80) h = 58,33; o projeto fica fora.
    expect(c.horasFaturaveisMes).toBe(240)
    expect(c.horaTecnicaCentavos).toBe(5_833)
    expect(c.remuneracaoDosSociosCentavos).toBe(1_000_000)
    expect(horaDeCustoPorMembro(equipe)).toEqual([
      { membroId: 'a', horaCentavos: 6_250 },
      { membroId: 'b', horaCentavos: 5_000 },
      { membroId: 'c', horaCentavos: 6_667 },
    ])
  })
})
