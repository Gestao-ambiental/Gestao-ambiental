import { describe, expect, it } from 'vitest'

import {
  DIAS_SEM_USO_PARA_ALERTA,
  MINUTOS_PARA_AGORA,
  classificarUltimoUso,
  diasDesde,
  ehModuloDeUso,
  moduloDaRota,
  podeRegistrarUso,
  precisaDeAlertaDeSemUso,
  rotuloDoAlertaDeSemUso,
  rotuloDoUltimoUso,
  usandoAgora,
} from './uso-da-plataforma'

const SP = 'America/Sao_Paulo'

describe('moduloDaRota', () => {
  it('licenças e prazos: visão da equipe, calendário, empreendimentos, ocorrências, acompanhamentos e cadastro', () => {
    for (const caminho of [
      '/',
      '/calendario',
      '/empreendimentos',
      '/empreendimentos/e1',
      '/ocorrencias/o1',
      '/acompanhamentos',
      '/renovacoes/i1',
      '/licencas/nova',
      '/licencas/i1/prazos',
      '/residuos',
      '/residuos/conferencia',
      '/empreendimentos/e1/residuos',
    ]) {
      expect(moduloDaRota(caminho), caminho).toBe('licencas_e_prazos')
    }
  })

  it('orçamentos: lista, orçamento, primeiros passos e custos', () => {
    for (const caminho of [
      '/orcamentos',
      '/orcamentos/o1',
      '/orcamentos/primeiros-passos',
      '/configuracoes/custos',
    ]) {
      expect(moduloDaRota(caminho), caminho).toBe('orcamentos')
    }
  })

  it('propostas: a proposta pronta e os dados da proposta', () => {
    expect(moduloDaRota('/orcamentos/o1/proposta')).toBe('propostas')
    expect(moduloDaRota('/configuracoes/proposta')).toBe('propostas')
  })

  it('equipe e conta: equipe, perfil e segurança', () => {
    expect(moduloDaRota('/configuracoes/equipe')).toBe('equipe_e_conta')
    expect(moduloDaRota('/perfil')).toBe('equipe_e_conta')
    expect(moduloDaRota('/seguranca')).toBe('equipe_e_conta')
  })

  it('ignora busca e âncora no caminho', () => {
    expect(moduloDaRota('/orcamentos?situacao=enviado')).toBe('orcamentos')
    expect(moduloDaRota('/calendario#hoje')).toBe('licencas_e_prazos')
  })

  it('não registra na central, nas telas sem consultoria nem em caminho desconhecido', () => {
    for (const caminho of [
      '/admin',
      '/admin/consultorias/c1',
      '/entrar',
      '/escolher-consultoria',
      '/criar-consultoria',
      '/convite',
      '/configuracoes',
      '/qualquer-coisa',
    ]) {
      expect(moduloDaRota(caminho), caminho).toBeNull()
    }
  })

  it('reconhece só as quatro áreas', () => {
    expect(ehModuloDeUso('orcamentos')).toBe(true)
    expect(ehModuloDeUso('ia')).toBe(false)
    expect(ehModuloDeUso(null)).toBe(false)
  })
})

