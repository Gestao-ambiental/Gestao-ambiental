import { describe, expect, it } from 'vitest'

import {
  agruparPendencias,
  linhasDaMatrizLegal,
  type RequisitoDaMatriz,
  type RequisitoDoEmpreendimento,
} from './matriz-legal'

const conforme = {
  aplicavel: true,
  avaliacaoResultado: 'conforme' as const,
  avaliadaEm: '2026-11-10' as const,
  ultimaMudancaPublicadaEm: null,
  acaoPrazo: null,
}

function req(
  empreendimentoId: string,
  nome: string,
  extra: Partial<RequisitoDoEmpreendimento> = {},
): RequisitoDoEmpreendimento {
  return { ...conforme, empreendimentoId, empreendimentoNome: nome, ...extra }
}

describe('pendências de conformidade por empreendimento', () => {
  it('conta e ordena por ação atrasada, rever e não conforme; quem está em dia fica fora', () => {
    const pendencias = agruparPendencias(
      [
        req('a', 'Alfa', { avaliacaoResultado: 'nao_conforme' }),
        req('b', 'Beta', { acaoPrazo: '2026-11-01' }),
        req('b', 'Beta', { ultimaMudancaPublicadaEm: '2026-11-15T13:00:00Z' }),
        req('c', 'Gama'),
        req('d', 'Delta', { aplicavel: null }),
      ],
      '2026-11-20',
    )
    expect(pendencias.map((p) => p.empreendimentoNome)).toEqual(['Beta', 'Alfa', 'Delta'])
    expect(pendencias[0]).toMatchObject({ acaoAtrasada: 1, rever: 1, naoConforme: 0 })
    expect(pendencias[2]).toMatchObject({ semAvaliacao: 1 })
  })
})

describe('matriz legal', () => {
  const base: RequisitoDaMatriz = {
    ...conforme,
    normaTitulo: 'IN 2 · Combustíveis',
    dispositivo: null,
    justificativa: null,
    avaliadaPorNome: 'Ana Ribeiro',
    acaoDescricao: null,
    evidencias: 0,
    menorValidade: null,
  }

  it('escreve a situação, a avaliação, a ação e a evidência, com o urgente primeiro', () => {
    const linhas = linhasDaMatrizLegal(
      [
        { ...base, evidencias: 2, menorValidade: '2027-03-01' },
        {
          ...base,
          normaTitulo: 'CONSEMA 250/2024',
          dispositivo: 'art. 5º',
          avaliacaoResultado: 'nao_conforme',
          acaoDescricao: 'Trocar o filtro',
          acaoPrazo: '2026-11-01',
        },
        {
          ...base,
          normaTitulo: 'Lei 14.675/2009',
          aplicavel: false,
          justificativa: 'Não faz a etapa.',
        },
      ],
      '2026-11-20',
    )
    expect(linhas.map((l) => l.rotuloDaSituacao)).toEqual([
      'Ação atrasada',
      'Conforme',
      'Não se aplica',
    ])
    expect(linhas[0]).toMatchObject({
      norma: 'CONSEMA 250/2024 · art. 5º',
      acao: 'Trocar o filtro · até 01/11/2026',
    })
    expect(linhas[1]).toMatchObject({
      avaliacao: '10/11/2026 · Ana Ribeiro',
      evidencia: '2 · válida até 01/03/2027',
    })
    expect(linhas[2]?.avaliacao).toBe('Não faz a etapa.')
  })
})
