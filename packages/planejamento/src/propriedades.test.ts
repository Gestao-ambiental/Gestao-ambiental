// Propriedades da especificação 0.1 ("Casos de referência"), conferidas em carteiras sintéticas
// geradas com semente fixa.

import { describe, expect, it } from 'vitest'
import { carteiraAleatoria, HOJE, itemDe, PARAMETROS, planoDe } from './apoio-de-teste'
import { paraDia } from './datas'
import { ESTRATEGIAS, type Plano } from './tipos'

const SEMENTES = Array.from({ length: 25 }, (_, i) => i + 1)
const dia = (data: string) => paraDia(data) ?? Number.NaN
const AVISOS_DE_INICIO_TARDIO = ['margem_nao_cabe', 'prazo_nao_cabe', 'inicio_fixo_tardio']

describe.each(SEMENTES)('carteira sintética %i', (semente) => {
  const { atividades } = carteiraAleatoria(semente)
  const totalDeHoras = atividades.reduce((soma, a) => soma + a.esforcoHoras, 0)
  const completo = planoDe(atividades, 'metodo_completo')
  const semAntecipacao = planoDe(atividades, 'metodo_sem_antecipacao')

  it.each(ESTRATEGIAS)('%s conserva o total de horas', (estrategia) => {
    const plano = planoDe(atividades, estrategia)
    const noHorizonte = plano.cargaMensal.reduce((soma, m) => soma + m.horas, 0)
    expect(noHorizonte + plano.metricas.horasForaDoHorizonte).toBeCloseTo(totalDeHoras, 3)
    expect(plano.itens.map((i) => i.atividadeId)).toEqual(atividades.map((a) => a.id))
  })

  it('no método completo, ninguém começa antes do possível nem depois do recomendado sem aviso', () => {
    for (const a of atividades) {
      const item = itemDe(completo, a.id)
      expect(dia(item.inicioPlanejado)).toBeGreaterThanOrEqual(dia(HOJE))
      if (a.inicioMaisCedo) {
        expect(dia(item.inicioPlanejado)).toBeGreaterThanOrEqual(dia(a.inicioMaisCedo))
      }
      if (dia(item.inicioPlanejado) > dia(item.inicioRecomendado)) {
        expect(item.avisos.some((aviso) => AVISOS_DE_INICIO_TARDIO.includes(aviso))).toBe(true)
      }
    }
  })

  it('o nivelamento nunca aumenta o pico, nunca atrasa e não move atividade fixa', () => {
    expect(completo.metricas.picoHoras).toBeLessThanOrEqual(semAntecipacao.metricas.picoHoras)
    for (const a of atividades) {
      const nivelada = itemDe(completo, a.id)
      const original = itemDe(semAntecipacao, a.id)
      expect(dia(nivelada.inicioPlanejado)).toBeLessThanOrEqual(dia(original.inicioPlanejado))
      expect(dia(nivelada.fimPlanejado)).toBeLessThanOrEqual(dia(original.fimPlanejado))
      expect(original.antecipadaDias).toBe(0)
      if (a.antecipabilidade === 'fixa') expect(nivelada).toEqual(original)
    }
    expect(completo.metricas.zonaCritica).toBeLessThanOrEqual(semAntecipacao.metricas.zonaCritica)
  })

  it('respeita as dependências em toda estratégia', () => {
    for (const estrategia of ESTRATEGIAS) {
      const plano = planoDe(atividades, estrategia)
      for (const a of atividades) {
        for (const dependencia of a.dependeDe ?? []) {
          const anterior = itemDe(plano, dependencia.id)
          expect(dia(itemDe(plano, a.id).inicioPlanejado)).toBeGreaterThanOrEqual(
            dia(anterior.fimPlanejado) + dependencia.defasagemDias,
          )
        }
      }
    }
  })

  it('com todas as margens em zero, (b) e (d) dão as mesmas posições', () => {
    const semMargem = {
      ...PARAMETROS,
      margemUnicaDias: 0,
      niveis: PARAMETROS.niveis.map((nivel) => ({ ...nivel, margemDias: 0 })),
    }
    const b = planoDe(atividades, 'folga_sem_gravidade', semMargem)
    const d = planoDe(atividades, 'metodo_sem_antecipacao', semMargem)
    expect(b.itens).toEqual(d.itens)
    expect(b.cargaMensal).toEqual(d.cargaMensal)
    for (const item of d.itens) expect(item.inicioRecomendado).toBe(item.inicioLimite)
  })

  it('a ordem das atividades na carteira não muda o resultado', () => {
    const invertida = planoDe([...atividades].reverse(), 'metodo_completo')
    const semItens = (plano: Plano) => ({ ...plano, itens: [] })
    expect(semItens(invertida)).toEqual(semItens(completo))
    expect([...invertida.itens].reverse()).toEqual(completo.itens)
  })

  it('a mesma entrada dá a mesma saída, byte a byte', () => {
    expect(JSON.stringify(planoDe(atividades, 'metodo_completo'))).toBe(JSON.stringify(completo))
  })
})
