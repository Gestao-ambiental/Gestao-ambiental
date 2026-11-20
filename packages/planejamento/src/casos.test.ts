// Casos de referência da especificação 0.1, calculados à mão: hoje = 2027-01-11, parâmetros
// provisórios (margens de 7, 14, 28 e 42 dias).

import { describe, expect, it } from 'vitest'
import { atividade, itemDe, planoDe } from './apoio-de-teste'

describe('casos de referência', () => {
  it('caso 1: planejada', () => {
    const plano = planoDe([atividade({ id: 'c1', prazo: '2027-03-31', esperaDias: 20 })])
    expect(itemDe(plano, 'c1')).toMatchObject({
      inicioLimite: '2027-03-01',
      inicioRecomendado: '2027-02-15',
      folgaDias: 49,
      margemEfetivaDias: 14,
      diasAteInicio: 35,
      estado: 'planejada',
      inicioPlanejado: '2027-02-15',
      fimPlanejado: '2027-03-17',
      avisos: [],
    })
    expect(plano.triagem).toEqual([])
    expect(plano.aglomeracoes).toEqual([])
  })

  it('caso 2: a mesma atividade, crítica, começa mais cedo', () => {
    const plano = planoDe([
      atividade({ id: 'c2', prazo: '2027-03-31', esperaDias: 20, gravidade: 'critica' }),
    ])
    expect(itemDe(plano, 'c2')).toMatchObject({
      inicioLimite: '2027-03-01',
      inicioRecomendado: '2027-01-18',
      diasAteInicio: 7,
      estado: 'planejada',
    })
  })

  it('caso 3: iniciar já quando a folga é menor que a margem', () => {
    const plano = planoDe([
      atividade({
        id: 'c3',
        prazo: '2027-02-28',
        duracaoDias: 15,
        esperaDias: 10,
        gravidade: 'alta',
      }),
    ])
    expect(itemDe(plano, 'c3')).toMatchObject({
      inicioLimite: '2027-02-03',
      inicioRecomendado: '2027-01-06',
      folgaDias: 23,
      diasAteInicio: -5,
      estado: 'iniciar_ja',
      inicioPlanejado: '2027-01-11',
      avisos: ['margem_nao_cabe'],
    })
    expect(plano.triagem).toEqual(['c3'])
  })

  it('caso 4: inviável quando nem começando hoje cumpre o prazo', () => {
    const plano = planoDe([
      atividade({ id: 'c4', prazo: '2027-01-25', esperaDias: 10, gravidade: 'baixa' }),
    ])
    expect(itemDe(plano, 'c4')).toMatchObject({
      inicioLimite: '2027-01-05',
      folgaDias: -6,
      estado: 'inviavel',
      fimPlanejado: '2027-01-31',
      avisos: ['prazo_nao_cabe'],
    })
    expect(plano.metricas.atrasadas).toBe(1)
  })

  it('caso 5: em cadeia, a margem entra uma vez e se propaga para a antecessora', () => {
    const plano = planoDe([
      atividade({
        id: 'relatorio',
        prazo: '2027-04-30',
        dependeDe: [{ id: 'coleta', defasagemDias: 0 }],
      }),
      atividade({ id: 'coleta', duracaoDias: 2, esperaDias: 21 }),
    ])
    expect(itemDe(plano, 'relatorio')).toMatchObject({
      inicioLimite: '2027-04-20',
      inicioRecomendado: '2027-04-06',
    })
    expect(itemDe(plano, 'coleta')).toMatchObject({
      inicioLimite: '2027-03-28',
      inicioRecomendado: '2027-03-14',
      margemEfetivaDias: 14,
      fimPlanejado: '2027-04-06',
      explicacao: { prazo: null, limitadaPor: 'relatorio' },
    })
  })

  it('caso 6: as horas se dividem entre os meses pelos dias de trabalho', () => {
    const plano = planoDe([atividade({ id: 'c6', prazo: '2027-03-20', esforcoHoras: 30 })])
    expect(itemDe(plano, 'c6').inicioPlanejado).toBe('2027-02-24')
    expect(plano.cargaMensal).toEqual([
      { mes: '2027-01', horas: 0, horasSemNivelamento: 0 },
      { mes: '2027-02', horas: 15, horasSemNivelamento: 15 },
      { mes: '2027-03', horas: 15, horasSemNivelamento: 15 },
    ])
    expect(plano.metricas).toMatchObject({ picoHoras: 15, mesDoPico: '2027-02', mediaHoras: 10 })
  })

  it('caso 7: só pelo prazo, o aviso de 30 dias chega tarde para 45 dias de trabalho e espera', () => {
    const plano = planoDe(
      [atividade({ id: 'c7', prazo: '2027-06-30', duracaoDias: 15, esperaDias: 30 })],
      'so_prazo',
    )
    expect(itemDe(plano, 'c7')).toMatchObject({
      inicioPlanejado: '2027-05-31',
      fimPlanejado: '2027-07-15',
      estado: 'planejada',
    })
    expect(plano.metricas).toMatchObject({ atrasadas: 1, zonaCritica: 1 })
  })
})

describe('triagem', () => {
  it('lista inviáveis antes de iniciar já e marca quem está bloqueada', () => {
    const plano = planoDe([
      atividade({ id: 'folgada', prazo: '2027-12-31' }),
      atividade({ id: 'urgente', prazo: '2027-02-10', gravidade: 'alta' }),
      atividade({ id: 'perdida', prazo: '2027-01-15' }),
      atividade({
        id: 'depois',
        prazo: '2027-02-03',
        dependeDe: [{ id: 'urgente', defasagemDias: 0 }],
      }),
    ])
    expect(plano.triagem[0]).toBe('perdida')
    expect(new Set(plano.triagem)).toEqual(new Set(['perdida', 'urgente', 'depois']))
    expect(itemDe(plano, 'depois').bloqueadaPor).toEqual(['urgente'])
    expect(itemDe(plano, 'folgada').bloqueadaPor).toEqual([])
  })
})

describe('estratégias', () => {
  const carteira = [
    atividade({ id: 'x', prazo: '2027-06-30', esperaDias: 20, gravidade: 'critica' }),
  ]

  it('(b) usa a margem única; (d) usa a margem da gravidade', () => {
    expect(itemDe(planoDe(carteira, 'folga_sem_gravidade'), 'x').inicioPlanejado).toBe('2027-05-17')
    expect(itemDe(planoDe(carteira, 'metodo_sem_antecipacao'), 'x').inicioPlanejado).toBe(
      '2027-04-19',
    )
  })

  it('as datas de referência e a zona crítica usam a régua da gravidade em toda estratégia', () => {
    const plano = planoDe(carteira, 'folga_sem_gravidade')
    expect(itemDe(plano, 'x').inicioRecomendado).toBe('2027-04-19')
    expect(plano.metricas.zonaCritica).toBe(1)
    expect(plano.metricas.antecedenciaGravesMinima).toBe(14)
  })

  it('atividade fixa com início imposto fica nessa data e avisa quando termina tarde', () => {
    const plano = planoDe([
      atividade({
        id: 'campanha',
        prazo: '2027-06-30',
        antecipabilidade: 'fixa',
        inicioFixo: '2027-06-15',
      }),
    ])
    expect(itemDe(plano, 'campanha')).toMatchObject({
      inicioPlanejado: '2027-06-15',
      fimPlanejado: '2027-06-25',
      avisos: ['inicio_fixo_tardio'],
    })
  })
})
