import type { DataCivil } from '@gestao-ambiental/domain'
import { describe, expect, it } from 'vitest'

import { estacoesDaRenovacao } from './trajeto-da-renovacao'

const d = (texto: string) => texto as DataCivil

describe('estações da linha de trajeto da renovação', () => {
  it('põe hoje entre as datas: o que passou é feito, hoje é atual, o resto é futuro', () => {
    const estacoes = estacoesDaRenovacao({
      inicio: d('2026-11-05'),
      limite: d('2026-12-05'),
      vencimento: d('2027-04-04'),
      protocoladoEm: null,
      hoje: d('2026-11-20'),
    })
    expect(estacoes.map((e) => [e.chave, e.estado, e.diasAteAProxima])).toEqual([
      ['inicio', 'feito', 15],
      ['hoje', 'atual', 15],
      ['limite', 'futuro', 120],
      ['vencimento', 'futuro', null],
    ])
  })

  it('a estação que cai hoje vira a atual, sem estação "hoje" a mais', () => {
    const estacoes = estacoesDaRenovacao({
      inicio: d('2026-11-05'),
      limite: d('2026-11-20'),
      vencimento: d('2027-03-20'),
      protocoladoEm: null,
      hoje: d('2026-11-20'),
    })
    expect(estacoes.map((e) => e.chave)).toEqual(['inicio', 'limite', 'vencimento'])
    expect(estacoes[1]).toMatchObject({ estado: 'atual', ehHoje: true })
  })

  it('com protocolo, a estação "Protocolada" entra na ordem das datas', () => {
    const estacoes = estacoesDaRenovacao({
      inicio: d('2026-08-20'),
      limite: d('2026-09-19'),
      vencimento: d('2027-01-17'),
      protocoladoEm: d('2026-09-10'),
      hoje: d('2026-11-20'),
    })
    expect(estacoes.map((e) => [e.chave, e.estado])).toEqual([
      ['inicio', 'feito'],
      ['protocolo', 'feito'],
      ['limite', 'feito'],
      ['hoje', 'atual'],
      ['vencimento', 'futuro'],
    ])
  })

  it('licença vencida: hoje fica depois do vencimento', () => {
    const estacoes = estacoesDaRenovacao({
      inicio: d('2026-01-01'),
      limite: d('2026-01-31'),
      vencimento: d('2026-05-31'),
      protocoladoEm: null,
      hoje: d('2026-11-20'),
    })
    expect(estacoes.at(-1)).toMatchObject({ chave: 'hoje', estado: 'atual', diasAteAProxima: null })
    expect(estacoes.slice(0, -1).every((e) => e.estado === 'feito')).toBe(true)
  })
})
