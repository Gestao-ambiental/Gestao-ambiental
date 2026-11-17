// Cenário de aglomeração: 30 prazos por mês e 130 em março. Regressão do gerador e do que as
// estratégias fazem com ele, com e sem teto de capacidade.

import { describe, expect, it } from 'vitest'
import { PARAMETROS } from './apoio-de-teste'
import { cenarioAglomerado } from './cenario'
import { comparar, type LinhaDaComparacao } from './comparar'
import { planejar } from './planejar'
import type { Estrategia } from './tipos'

const OPCOES = { semente: 1, ano: 2027, porMes: 30, mesDePico: 3, noPico: 130 }
const carteira = cenarioAglomerado(OPCOES)

function linhas(hoje: string, capacidade?: number): Record<Estrategia, LinhaDaComparacao> {
  const parametros = { ...PARAMETROS, capacidadeMensalHoras: capacidade ?? null }
  const comparacao = comparar(carteira, parametros, hoje)
  if (!comparacao.ok) throw new Error(JSON.stringify(comparacao.erros))
  return Object.fromEntries(comparacao.linhas.map((l) => [l.estrategia, l])) as Record<
    Estrategia,
    LinhaDaComparacao
  >
}
const total = (linha: LinhaDaComparacao) => linha.horas.reduce((soma, h) => soma + h, 0)

describe('cenário aglomerado', () => {
  it('gera 30 prazos por mês e 130 no mês de pico', () => {
    const porMes = new Map<string, number>()
    for (const a of carteira.atividades) {
      const mes = (a.prazo ?? '').slice(0, 7)
      porMes.set(mes, (porMes.get(mes) ?? 0) + 1)
    }
    expect(carteira.atividades).toHaveLength(460)
    expect(porMes.get('2027-03')).toBe(130)
    expect([...porMes.values()].filter((n) => n === 30)).toHaveLength(11)
    expect(new Set(carteira.atividades.map((a) => a.id)).size).toBe(460)
  })

  it('a mesma semente dá a mesma carteira; outra semente, outra', () => {
    expect(cenarioAglomerado(OPCOES)).toEqual(carteira)
    expect(cenarioAglomerado({ ...OPCOES, semente: 2 })).not.toEqual(carteira)
  })

  it('sem capacidade, com cinco meses de antecedência o método completo achata o pico', () => {
    const l = linhas('2026-10-01')
    expect(l.so_prazo.metricas.picoHoras).toBeGreaterThan(1500)
    expect(l.metodo_sem_antecipacao.metricas.picoHoras).toBeGreaterThan(1100)
    expect(l.metodo_completo.metricas.picoHoras).toBeLessThan(650)
    expect(l.metodo_completo.metricas.zonaCritica).toBe(0)
    expect(l.so_prazo.metricas.zonaCritica).toBeGreaterThan(100)
    for (const linha of Object.values(l)) {
      expect(total(linha)).toBeCloseTo(total(l.so_prazo), 3)
      expect(linha.metricas.mesesAcimaDaCapacidade).toBeNull()
      expect(linha.metricas.horasAcimaDaCapacidade).toBeNull()
    }
  })

  it('sem capacidade, com dois meses de antecedência o pico cai mas não some', () => {
    const l = linhas('2026-12-01')
    expect(l.metodo_completo.metricas.picoHoras).toBeLessThan(
      l.metodo_sem_antecipacao.metricas.picoHoras,
    )
    expect(l.metodo_completo.metricas.picoHoras).toBeGreaterThan(900)
    expect(l.metodo_completo.emTriagem).toBe(l.so_prazo.emTriagem)
  })
})

