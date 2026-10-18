import { describe, expect, it } from 'vitest'

import {
  ErroDePrazo,
  datasDoPrazo,
  descreverRecorrencia,
  proximaValidade,
  situacaoDaLicenca,
  situacaoMaisUrgente,
  sugerirPrimeiraData,
  type LicencaResumo,
} from './prazo'

const prazos = (lista: { prazo: string }[]) => lista.map((d) => d.prazo)

function codigo(f: () => unknown): string {
  try {
    f()
  } catch (erro) {
    return erro instanceof ErroDePrazo ? erro.codigo : 'outro'
  }
  return 'nenhum'
}

// Os mesmos casos de supabase/tests/100_cadastro_de_licenca.test.sql (private.datas_do_prazo).
describe('datasDoPrazo (espelho do banco)', () => {
  it('mensal a partir de 31/01 respeita o fim de fevereiro e volta a 31', () => {
    expect(
      prazos(datasDoPrazo({ recorrencia: 'mensal', primeiraData: '2024-01-31' }, '2024-05-31')),
    ).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31'])
  })

  it('29/02 anual só repete 29/02 em ano bissexto', () => {
    expect(
      prazos(datasDoPrazo({ recorrencia: 'anual', primeiraData: '2024-02-29' }, '2028-03-01')),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })

  it('a cada 45 dias corridos inclui a validade quando a última entrega cai nela', () => {
    expect(
      datasDoPrazo(
        { recorrencia: 'personalizada', unidade: 'dia', intervalo: 45, primeiraData: '2023-03-31' },
        '2023-06-29',
      ),
    ).toEqual([
      { ciclo: 1, prazo: '2023-03-31' },
      { ciclo: 2, prazo: '2023-05-15' },
      { ciclo: 3, prazo: '2023-06-29' },
    ])
  })

  it('contínua não gera entrega; única e na renovação geram uma', () => {
    expect(datasDoPrazo({ recorrencia: 'continua' }, '2030-01-01')).toEqual([])
    expect(
      datasDoPrazo({ recorrencia: 'na_renovacao', primeiraData: '2026-10-18' }, '2027-02-15'),
    ).toEqual([{ ciclo: 1, prazo: '2026-10-18' }])
    expect(datasDoPrazo({ recorrencia: 'unica', primeiraData: '2023-06-30' }, null)).toHaveLength(1)
  })

  it('erros com os mesmos códigos do banco', () => {
    expect(
      codigo(() =>
        datasDoPrazo({ recorrencia: 'mensal', primeiraData: '1900-01-01' }, '2100-01-01'),
      ),
    ).toBe('ocorrencias_demais')
    expect(
      codigo(() =>
        datasDoPrazo({ recorrencia: 'anual', primeiraData: '2028-01-01' }, '2027-01-01'),
      ),
    ).toBe('primeira_data_apos_validade')
    expect(codigo(() => datasDoPrazo({ recorrencia: 'unica' }, '2027-01-01'))).toBe(
      'primeira_data_obrigatoria',
    )
    expect(
      codigo(() =>
        datasDoPrazo({ recorrencia: 'personalizada', primeiraData: '2024-01-01' }, '2027-01-01'),
      ),
    ).toBe('intervalo_invalido')
    expect(
      codigo(() => datasDoPrazo({ recorrencia: 'anual', primeiraData: '2024-01-01' }, null)),
    ).toBe('validade_obrigatoria')
  })

  it('aceita até 1.200 entregas', () => {
    expect(
      datasDoPrazo(
        { recorrencia: 'personalizada', unidade: 'dia', intervalo: 1, primeiraData: '2024-01-01' },
        '2027-04-14',
      ),
    ).toHaveLength(1200)
  })
})

describe('sugerirPrimeiraData', () => {
  it('periódica sugere a referência mais um intervalo (Protótipo 13: trimestral desde a assinatura)', () => {
    expect(
      sugerirPrimeiraData({ recorrencia: 'trimestral' }, '2023-02-14', '2027-02-15', 'LAO'),
    ).toBe('2023-05-14')
    expect(
      sugerirPrimeiraData(
        { recorrencia: 'personalizada', unidade: 'dia', intervalo: 45 },
        '2023-02-14',
        null,
        null,
      ),
    ).toBe('2023-03-31')
  })

  it('na renovação de LAO sugere o limite de protocolo; de outro tipo, nada', () => {
    expect(sugerirPrimeiraData({ recorrencia: 'na_renovacao' }, null, '2027-02-15', 'LAO')).toBe(
      '2026-10-18',
    )
    expect(
      sugerirPrimeiraData({ recorrencia: 'na_renovacao' }, null, '2027-02-15', 'AuA'),
    ).toBeNull()
  })

  it('sem base não inventa data', () => {
    expect(
      sugerirPrimeiraData({ recorrencia: 'unica' }, '2023-02-14', '2027-02-15', 'LAO'),
    ).toBeNull()
    expect(
      sugerirPrimeiraData({ recorrencia: 'continua' }, '2023-02-14', '2027-02-15', 'LAO'),
    ).toBeNull()
    expect(sugerirPrimeiraData({ recorrencia: 'anual' }, null, '2027-02-15', 'LAO')).toBeNull()
    expect(
      sugerirPrimeiraData({ recorrencia: 'anual' }, '2026-06-01', '2027-02-15', 'LAO'),
    ).toBeNull()
  })
})

describe('descreverRecorrencia', () => {
  it('nomeia presets e personalizada', () => {
    expect(descreverRecorrencia({ recorrencia: 'trimestral' })).toBe('Trimestral')
    expect(descreverRecorrencia({ recorrencia: 'na_renovacao' })).toBe('Na renovação')
    expect(
      descreverRecorrencia({ recorrencia: 'personalizada', unidade: 'dia', intervalo: 45 }),
    ).toBe('A cada 45 dias')
    expect(
      descreverRecorrencia({ recorrencia: 'personalizada', unidade: 'mes', intervalo: 2 }),
    ).toBe('A cada 2 meses')
  })
})

describe('situação da licença', () => {
  const lao = (
    validade: LicencaResumo['validade'],
    situacao: 'ativo' | 'rascunho' = 'ativo',
  ): LicencaResumo => ({ situacao, validade, sigla: 'LAO' })

  it('rascunho, sem validade, vencida e vigente', () => {
    expect(situacaoDaLicenca(lao('2027-02-15', 'rascunho'), '2026-10-12')).toEqual({
      tipo: 'rascunho',
    })
    expect(situacaoDaLicenca(lao(null), '2026-10-12')).toEqual({ tipo: 'sem_validade' })
    expect(situacaoDaLicenca(lao('2026-06-30'), '2026-10-12')).toEqual({ tipo: 'vencida' })
    expect(situacaoDaLicenca(lao('2028-03-14'), '2026-10-12')).toEqual({ tipo: 'vigente' })
  })

  it('LAO na preparação: protocolo em N dias até o limite (Protótipo 09: 15/02/2027 em 12/10 → 6 dias)', () => {
    expect(situacaoDaLicenca(lao('2027-02-15'), '2026-10-12')).toEqual({
      tipo: 'protocolo',
      dias: 6,
    })
    expect(situacaoDaLicenca(lao('2027-02-15'), '2026-10-19')).toEqual({
      tipo: 'protocolo_atrasado',
    })
  })

  it('a regra dos 120 dias não vale para outros tipos', () => {
    expect(
      situacaoDaLicenca({ situacao: 'ativo', validade: '2027-02-15', sigla: 'AuA' }, '2026-10-12'),
    ).toEqual({ tipo: 'vigente' })
  })

  it('a carteira mostra a mais urgente e a próxima validade das ativas', () => {
    const licencas = [lao('2028-03-14'), lao('2027-02-15'), lao(null, 'rascunho')]
    expect(situacaoMaisUrgente(licencas, '2026-10-12')).toEqual({ tipo: 'protocolo', dias: 6 })
    expect(situacaoMaisUrgente([lao('2028-03-14'), lao('2026-06-30')], '2026-10-12')).toEqual({
      tipo: 'vencida',
    })
    expect(situacaoMaisUrgente([], '2026-10-12')).toBeNull()
    expect(proximaValidade(licencas)).toBe('2027-02-15')
  })
})
