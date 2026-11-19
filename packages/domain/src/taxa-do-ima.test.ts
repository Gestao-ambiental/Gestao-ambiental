import { describe, expect, it } from 'vitest'

import { CATALOGO_CONSEMA_250 } from './catalogo-consema-250'
import { DADOS_DO_SIMULADOR_IMA, INSTRUCOES_NORMATIVAS_IMA } from './dados-simulador-ima'
import {
  INSTRUCAO_NORMATIVA_GERAL,
  TABELA_02,
  TABELA_03,
  TAXA_DA_AUA,
  TAXA_DA_AUA_SUINOCULTURA,
  TOTAIS_DA_TABELA_02,
  TOTAIS_DA_TABELA_03,
  calcularTaxaDoIma,
  informacoesDoIma,
  type TaxaDoIma,
} from './taxa-do-ima'
import { enquadrarAtividade, type Medidas } from './triagem-licenciamento'

const atividade = (codigo: string) => {
  const a = CATALOGO_CONSEMA_250.atividades.find((x) => x.codigo === codigo)
  if (!a) throw new Error(`atividade ${codigo} não está no catálogo`)
  return a
}

function taxa(codigo: string, medidas: Medidas): TaxaDoIma {
  const a = atividade(codigo)
  const r = enquadrarAtividade(a, medidas)
  if (r.tipo !== 'enquadrada') throw new Error(`${codigo} não enquadrou: ${r.tipo}`)
  return calcularTaxaDoIma(a, r.faixa, medidas)
}

function licencas(t: TaxaDoIma) {
  if (t.tipo !== 'licencas') throw new Error(`esperava licenças, veio ${t.tipo}`)
  return t
}

describe('tabelas do Decreto 421/2023 transcritas', () => {
  it('na Tabela 02, LAP + LAI + LAO bate com o total publicado (arredondamento de até 1 centavo)', () => {
    for (const [classe, [lap, lai, lao]] of Object.entries(TABELA_02)) {
      const total = TOTAIS_DA_TABELA_02[classe as keyof typeof TOTAIS_DA_TABELA_02]
      expect(Math.abs(lap + lai + lao - total), classe).toBeLessThanOrEqual(1)
    }
  })

  it('na Tabela 03 também, menos a LAI de III-A, que está publicada fora do total', () => {
    for (const [classe, [lap, lai, lao]] of Object.entries(TABELA_03)) {
      const total = TOTAIS_DA_TABELA_03[classe as keyof typeof TOTAIS_DA_TABELA_03]
      const diferenca = Math.abs(lap + lai + lao - total)
      if (classe === 'III-A') expect(diferenca).toBe(124646)
      else expect(diferenca, classe).toBeLessThanOrEqual(1)
    }
  })

  it('a taxa cresce com a classe na Tabela 02', () => {
    const totais = Object.values(TOTAIS_DA_TABELA_02)
    expect([...totais].sort((a, b) => a - b)).toEqual(totais)
  })
})

describe('dados do simulador do IMA', () => {
  it('cobrem todas as atividades da 250, menos as antenas, que o simulador não lista', () => {
    const fora = CATALOGO_CONSEMA_250.atividades
      .map((a) => a.codigo)
      .filter((c) => !(c in DADOS_DO_SIMULADOR_IMA))
    expect(fora).toEqual(['34.16.00', '34.16.10'])
  })

  it('toda IN citada tem título e a IN 00 de diretrizes gerais existe', () => {
    for (const [codigo, d] of Object.entries(DADOS_DO_SIMULADOR_IMA)) {
      expect(INSTRUCOES_NORMATIVAS_IMA[d.instrucaoNormativa], codigo).toBeDefined()
    }
    expect(INSTRUCAO_NORMATIVA_GERAL?.titulo).toMatch(/DIRETRIZES GERAIS/)
  })

  it('informacoesDoIma traz a IN com link, a TFASC e a divergência de potencial', () => {
    const pintura = informacoesDoIma(atividade('12.80.10'))
    // O simulador aponta a usinagem com pintura para a IN 19, que o site do IMA marca como revogada.
    expect(pintura.instrucaoNormativa?.numero).toBe(19)
    expect(pintura.instrucaoNormativa?.revogada).toBe(true)
    expect(pintura.instrucaoNormativa?.titulo).toBe(
      'SERVIÇO INDUSTRIAL DE USINAGEM, SOLDAS E SEMELHANTES',
    )
    expect(informacoesDoIma(atividade('11.30.02')).instrucaoNormativa).toMatchObject({
      numero: 4,
      revogada: false,
      url: 'https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/4',
    })
    expect(pintura.tfasc).toBe(true)
    expect(pintura.potencialDivergente).toBeNull()

    // O simulador ainda usa G para fabricação de papel; a 250 consolidada diz M.
    expect(informacoesDoIma(atividade('17.21.00')).potencialDivergente).toBe('G')
    expect(informacoesDoIma(atividade('34.16.00'))).toEqual({
      instrucaoNormativa: null,
      tfasc: null,
      potencialDivergente: null,
    })
  })
})

