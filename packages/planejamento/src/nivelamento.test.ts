import { describe, expect, it } from 'vitest'
import { atividade, itemDe, planoDe } from './apoio-de-teste'

const horasDe = (plano: ReturnType<typeof planoDe>) => plano.cargaMensal.map((m) => m.horas)

describe('nivelamento', () => {
  // Três atividades iguais vencendo em 31/03: sem nivelar, 24 h em fevereiro e 96 h em março.
  const tres = ['n1', 'n2', 'n3'].map((id) =>
    atividade({ id, prazo: '2027-03-31', duracaoDias: 20, esforcoHoras: 40 }),
  )

  it('sem nivelar, a carga se concentra no mês do prazo', () => {
    expect(horasDe(planoDe(tres, 'metodo_sem_antecipacao'))).toEqual([0, 24, 96])
  })

  it('nivelando, o pico cai de 96 h para 44 h e o total se conserva', () => {
    const plano = planoDe(tres, 'metodo_completo')
    expect(horasDe(plano)).toEqual([44, 44, 32])
    expect(plano.cargaMensal.map((m) => m.horasSemNivelamento)).toEqual([0, 24, 96])
    expect(plano.metricas).toMatchObject({ picoHoras: 44, mesDoPico: '2027-01', zonaCritica: 0 })
    expect(plano.itens.map((i) => i.antecipadaDias)).toEqual([28, 42, 0])
  })

  it('não move atividade fixa nem passa de inicioMaisCedo', () => {
    const plano = planoDe(
      [
        atividade({
          id: 'fixa',
          prazo: '2027-03-31',
          duracaoDias: 20,
          esforcoHoras: 40,
          antecipabilidade: 'fixa',
        }),
        atividade({
          id: 'presa',
          prazo: '2027-03-31',
          duracaoDias: 20,
          esforcoHoras: 40,
          inicioMaisCedo: '2027-02-20',
        }),
        atividade({ id: 'livre', prazo: '2027-03-31', duracaoDias: 20, esforcoHoras: 40 }),
      ],
      'metodo_completo',
    )
    expect(itemDe(plano, 'fixa').antecipadaDias).toBe(0)
    expect(itemDe(plano, 'presa').inicioPlanejado >= '2027-02-20').toBe(true)
    expect(itemDe(plano, 'livre').antecipadaDias).toBeGreaterThan(0)
  })

  it('em atividade parcial, só a parte antecipável se move', () => {
    const base = { prazo: '2027-03-31', duracaoDias: 20, esforcoHoras: 40 }
    const plano = planoDe(
      [
        atividade({ id: 'p', ...base, antecipabilidade: 'parcial', fracaoAntecipavel: 0.5 }),
        atividade({ id: 'q', ...base, antecipabilidade: 'fixa' }),
        atividade({ id: 'r', ...base, antecipabilidade: 'fixa' }),
      ],
      'metodo_completo',
    )
    const parcial = itemDe(plano, 'p')
    expect(parcial.antecipadaDias).toBeGreaterThan(0)
    // A parte fixa (10 dias) continua terminando na data recomendada: 31/03 − 14 dias.
    expect(parcial.inicioParteFixa).toBe('2027-03-07')
    expect(parcial.fimPlanejado).toBe('2027-03-17')
  })
})
