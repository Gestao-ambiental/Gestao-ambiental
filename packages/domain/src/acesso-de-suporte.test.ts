import { describe, expect, it } from 'vitest'

import {
  CATEGORIAS_DE_EMERGENCIA,
  DURACAO_DA_EMERGENCIA_HORAS,
  DURACOES_DE_SUPORTE_HORAS,
  ROTULO_DA_CATEGORIA_DE_EMERGENCIA,
  ehCategoriaDeEmergencia,
  ehDuracaoDeSuporte,
  rotuloDaDuracaoDeSuporte,
  rotuloDoFimDoSuporte,
  suporteValendo,
} from './acesso-de-suporte'

const SP = 'America/Sao_Paulo'

describe('durações e categorias do acesso de suporte (Termos §13)', () => {
  it('a Gestão autoriza 2, 24 ou 48 horas; nunca mais que 48', () => {
    expect(DURACOES_DE_SUPORTE_HORAS).toEqual([2, 24, 48])
    expect(Math.max(...DURACOES_DE_SUPORTE_HORAS)).toBe(48)
    expect(ehDuracaoDeSuporte(24)).toBe(true)
    expect(ehDuracaoDeSuporte(49)).toBe(false)
    expect(ehDuracaoDeSuporte('2')).toBe(false)
    expect(rotuloDaDuracaoDeSuporte(2)).toBe('2 horas')
  })

  it('emergência: 2 horas e só as três categorias dos termos', () => {
    expect(DURACAO_DA_EMERGENCIA_HORAS).toBe(2)
    expect(CATEGORIAS_DE_EMERGENCIA.map((c) => ROTULO_DA_CATEGORIA_DE_EMERGENCIA[c])).toEqual([
      'Incidente de segurança',
      'Falha grave que impede o uso',
      'Ordem legal ou judicial',
    ])
    expect(ehCategoriaDeEmergencia('falha_grave')).toBe(true)
    expect(ehCategoriaDeEmergencia('curiosidade')).toBe(false)
    expect(ehCategoriaDeEmergencia(null)).toBe(false)
  })
})

describe('suporteValendo', () => {
  it('vale enquanto agora é antes do fim previsto', () => {
    const fim = '2026-11-14T17:30:00Z'
    expect(suporteValendo(fim, new Date('2026-11-14T17:29:59Z'))).toBe(true)
    expect(suporteValendo(fim, new Date('2026-11-14T17:30:00Z'))).toBe(false)
    expect(suporteValendo(fim, new Date('2026-11-15T00:00:00Z'))).toBe(false)
  })
})

describe('rotuloDoFimDoSuporte', () => {
  it('no mesmo dia, só a hora no fuso da consultoria', () => {
    // 17:30Z = 14:30 em São Paulo (UTC-3)
    expect(rotuloDoFimDoSuporte('2026-11-14T17:30:00Z', SP, new Date('2026-11-14T15:30:00Z'))).toBe(
      'termina às 14:30',
    )
  })

  it('em outro dia, a data dd/mm/aaaa e a hora', () => {
    expect(rotuloDoFimDoSuporte('2026-11-16T17:30:00Z', SP, new Date('2026-11-14T15:30:00Z'))).toBe(
      'termina em 16/11/2026 às 14:30',
    )
  })

  it('o dia é o do fuso da consultoria, não o do UTC nem o do aparelho', () => {
    // 01:00Z do dia 15 ainda é 22:00 do dia 14 em São Paulo: mesmo dia de agora (20:00 do dia 14).
    expect(rotuloDoFimDoSuporte('2026-11-15T01:00:00Z', SP, new Date('2026-11-14T23:00:00Z'))).toBe(
      'termina às 22:00',
    )
  })
})