describe('calcularTaxaDoIma', () => {
  it('trifásica pela Tabela 02: classe porte,potencial e as três fases', () => {
    // 12.80.10 (usinagem com pintura), potencial M; AU(3) = 0,2312 ha cai no porte médio.
    const t = licencas(taxa('12.80.10', { 'AU(3)': 0.2312 }))
    expect(t.origem).toBe('tabela_02')
    expect(t.classe).toBe('M,M')
    expect(t.fases).toEqual([
      { fase: 'LAP', centavos: 112972 },
      { fase: 'LAI', centavos: 281036 },
      { fase: 'LAO', centavos: 562079 },
    ])
    expect(t.totalCentavos).toBe(956087)
  })

  it('porte mínimo vira AuA, com o valor da suinocultura nos códigos 01.54', () => {
    expect(taxa('01.54.00', { CmáxC: 100 })).toEqual({
      tipo: 'autorizacao',
      centavos: TAXA_DA_AUA_SUINOCULTURA,
      item: '8.1',
    })
    expect(taxa('00.30.03', {})).toEqual({ tipo: 'autorizacao', centavos: TAXA_DA_AUA, item: '8' })
  })

  it('suinocultura licenciada pela fórmula do item 13, com fator de cada fase', () => {
    // Terminação com 1.000 cabeças: Pr = 24,93 + 0,11 × 1.000 = 134,93.
    const t = licencas(taxa('01.54.00', { CmáxC: 1000 }))
    expect(t.origem).toBe('formula')
    expect(t.formula).toBe('Pr = 24,93 + 0,11 × NC')
    expect(t.fases).toEqual([
      { fase: 'LAP', centavos: 13493 },
      { fase: 'LAI', centavos: 20240 },
      { fase: 'LAO', centavos: 16866 },
    ])
  })

  it('fórmula com parâmetro diferente avisa da premissa; sem fórmula no decreto, não inventa', () => {
    const camarao = licencas(taxa('03.32.00', { LA: 10 }))
    expect(camarao.avisos.join(' ')).toMatch(/lâmina d’água/)
    expect(taxa('01.54.04', { CmáxC: 5000 })).toEqual({
      tipo: 'sem_valor',
      motivo: 'sem_formula',
      parametro: null,
    })
  })

  it('atividade da Tabela 03 usa a classe I-A a III-B', () => {
    // 01.70.10 (pequeno porte de animais confinados) está na Tabela 03 no simulador.
    expect(DADOS_DO_SIMULADOR_IMA['01.70.10']?.tabela).toBe(3)
    const a = atividade('01.70.10')
    const faixa = a.faixas.find((f) => f.modalidade === 'trifasica' && f.porte === 'grande')
    if (!faixa) throw new Error('01.70.10 sem porte grande')
    const t = licencas(calcularTaxaDoIma(a, faixa, {}))
    expect(t.origem).toBe('tabela_03')
    expect(t.classe).toMatch(/^G,[PMG] \(classe (II-A|III-A|III-B)\)$/)
  })

  it('"só LAO" cobra só a LAO; EIA avisa do custo por hora técnica', () => {
    const a = atividade('53.20.20')
    const faixa = a.faixas.find((f) => f.modalidade === 'LAO')
    if (!faixa) throw new Error('53.20.20 sem faixa LAO')
    expect(licencas(calcularTaxaDoIma(a, faixa, {})).fases.map((v) => v.fase)).toEqual(['LAO'])

    const comEia = CATALOGO_CONSEMA_250.atividades.flatMap((x) =>
      x.faixas
        .filter((f) => f.estudo === 'EIA' && f.modalidade === 'trifasica')
        .map((f) => ({ x, f })),
    )[0]
    if (!comEia) throw new Error('nenhuma faixa com EIA')
    expect(licencas(calcularTaxaDoIma(comEia.x, comEia.f, {})).avisos.join(' ')).toMatch(
      /EIA\/RIMA/,
    )
  })

  it('fórmula sem a medida pede o parâmetro', () => {
    const a = atividade('01.54.00')
    const faixa = a.faixas.find((f) => f.porte === 'pequeno')
    if (!faixa) throw new Error('01.54.00 sem porte pequeno')
    expect(calcularTaxaDoIma(a, faixa, {})).toEqual({
      tipo: 'sem_valor',
      motivo: 'falta_medida',
      parametro: 'CmáxC',
    })
  })
})
