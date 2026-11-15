import { describe, expect, it } from 'vitest'

import { datasDaProposta, type MudancaDaProposta } from './validade-da-proposta'

const fuso = 'America/Sao_Paulo'

describe('datasDaProposta', () => {
  it('rascunho: a data é hoje no fuso da consultoria e a validade conta dias corridos', () => {
    // 01:30 UTC de 13/11 ainda é 12/11 em São Paulo.
    expect(
      datasDaProposta({
        situacao: 'rascunho',
        revisao: 1,
        historico: [],
        validadeDias: 30,
        agora: new Date('2026-11-13T01:30:00Z'),
        fuso,
      }),
    ).toEqual({ data: '2026-11-12', validaAte: '2026-12-12', enviada: false })
  })

  it('como no protótipo: enviada em 12/10/2026, 30 dias vão até 11/11/2026', () => {
    const historico: MudancaDaProposta[] = [
      { de: 'rascunho', para: 'enviada', revisao: 1, em: '2026-10-12T14:00:00Z' },
    ]
    expect(
      datasDaProposta({
        situacao: 'negociacao',
        revisao: 1,
        historico,
        validadeDias: 30,
        agora: new Date('2026-11-20T12:00:00Z'),
        fuso,
      }),
    ).toEqual({ data: '2026-10-12', validaAte: '2026-11-11', enviada: true })
  })

  it('o envio perto da meia-noite vale pelo dia no fuso, não no UTC', () => {
    const r = datasDaProposta({
      situacao: 'enviada',
      revisao: 1,
      historico: [{ de: 'rascunho', para: 'enviada', revisao: 1, em: '2026-10-13T02:10:00Z' }],
      validadeDias: 10,
      agora: new Date('2026-10-20T12:00:00Z'),
      fuso,
    })
    expect(r.data).toBe('2026-10-12')
    expect(r.validaAte).toBe('2026-10-22')
  })

  it('reaberta e enviada de novo: vale o envio da revisão atual', () => {
    const historico: MudancaDaProposta[] = [
      { de: 'rascunho', para: 'enviada', revisao: 2, em: '2026-11-05T15:00:00Z' },
      { de: 'enviada', para: 'rascunho', revisao: 2, em: '2026-11-03T15:00:00Z' },
      { de: 'rascunho', para: 'enviada', revisao: 1, em: '2026-10-01T15:00:00Z' },
    ]
    const r = datasDaProposta({
      situacao: 'enviada',
      revisao: 2,
      historico,
      validadeDias: 15,
      agora: new Date('2026-11-10T12:00:00Z'),
      fuso,
    })
    expect(r).toEqual({ data: '2026-11-05', validaAte: '2026-11-20', enviada: true })
  })

  it('aprovada direto do rascunho conta como a saída do rascunho', () => {
    const r = datasDaProposta({
      situacao: 'aprovada',
      revisao: 1,
      historico: [{ de: 'rascunho', para: 'aprovada', revisao: 1, em: '2026-11-02T12:00:00Z' }],
      validadeDias: 30,
      agora: new Date('2026-11-10T12:00:00Z'),
      fuso,
    })
    expect(r).toEqual({ data: '2026-11-02', validaAte: '2026-12-02', enviada: true })
  })

  it('sem registro de envio (dado antigo), cai em hoje', () => {
    const r = datasDaProposta({
      situacao: 'enviada',
      revisao: 1,
      historico: [],
      validadeDias: 30,
      agora: new Date('2026-11-10T12:00:00Z'),
      fuso,
    })
    expect(r).toEqual({ data: '2026-11-10', validaAte: '2026-12-10', enviada: false })
  })

  it('rascunho reaberto ignora o envio da revisão anterior', () => {
    const r = datasDaProposta({
      situacao: 'rascunho',
      revisao: 2,
      historico: [{ de: 'rascunho', para: 'enviada', revisao: 1, em: '2026-10-01T15:00:00Z' }],
      validadeDias: 30,
      agora: new Date('2026-11-10T12:00:00Z'),
      fuso,
    })
    expect(r.data).toBe('2026-11-10')
    expect(r.enviada).toBe(false)
  })

  it('validade inválida é erro', () => {
    expect(() =>
      datasDaProposta({
        situacao: 'rascunho',
        revisao: 1,
        historico: [],
        validadeDias: -1,
        agora: new Date('2026-11-10T12:00:00Z'),
        fuso,
      }),
    ).toThrow()
  })
})
