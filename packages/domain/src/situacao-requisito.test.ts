import { describe, expect, it } from 'vitest'

import {
  ROTULO_DA_SITUACAO_DO_REQUISITO,
  requisitoPedeAtencao,
  situacaoDoRequisito,
  type RequisitoParaSituacao,
} from './situacao-requisito'

const avaliado: RequisitoParaSituacao = {
  aplicavel: true,
  avaliacaoResultado: 'conforme',
  avaliadaEm: '2026-11-10',
  ultimaMudancaPublicadaEm: null,
  acaoPrazo: null,
}

describe('situação do requisito legal', () => {
  it('sem decisão é sugerido; decidido que não se aplica fica assim', () => {
    expect(situacaoDoRequisito({ ...avaliado, aplicavel: null }, '2026-11-20')).toBe('sugerido')
    expect(situacaoDoRequisito({ ...avaliado, aplicavel: false }, '2026-11-20')).toBe(
      'nao_se_aplica',
    )
  })

  it('aplicável sem avaliação é não avaliado', () => {
    expect(
      situacaoDoRequisito(
        { ...avaliado, avaliacaoResultado: null, avaliadaEm: null },
        '2026-11-20',
      ),
    ).toBe('nao_avaliado')
  })

  it('devolve o resultado da última avaliação', () => {
    expect(situacaoDoRequisito(avaliado, '2026-11-20')).toBe('conforme')
    expect(
      situacaoDoRequisito({ ...avaliado, avaliacaoResultado: 'nao_conforme' }, '2026-11-20'),
    ).toBe('nao_conforme')
  })

  it('norma com mudança publicada depois da avaliação pede revisão', () => {
    expect(
      situacaoDoRequisito(
        { ...avaliado, ultimaMudancaPublicadaEm: '2026-11-15T13:00:00Z' },
        '2026-11-20',
      ),
    ).toBe('rever')
  })

  it('mudança antes da avaliação não pede revisão', () => {
    expect(
      situacaoDoRequisito(
        { ...avaliado, ultimaMudancaPublicadaEm: '2026-11-09T13:00:00Z' },
        '2026-11-20',
      ),
    ).toBe('conforme')
  })

  it('a data da mudança é a do fuso da consultoria', () => {
    // 01:00 UTC de 10/11 ainda é 09/11 em São Paulo: antes da avaliação de 10/11.
    const mudanca = { ...avaliado, ultimaMudancaPublicadaEm: '2026-11-10T01:00:00Z' }
    expect(situacaoDoRequisito(mudanca, '2026-11-20')).toBe('conforme')
    // Em UTC é o mesmo dia da avaliação: mudança no mesmo dia pede revisão.
    expect(situacaoDoRequisito(mudanca, '2026-11-20', 'UTC')).toBe('rever')
  })

  it('ação com prazo vencido vem antes do resultado, depois de rever', () => {
    expect(situacaoDoRequisito({ ...avaliado, acaoPrazo: '2026-11-19' }, '2026-11-20')).toBe(
      'acao_atrasada',
    )
    expect(situacaoDoRequisito({ ...avaliado, acaoPrazo: '2026-11-20' }, '2026-11-20')).toBe(
      'conforme',
    )
    expect(
      situacaoDoRequisito(
        { ...avaliado, acaoPrazo: '2026-11-01', ultimaMudancaPublicadaEm: '2026-11-15T13:00:00Z' },
        '2026-11-20',
      ),
    ).toBe('rever')
  })

  it('cada situação tem rótulo próprio e as que pedem atenção são as pendentes', () => {
    const rotulos = Object.values(ROTULO_DA_SITUACAO_DO_REQUISITO)
    expect(new Set(rotulos).size).toBe(rotulos.length)
    expect(requisitoPedeAtencao('rever')).toBe(true)
    expect(requisitoPedeAtencao('sugerido')).toBe(true)
    expect(requisitoPedeAtencao('conforme')).toBe(false)
    expect(requisitoPedeAtencao('nao_se_aplica')).toBe(false)
  })
})