describe('classificarUltimoUso', () => {
  const agora = new Date('2026-11-14T13:00:00Z') // 10:00 em São Paulo

  it('sem registro: nunca', () => {
    expect(classificarUltimoUso(null, agora, SP)).toEqual({ tipo: 'nunca' })
  })

  it('até 15 minutos atrás: agora (limite exclusivo)', () => {
    expect(MINUTOS_PARA_AGORA).toBe(15)
    expect(classificarUltimoUso('2026-11-14T12:46:00Z', agora, SP)).toEqual({ tipo: 'agora' })
    expect(classificarUltimoUso('2026-11-14T12:45:00Z', agora, SP)).toEqual({ tipo: 'hoje' })
  })

  it('relógio do servidor adiantado (instante no futuro) também é agora', () => {
    expect(usandoAgora('2026-11-14T13:02:00Z', agora)).toBe(true)
  })

  it('mesmo dia civil no fuso: hoje', () => {
    // 00:10 em São Paulo de 14/11 (03:10 UTC).
    expect(classificarUltimoUso('2026-11-14T03:10:00Z', agora, SP)).toEqual({ tipo: 'hoje' })
  })

  it('conta dias civis no fuso da consultoria, não em UTC nem em 24 h', () => {
    // 23:50 de 13/11 em São Paulo (02:50 UTC de 14/11): em UTC seria "hoje"; no fuso é ontem.
    expect(classificarUltimoUso('2026-11-14T02:50:00Z', agora, SP)).toEqual({
      tipo: 'dias',
      dias: 1,
    })
    expect(classificarUltimoUso('2026-10-31T15:00:00Z', agora, SP)).toEqual({
      tipo: 'dias',
      dias: 14,
    })
  })

  it('rótulos', () => {
    expect(rotuloDoUltimoUso({ tipo: 'nunca' })).toBe('Nunca')
    expect(rotuloDoUltimoUso({ tipo: 'agora' })).toBe('Agora')
    expect(rotuloDoUltimoUso({ tipo: 'hoje' })).toBe('Hoje')
    expect(rotuloDoUltimoUso({ tipo: 'dias', dias: 1 })).toBe('Há 1 dia')
    expect(rotuloDoUltimoUso({ tipo: 'dias', dias: 9 })).toBe('Há 9 dias')
  })
})

describe('precisaDeAlertaDeSemUso', () => {
  const agora = new Date('2026-11-14T13:00:00Z')
  const base = {
    pessoasAtivas: 3,
    ultimoUsoEm: null,
    criadaEm: '2026-09-01T12:00:00Z',
    arquivada: false,
  }

  it('o limiar padrão é 14 dias', () => {
    expect(DIAS_SEM_USO_PARA_ALERTA).toBe(14)
  })

  it('com uso há mais de 14 dias: alerta; há menos: não', () => {
    expect(precisaDeAlertaDeSemUso({ ...base, ultimoUsoEm: '2026-10-30T12:59:00Z' }, agora)).toBe(
      true,
    )
    expect(precisaDeAlertaDeSemUso({ ...base, ultimoUsoEm: '2026-10-31T13:00:00Z' }, agora)).toBe(
      false,
    )
    expect(precisaDeAlertaDeSemUso({ ...base, ultimoUsoEm: '2026-11-10T12:00:00Z' }, agora)).toBe(
      false,
    )
  })

  it('nunca usou: alerta só se foi criada há mais de 14 dias', () => {
    expect(precisaDeAlertaDeSemUso(base, agora)).toBe(true)
    expect(precisaDeAlertaDeSemUso({ ...base, criadaEm: '2026-11-10T12:00:00Z' }, agora)).toBe(
      false,
    )
  })

  it('sem pessoas ativas ou arquivada: nunca alerta', () => {
    expect(precisaDeAlertaDeSemUso({ ...base, pessoasAtivas: 0 }, agora)).toBe(false)
    expect(precisaDeAlertaDeSemUso({ ...base, arquivada: true }, agora)).toBe(false)
  })

  it('aceita outro limiar', () => {
    expect(
      precisaDeAlertaDeSemUso({ ...base, ultimoUsoEm: '2026-11-04T12:00:00Z' }, agora, 7),
    ).toBe(true)
  })

  it('rótulo do alerta', () => {
    expect(
      rotuloDoAlertaDeSemUso({ ultimoUsoEm: '2026-10-25T12:00:00Z', criadaEm: '' }, agora),
    ).toBe('Sem uso há 20 dias')
    expect(
      rotuloDoAlertaDeSemUso({ ultimoUsoEm: null, criadaEm: '2026-10-15T12:00:00Z' }, agora),
    ).toBe('Nunca usou · criada há 30 dias')
    expect(diasDesde('2026-11-13T12:00:00Z', agora)).toBe(1)
    expect(diasDesde('2026-11-15T12:00:00Z', agora)).toBe(0)
  })
})

describe('podeRegistrarUso', () => {
  const agora = Date.parse('2026-11-14T13:00:00Z')

  it('primeira vez registra', () => {
    expect(podeRegistrarUso(undefined, agora)).toBe(true)
  })

  it('só de novo depois de 5 minutos', () => {
    expect(podeRegistrarUso(agora - 4 * 60_000, agora)).toBe(false)
    expect(podeRegistrarUso(agora - 5 * 60_000, agora)).toBe(true)
  })
})
