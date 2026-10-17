import { describe, expect, it } from 'vitest'

import {
  consultoriaInicial,
  impedimentoDoVinculo,
  situacaoDoConvite,
  type VinculoResumo,
} from './acesso'

describe('situacaoDoConvite', () => {
  const agora = new Date('2026-10-12T15:00:00Z')

  it('pendente dentro da validade continua pendente', () => {
    expect(
      situacaoDoConvite({ situacao: 'pendente', expiraEm: '2026-10-15T12:00:00Z' }, agora),
    ).toBe('pendente')
  })

  it('pendente com a validade vencida aparece como expirado, inclusive no instante exato', () => {
    expect(
      situacaoDoConvite({ situacao: 'pendente', expiraEm: '2026-10-05T12:00:00Z' }, agora),
    ).toBe('expirado')
    expect(situacaoDoConvite({ situacao: 'pendente', expiraEm: agora.toISOString() }, agora)).toBe(
      'expirado',
    )
  })

  it('aceito e cancelado não expiram', () => {
    const vencido = '2026-10-01T00:00:00Z'
    expect(situacaoDoConvite({ situacao: 'aceito', expiraEm: vencido }, agora)).toBe('aceito')
    expect(situacaoDoConvite({ situacao: 'cancelado', expiraEm: vencido }, agora)).toBe('cancelado')
  })
})

describe('impedimentoDoVinculo', () => {
  const ana: VinculoResumo = { id: 'ana', papel: 'gestao', situacao: 'ativo' }
  const bruno: VinculoResumo = { id: 'bruno', papel: 'equipe', situacao: 'ativo' }
  const diego: VinculoResumo = { id: 'diego', papel: 'equipe', situacao: 'desligado' }
  const exGestao: VinculoResumo = { id: 'ex', papel: 'gestao', situacao: 'desligado' }

  it('a única Gestão ativa não passa para Equipe nem é desligada', () => {
    const equipe = [ana, bruno, exGestao]
    expect(impedimentoDoVinculo(equipe, 'ana', 'passar_para_equipe')).toBe('ultima_gestao')
    expect(impedimentoDoVinculo(equipe, 'ana', 'desligar')).toBe('ultima_gestao')
  })

  it('com outra Gestão ativa, a Gestão pode passar para Equipe ou ser desligada', () => {
    const equipe = [ana, { ...bruno, papel: 'gestao' as const }]
    expect(impedimentoDoVinculo(equipe, 'ana', 'passar_para_equipe')).toBeNull()
    expect(impedimentoDoVinculo(equipe, 'ana', 'desligar')).toBeNull()
  })

  it('Equipe pode ser promovida e desligada', () => {
    expect(impedimentoDoVinculo([ana, bruno], 'bruno', 'passar_para_gestao')).toBeNull()
    expect(impedimentoDoVinculo([ana, bruno], 'bruno', 'desligar')).toBeNull()
  })

  it('vínculo desligado não muda de papel; desligar de novo não é impedido', () => {
    expect(impedimentoDoVinculo([ana, diego], 'diego', 'passar_para_gestao')).toBe(
      'membro_desligado',
    )
    expect(impedimentoDoVinculo([ana, diego], 'diego', 'desligar')).toBeNull()
  })

  it('alvo desconhecido não tem impedimento (o banco decide)', () => {
    expect(impedimentoDoVinculo([ana], 'outro', 'desligar')).toBeNull()
  })
})

describe('consultoriaInicial', () => {
  const a = { consultoriaId: 'a' }
  const b = { consultoriaId: 'b' }

  it('com um vínculo ativo, a seleção é automática', () => {
    expect(consultoriaInicial([a], null)).toBe('a')
  })

  it('com mais de um e sem preferida, a pessoa escolhe', () => {
    expect(consultoriaInicial([a, b], null)).toBeNull()
  })

  it('a preferida vale enquanto for um vínculo ativo', () => {
    expect(consultoriaInicial([a, b], 'b')).toBe('b')
    expect(consultoriaInicial([a, b], 'c')).toBeNull()
    expect(consultoriaInicial([a], 'c')).toBe('a')
  })

  it('sem vínculo ativo não há consultoria', () => {
    expect(consultoriaInicial([], 'a')).toBeNull()
  })
})
