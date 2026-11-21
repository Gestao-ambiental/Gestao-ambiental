import { describe, expect, it } from 'vitest'

import { condicaoDaConsultoriaNova, emBeta, type EntradaDaConsultoriaNova } from './acesso-pago'

const base: EntradaDaConsultoriaNova = {
  hoje: '2026-11-21',
  fimDoBeta: '2027-01-31',
  cnpj: '11.222.333/0001-81',
  operador: false,
  temConviteDoBeta: true,
  jaFoiGestao: false,
  emailJaUsouTeste: false,
  cnpjJaUsouTeste: false,
}

describe('condicaoDaConsultoriaNova', () => {
  it('no beta, com convite, nasce em beta e gasta o convite', () => {
    expect(condicaoDaConsultoriaNova(base)).toEqual({
      permitido: true,
      acesso: 'beta',
      usaConvite: true,
    })
  })

  it('no beta, sem convite, é recusada', () => {
    expect(condicaoDaConsultoriaNova({ ...base, temConviteDoBeta: false })).toEqual({
      permitido: false,
      erro: 'convite_do_beta_obrigatorio',
    })
  })

  it('o último dia do beta ainda é beta', () => {
    expect(emBeta('2027-01-31', '2027-01-31')).toBe(true)
    expect(emBeta('2027-02-01', '2027-01-31')).toBe(false)
  })

  it('depois do beta, sem convite, ganha o teste normal e não gasta convite', () => {
    expect(
      condicaoDaConsultoriaNova({ ...base, hoje: '2027-02-01', temConviteDoBeta: false }),
    ).toEqual({ permitido: true, acesso: 'teste', usaConvite: false })
  })

  it.each([
    ['jaFoiGestao', { jaFoiGestao: true }],
    ['emailJaUsouTeste', { emailJaUsouTeste: true }],
    ['cnpjJaUsouTeste', { cnpjJaUsouTeste: true }],
  ] as const)('%s: nasce sem teste, precisando de plano', (_, extra) => {
    expect(condicaoDaConsultoriaNova({ ...base, ...extra })).toEqual({
      permitido: true,
      acesso: 'sem_teste',
      usaConvite: true,
    })
    expect(condicaoDaConsultoriaNova({ ...base, ...extra, hoje: '2027-03-01' })).toEqual({
      permitido: true,
      acesso: 'sem_teste',
      usaConvite: false,
    })
  })

  it('o convite não dá segundo teste: sem convite no beta continua recusado', () => {
    expect(
      condicaoDaConsultoriaNova({ ...base, temConviteDoBeta: false, jaFoiGestao: true }),
    ).toEqual({ permitido: false, erro: 'convite_do_beta_obrigatorio' })
  })

  it('CNPJ vazio ou com dígito errado é recusado antes de tudo', () => {
    expect(condicaoDaConsultoriaNova({ ...base, cnpj: '  ' })).toEqual({
      permitido: false,
      erro: 'cnpj_obrigatorio',
    })
    expect(condicaoDaConsultoriaNova({ ...base, cnpj: '11.222.333/0001-82' })).toEqual({
      permitido: false,
      erro: 'cnpj_invalido',
    })
    expect(condicaoDaConsultoriaNova({ ...base, cnpj: '11.111.111/1111-11' })).toEqual({
      permitido: false,
      erro: 'cnpj_invalido',
    })
  })

  it('operador da Central não precisa de convite nem perde o teste', () => {
    expect(
      condicaoDaConsultoriaNova({
        ...base,
        operador: true,
        temConviteDoBeta: false,
        jaFoiGestao: true,
      }),
    ).toEqual({ permitido: true, acesso: 'beta', usaConvite: false })
  })
})