describe('teto de capacidade', () => {
  it('quando cabe, nenhum mês passa do teto e antecipa menos que sem teto', () => {
    const comTeto = linhas('2026-10-01', 700)
    const semTeto = linhas('2026-10-01')
    expect(comTeto.metodo_sem_antecipacao.metricas.mesesAcimaDaCapacidade).toBe(3)
    expect(comTeto.metodo_completo.metricas).toMatchObject({
      mesesAcimaDaCapacidade: 0,
      horasAcimaDaCapacidade: 0,
      zonaCritica: 0,
    })
    expect(comTeto.metodo_completo.metricas.picoHoras).toBeLessThanOrEqual(700)
    // Outubro de 2026 (primeiro mês): com teto, só recebe o que não coube nos meses seguintes.
    expect(comTeto.metodo_completo.horas[0]).toBeLessThan(semTeto.metodo_completo.horas[0] ?? 0)
    // Meses que já cabiam não são mexidos.
    expect(comTeto.metodo_completo.horas.slice(6)).toEqual(
      comTeto.metodo_sem_antecipacao.horas.slice(6),
    )
  })

  it('quando não cabe, reparte o excesso em vez de desistir', () => {
    // De outubro a março há mais horas de trabalho do que seis meses de 600 h comportam.
    const l = linhas('2026-10-01', 600)
    const completo = l.metodo_completo.metricas
    expect(completo.horasAcimaDaCapacidade).toBeGreaterThan(0)
    expect(completo.horasAcimaDaCapacidade).toBeLessThan(150)
    expect(completo.picoHoras).toBeLessThan(640)
    expect(l.metodo_sem_antecipacao.metricas.horasAcimaDaCapacidade).toBeGreaterThan(1200)
  })

  it('com pouca antecedência, o teto não piora o resultado do nivelamento', () => {
    const comTeto = linhas('2026-12-01', 600).metodo_completo.metricas
    const semTeto = linhas('2026-12-01').metodo_completo.metricas
    expect(comTeto.picoHoras).toBeLessThanOrEqual(semTeto.picoHoras + 1)
    expect(comTeto.zonaCritica).toBe(semTeto.zonaCritica)
  })
})

describe('alerta de aglomeração', () => {
  function alertas(hoje: string, capacidade: number | null) {
    const comparacao = comparar(
      carteira,
      { ...PARAMETROS, capacidadeMensalHoras: capacidade },
      hoje,
    )
    if (!comparacao.ok) throw new Error(JSON.stringify(comparacao.erros))
    return comparacao
  }

  it('sem capacidade não há alerta', () => {
    expect(alertas('2026-10-01', null).aglomeracoes).toEqual([])
  })

  it('aponta os meses acima do teto e até quando começar a antecipar', () => {
    const { aglomeracoes } = alertas('2026-07-01', 700)
    expect(aglomeracoes.map((a) => a.mes)).toEqual(['2027-01', '2027-02', '2027-03'])
    expect(aglomeracoes[0]).toMatchObject({ horasPrevistas: 1192.8, horasAcima: 492.8 })
    for (const alerta of aglomeracoes) {
      expect(alerta.resolvida).toBe(true)
      expect(alerta.horasAcimaAposAntecipar).toBe(0)
      expect(alerta.atividadesAAntecipar).toBeGreaterThan(0)
      // Planejando em julho, a antecipação só precisa começar meses depois.
      expect((alerta.comecarAte ?? '') > '2026-08-31').toBe(true)
      expect((alerta.comecarAte ?? '') < alerta.mes).toBe(true)
    }
  })

  it('é igual em todas as estratégias', () => {
    const planos = (['so_prazo', 'metodo_completo'] as const).map((estrategia) =>
      planejar(carteira, { ...PARAMETROS, capacidadeMensalHoras: 700 }, '2026-10-01', estrategia),
    )
    const [a, c] = planos
    if (!a?.ok || !c?.ok) throw new Error('carteira recusada')
    expect(a.plano.aglomeracoes).toEqual(c.plano.aglomeracoes)
    expect(a.plano.aglomeracoes).toHaveLength(3)
  })

  it('quando já é tarde, diz quantas horas não cabem', () => {
    const { aglomeracoes } = alertas('2026-12-01', 600)
    expect(aglomeracoes.every((a) => !a.resolvida)).toBe(true)
    expect(aglomeracoes.find((a) => a.mes === '2027-01')?.horasAcimaAposAntecipar).toBeGreaterThan(
      300,
    )
  })
})
