import { describe, expect, it } from 'vitest'

import {
  adicionarDias,
  adicionarMeses,
  dataCivil,
  dataEHoraNoFuso,
  diaDaSemana,
  diferencaEmDias,
  ehDataCivil,
  formatarDataCivil,
  hojeNoFuso,
  nomeDoDiaDaSemana,
  semanaDe,
} from './data-civil'

// O domínio não carrega tipos do Node; só este teste consulta o TZ definido pelo vitest.config.ts.
declare const process: { env: Record<string, string | undefined> }

describe('fuso da máquina', () => {
  it('a suíte roda no fuso pedido pelo projeto do Vitest (TZ)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ)
  })
})

describe('portados de tests/clock.test.mjs do protótipo', () => {
  // protótipo: tests/clock.test.mjs:14 (brasiliaNow → dataEHoraNoFuso com o fuso explícito)
  it('horário de Brasília: converte do UTC e vira o dia certo', () => {
    const fuso = 'America/Sao_Paulo'
    expect(dataEHoraNoFuso(new Date('2026-09-19T02:30:00Z'), fuso)).toEqual({
      data: '2026-09-18',
      hora: '23:30:00',
      iso: '2026-09-18T23:30:00',
    })
    expect(dataEHoraNoFuso(new Date('2026-09-19T03:00:00Z'), fuso).data).toBe('2026-09-19')
    expect(dataEHoraNoFuso(new Date('2026-12-31T23:59:59-03:00'), fuso).iso).toBe(
      '2026-12-31T23:59:59',
    )
    expect(dataEHoraNoFuso(new Date('2027-01-01T02:59:59Z'), fuso).data).toBe('2026-12-31')
    // sem horário de verão desde 2019: julho e janeiro usam o mesmo deslocamento
    expect(dataEHoraNoFuso(new Date('2026-07-01T12:00:00Z'), fuso).hora).toBe('09:00:00')
    expect(dataEHoraNoFuso(new Date('2026-01-01T12:00:00Z'), fuso).hora).toBe('09:00:00')
  })

  // protótipo: tests/clock.test.mjs:38 (weekRange → semanaDe, weekdayLabel → nomeDoDiaDaSemana)
  it('semana de segunda a domingo', () => {
    expect(semanaDe('2026-09-14')).toEqual(['2026-09-14', '2026-09-20'])
    expect(semanaDe('2026-09-20')).toEqual(['2026-09-14', '2026-09-20'])
    expect(semanaDe('2026-09-19')).toEqual(['2026-09-14', '2026-09-20'])
    expect(semanaDe('2026-10-01')).toEqual(['2026-09-28', '2026-10-04'])
    expect(nomeDoDiaDaSemana('2026-09-19')).toBe('sábado')
  })
})

describe('adicionarMeses: fim de mês e ano bissexto', () => {
  it('31/01 + 1 mês vai ao último dia de fevereiro', () => {
    expect(adicionarMeses('2027-01-31', 1)).toBe('2027-02-28') // não bissexto
    expect(adicionarMeses('2028-01-31', 1)).toBe('2028-02-29') // bissexto
  })

  it('29/02 + 12 meses: 28/02 em ano não bissexto, 29/02 em bissexto', () => {
    expect(adicionarMeses('2028-02-29', 12)).toBe('2029-02-28')
    expect(adicionarMeses('2028-02-29', 48)).toBe('2032-02-29')
  })

  it('séculos seguem a regra gregoriana (2100 não é bissexto, 2000 é)', () => {
    expect(adicionarMeses('2100-01-31', 1)).toBe('2100-02-28')
    expect(adicionarMeses('2000-01-31', 1)).toBe('2000-02-29')
  })

  it('o dia original é preservado quando existe no destino', () => {
    expect(adicionarMeses('2027-01-30', 2)).toBe('2027-03-30')
    expect(adicionarMeses('2026-08-31', 1)).toBe('2026-09-30')
  })

  it('atravessa a virada de ano para frente e para trás', () => {
    expect(adicionarMeses('2026-11-30', 3)).toBe('2027-02-28')
    expect(adicionarMeses('2027-03-31', -1)).toBe('2027-02-28')
    expect(adicionarMeses('2027-01-15', -13)).toBe('2025-12-15')
  })
})

describe('adicionarDias e diferencaEmDias', () => {
  it('soma e subtrai dias corridos atravessando mês, ano e 29/02', () => {
    expect(adicionarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(adicionarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(adicionarDias('2027-02-28', 1)).toBe('2027-03-01')
    expect(adicionarDias('2027-01-12', -120)).toBe('2026-09-14')
  })

  it('diferença é a − b, em dias corridos', () => {
    expect(diferencaEmDias('2026-09-19', '2026-08-20')).toBe(30)
    expect(diferencaEmDias('2026-08-20', '2026-09-19')).toBe(-30)
    expect(diferencaEmDias('2029-01-01', '2028-01-01')).toBe(366)
  })

  it('dia da semana bate com o calendário', () => {
    expect(diaDaSemana('1970-01-01')).toBe(4) // quinta
    expect(diaDaSemana('2026-09-19')).toBe(6) // sábado
    expect(diaDaSemana('1969-12-28')).toBe(0) // domingo, antes de 1970
  })
})

describe('validação e exibição', () => {
  it('aceita só datas civis existentes no formato AAAA-MM-DD', () => {
    expect(ehDataCivil('2028-02-29')).toBe(true)
    expect(ehDataCivil('2027-02-29')).toBe(false)
    expect(ehDataCivil('2026-02-30')).toBe(false)
    expect(ehDataCivil('2026-13-01')).toBe(false)
    expect(ehDataCivil('2026-1-5')).toBe(false)
    expect(ehDataCivil('12/01/2027')).toBe(false)
    expect(ehDataCivil(null)).toBe(false)
    expect(() => dataCivil('2026-02-30')).toThrow(/inválida/)
    expect(() => adicionarDias('2026-02-30', 1)).toThrow(/inválida/)
  })

  it('exibe como dd/mm/aaaa sem deslocar o dia pelo fuso', () => {
    expect(formatarDataCivil('2027-01-12')).toBe('12/01/2027')
    expect(formatarDataCivil('2026-12-31')).toBe('31/12/2026')
    expect(formatarDataCivil('')).toBe('')
    expect(formatarDataCivil(null)).toBe('')
  })

  it('"hoje" depende do fuso da consultoria, não do aparelho', () => {
    const instante = new Date('2026-09-19T01:00:00Z')
    expect(hojeNoFuso(instante, 'America/Sao_Paulo')).toBe('2026-09-18')
    expect(hojeNoFuso(instante, 'UTC')).toBe('2026-09-19')
    expect(hojeNoFuso(instante, 'America/Manaus')).toBe('2026-09-18')
  })
})
