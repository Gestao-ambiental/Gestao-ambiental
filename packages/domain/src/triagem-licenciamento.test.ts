import { describe, expect, it } from 'vitest'

import { CATALOGO_CONSEMA_250 } from './catalogo-consema-250'
import { CATALOGO_CONSEMA_251 } from './catalogo-consema-251'
import {
  atendeCondicao,
  buscarAtividades,
  concluirTriagem,
  definirCompetencia,
  descreverCondicao,
  enquadrarAtividade,
  lerNumeroDigitado,
  parametrosDaAtividade,
  type AtividadeLicenciavel,
  type ResultadoDoEnquadramento,
} from './triagem-licenciamento'

const { atividades, parametros } = CATALOGO_CONSEMA_250

function atividade(codigo: string): AtividadeLicenciavel {
  const a = atividades.find((x) => x.codigo === codigo)
  if (!a) throw new Error(`atividade ${codigo} fora do catálogo`)
  return a
}

function enquadrada(r: ResultadoDoEnquadramento) {
  if (r.tipo !== 'enquadrada') throw new Error(`esperava enquadrada, veio ${r.tipo}`)
  return r
}

describe('catálogo da CONSEMA 250/2024 (Anexo VI)', () => {
  it('tem as atividades vigentes, sem código repetido e sem a 00.01.00 revogada', () => {
    expect(atividades.length).toBe(311)
    expect(new Set(atividades.map((a) => a.codigo)).size).toBe(atividades.length)
    expect(atividades.some((a) => a.codigo === '00.01.00')).toBe(false)
  })

  it('toda atividade tem potencial geral e pelo menos uma faixa de porte', () => {
    for (const a of atividades) {
      expect(['P', 'M', 'G'], a.codigo).toContain(a.potencial.geral)
      expect(a.faixas.length, a.codigo).toBeGreaterThan(0)
    }
  })

  it('todo parâmetro usado nas faixas está definido no Anexo VII', () => {
    for (const a of atividades) {
      for (const p of parametrosDaAtividade(a))
        expect(parametros[p], `${a.codigo} ${p}`).toBeTruthy()
    }
  })

  it('as faixas de cada parâmetro são contíguas: nenhum valor cai em duas faixas nem num buraco', () => {
    for (const a of atividades) {
      for (const p of parametrosDaAtividade(a)) {
        const conds = a.faixas
          .flatMap((f) => f.condicoes)
          .filter((c) => c.parametro === p)
          .sort((x, y) => (x.min ?? -1) - (y.min ?? -1))
        for (let i = 1; i < conds.length; i++) {
          const antes = conds[i - 1]
          const depois = conds[i]
          if (!antes || !depois) continue
          expect(antes.max, `${a.codigo} ${p}`).toBe(depois.min)
          expect(antes.maxIncl, `${a.codigo} ${p}`).not.toBe(depois.minIncl)
        }
      }
    }
  })

  it('usa a redação mais recente quando o texto consolidado traz duas (11.00.01, CONSEMA 259/2024)', () => {
    const a = atividade('11.00.01')
    expect(a.redacaoDada).toBe('259/2024')
    expect(a.faixas.map((f) => f.textoOriginal)).toEqual([
      'Porte Pequeno: AU(3) ≤ 0,2 (EAS)',
      'Porte Médio: 0,2 < AU(3) < 1 (EAS)',
      'Porte Grande: AU(3) ≥ 1 (EIA)',
    ])
  })

  it('corrige o erro de digitação "40.000.00" do item 03.34.00 (40.000.000)', () => {
    const r = enquadrada(enquadrarAtividade(atividade('03.34.00'), { CP: 50_000_000 }))
    expect(r.faixa.porte).toBe('medio')
  })
})

describe('enquadrarAtividade', () => {
  it('lavra por explosivo (00.10.00): pequeno EAS, médio e grande EIA, com limites da resolução', () => {
    const a = atividade('00.10.00')
    expect(enquadrada(enquadrarAtividade(a, { PA: 48_000 })).faixa).toMatchObject({
      porte: 'pequeno',
      estudo: 'EAS',
      modalidade: 'trifasica',
    })
    expect(enquadrada(enquadrarAtividade(a, { PA: 48_000.001 })).faixa).toMatchObject({
      porte: 'medio',
      estudo: 'EIA',
    })
    expect(enquadrada(enquadrarAtividade(a, { PA: 240_000 })).faixa.porte).toBe('grande')
  })

  it('porte mínimo vira AuA, sem estudo (00.12.02, PA < 2.400)', () => {
    const r = enquadrada(enquadrarAtividade(atividade('00.12.02'), { PA: 2_399 }))
    expect(r.faixa).toMatchObject({ porte: 'minimo', modalidade: 'AuA', estudo: null })
    expect(
      enquadrada(enquadrarAtividade(atividade('00.12.02'), { PA: 2_400 })).faixa,
    ).toMatchObject({ porte: 'pequeno', estudo: 'RAP', modalidade: 'trifasica' })
  })

  it('"O porte P será licenciado por AuA" vale só para o pequeno (03.31.04, piscicultura)', () => {
    const a = atividade('03.31.04')
    expect(enquadrada(enquadrarAtividade(a, { LA: 5 })).faixa.modalidade).toBe('AuA')
    expect(enquadrada(enquadrarAtividade(a, { LA: 6 })).faixa).toMatchObject({
      modalidade: 'trifasica',
      estudo: 'RAP',
    })
  })

  it('usinagem com pintura (12.80.10) e a LAC informada como observação quando o item prevê', () => {
    const a = atividade('12.80.10')
    expect(enquadrada(enquadrarAtividade(a, { 'AU(3)': 0.04 })).faixa.modalidade).toBe('AuA')
    expect(enquadrada(enquadrarAtividade(a, { 'AU(3)': 1 })).faixa.estudo).toBe('EAS')
    const lac = enquadrada(enquadrarAtividade(atividade('00.12.03'), { PA: 10_000 }))
    expect(lac.avisos.some((x) => x.includes('LAC até PA 12.000'))).toBe(true)
  })

  it('porte único não pede medida (00.30.03, pedras aparentes: AuA)', () => {
    const r = enquadrada(enquadrarAtividade(atividade('00.30.03'), {}))
    expect(r.faixa).toMatchObject({ porte: 'unico', modalidade: 'AuA' })
    expect(r.parametro).toBeNull()
  })

  it('abaixo do menor limite: não licenciável, cabe a Certidão de Conformidade (Art. 14)', () => {
    // 01.54.01: UPL começa em 15 matrizes.
    expect(enquadrarAtividade(atividade('01.54.01'), { CmáxM: 10 })).toEqual({
      tipo: 'abaixo_do_limite',
      parametro: 'CmáxM',
      limite: 15,
      avisos: [],
    })
    expect(enquadrada(enquadrarAtividade(atividade('01.54.01'), { CmáxM: 15 })).faixa.porte).toBe(
      'minimo',
    )
  })

  it('sem medida, diz qual parâmetro falta', () => {
    expect(enquadrarAtividade(atividade('34.41.10'), {})).toEqual({
      tipo: 'falta_medida',
      parametros: ['QMR'],
    })
  })

  it('recusa medida negativa ou não numérica', () => {
    expect(enquadrarAtividade(atividade('34.41.10'), { QMR: -1 })).toEqual({
      tipo: 'medida_invalida',
      parametro: 'QMR',
    })
    expect(enquadrarAtividade(atividade('34.41.10'), { QMR: Number.NaN }).tipo).toBe(
      'medida_invalida',
    )
  })

  it('dois parâmetros alternativos em portes diferentes: vale o maior, com aviso (00.30.01)', () => {
    const a = atividade('00.30.01')
    expect(parametrosDaAtividade(a)).toEqual(['AU(1)', 'PM'])
    const r = enquadrada(enquadrarAtividade(a, { 'AU(1)': 50, PM: 12_000 }))
    expect(r.faixa.porte).toBe('grande')
    expect(r.parametro).toBe('PM')
    expect(r.avisos[0]).toMatch(/portes diferentes/)
    // Só um dos dois informado: basta.
    expect(enquadrada(enquadrarAtividade(a, { 'AU(1)': 50 })).faixa.porte).toBe('pequeno')
  })

  it('hidrelétrica (34.11.01) traz a ressalva "ou EIA, se AI ≥ 100" no aviso', () => {
    const r = enquadrada(enquadrarAtividade(atividade('34.11.01'), { P: 5 }))
    expect(r.faixa.estudo).toBe('EAS')
    expect(r.avisos[0]).toContain('ou EIA, se AI ≥ 100')
  })
})

describe('concluirTriagem (Art. 10, §1º)', () => {
  it('o estudo é o da atividade de maior complexidade e a modalidade trifásica prevalece', () => {
    const pintura = atividade('12.80.10')
    const papel = atividade('17.21.00')
    const c = concluirTriagem([
      { atividade: pintura, resultado: enquadrarAtividade(pintura, { 'AU(3)': 0.1 }) }, // RAP
      { atividade: papel, resultado: enquadrarAtividade(papel, { 'AU(3)': 2 }) }, // EAS
    ])
    expect(c).toMatchObject({
      completa: true,
      estudo: 'EAS',
      atividadeDoEstudo: '17.21.00',
      modalidade: 'trifasica',
      potencialGeral: 'M',
      pendentes: [],
    })
  })

  it('só AuA: modalidade AuA e sem estudo (Art. 22)', () => {
    const a = atividade('00.30.03')
    const c = concluirTriagem([{ atividade: a, resultado: enquadrarAtividade(a, {}) }])
    expect(c).toMatchObject({ completa: true, estudo: null, modalidade: 'AuA' })
  })

  it('separa as pendentes e as abaixo do limite; triagem incompleta enquanto houver pendência', () => {
    const upl = atividade('01.54.01')
    const aterro = atividade('34.41.10')
    const c = concluirTriagem([
      { atividade: upl, resultado: enquadrarAtividade(upl, { CmáxM: 10 }) },
      { atividade: aterro, resultado: enquadrarAtividade(aterro, {}) },
    ])
    expect(c).toMatchObject({
      completa: false,
      abaixoDoLimite: ['01.54.01'],
      pendentes: ['34.41.10'],
      modalidade: null,
      estudo: null,
    })
  })

  it('lista vazia: nada concluído', () => {
    expect(concluirTriagem([])).toMatchObject({ completa: false, modalidade: null })
  })

  it('LAC só pode ser avaliada quando todas as atividades enquadradas a preveem', () => {
    const antena = atividade('34.16.00')
    const papel = atividade('17.21.00')
    const soAntena = concluirTriagem([
      { atividade: antena, resultado: enquadrarAtividade(antena, { FR: 2 }) },
    ])
    expect(soAntena.podeAvaliarLac).toBe(true)
    const misto = concluirTriagem([
      { atividade: antena, resultado: enquadrarAtividade(antena, { FR: 2 }) },
      { atividade: papel, resultado: enquadrarAtividade(papel, { 'AU(3)': 2 }) },
    ])
    expect(misto.podeAvaliarLac).toBe(false)
  })
})

describe('buscarAtividades', () => {
  it('acha pelo código, com ou sem pontos', () => {
    const codigos = buscarAtividades(atividades, '26.50').map((a) => a.codigo)
    expect(codigos).toEqual(expect.arrayContaining(['26.50.20', '26.50.30', '26.50.40']))
    expect(codigos.every((c) => c.startsWith('26.50.'))).toBe(true)
    expect(buscarAtividades(atividades, '265020')[0]?.codigo).toBe('26.50.20')
  })

  it('acha por palavras da descrição sem acento, em qualquer ordem', () => {
    const r = buscarAtividades(atividades, 'aterro sanitario')
    expect(r.map((a) => a.codigo)).toContain('34.41.10')
    expect(buscarAtividades(atividades, 'abate suinos').map((a) => a.codigo)).toEqual(['26.50.30'])
  })

  it('termo vazio não lista nada e o limite corta o resultado', () => {
    expect(buscarAtividades(atividades, '  ')).toEqual([])
    expect(buscarAtividades(atividades, 'fabricação', 5)).toHaveLength(5)
  })
})

describe('lerNumeroDigitado', () => {
  it('entende vírgula decimal, ponto de milhar e ponto decimal sem cara de milhar', () => {
    expect(lerNumeroDigitado('0,2')).toBe(0.2)
    expect(lerNumeroDigitado('1.234,5')).toBe(1234.5)
    expect(lerNumeroDigitado('48.000')).toBe(48000)
    expect(lerNumeroDigitado('240.000.000')).toBe(240_000_000)
    expect(lerNumeroDigitado('0.2')).toBe(0.2)
    expect(lerNumeroDigitado(' 15 ')).toBe(15)
  })

  it('vazio é null; texto, negativo ou dois separadores decimais é NaN', () => {
    expect(lerNumeroDigitado('')).toBeNull()
    expect(lerNumeroDigitado('   ')).toBeNull()
    expect(lerNumeroDigitado('abc')).toBeNaN()
    expect(lerNumeroDigitado('-3')).toBeNaN()
    expect(lerNumeroDigitado('1,2,3')).toBeNaN()
  })
})

describe('condições', () => {
  it('respeita limite incluso e aberto', () => {
    const c = { parametro: 'PA', min: 48_000, minIncl: false, max: 240_000, maxIncl: false }
    expect(atendeCondicao(c, 48_000)).toBe(false)
    expect(atendeCondicao(c, 48_001)).toBe(true)
    expect(atendeCondicao(c, 240_000)).toBe(false)
  })

  it('descreve como na resolução', () => {
    expect(
      descreverCondicao({ parametro: 'AU(3)', min: 0.2, minIncl: false, max: 1, maxIncl: false }),
    ).toBe('0,2 < AU(3) < 1')
    expect(
      descreverCondicao({ parametro: 'PA', min: null, minIncl: false, max: 48_000, maxIncl: true }),
    ).toBe('PA ≤ 48.000')
    expect(
      descreverCondicao({ parametro: 'QMR', min: 1500, minIncl: true, max: null, maxIncl: false }),
    ).toBe('QMR ≥ 1.500')
  })
})

describe('catálogo da CONSEMA 251/2024 (impacto local)', () => {
  const local = CATALOGO_CONSEMA_251.atividades

  it('o nível III traz todas as atividades; o II deixa de fora três que estão no I', () => {
    const porNivel = (n: number) => new Set(local.filter((a) => a.nivel === n).map((a) => a.codigo))
    expect(porNivel(3).size).toBe(new Set(local.map((a) => a.codigo)).size)
    expect([...porNivel(1)].filter((c) => !porNivel(2).has(c))).toEqual([
      '17.21.00',
      '71.11.02',
      '71.11.03',
    ])
    for (const c of porNivel(2)) expect(porNivel(3).has(c), c).toBe(true)
  })

  it('toda atividade local existe na 250/2024 e usa parâmetros do Anexo II', () => {
    const estaduais = new Set(atividades.map((a) => a.codigo))
    for (const a of local) {
      expect(estaduais.has(a.codigo), a.codigo).toBe(true)
      for (const p of parametrosDaAtividade(a)) {
        expect(CATALOGO_CONSEMA_251.parametros[p], `${a.codigo} ${p}`).toBeTruthy()
      }
    }
  })

  it('faixas contíguas, menos a sobreposição que está no próprio texto (nível II, 11.30.02 e 11.40.02)', () => {
    const sobreposicoesDoTexto = new Set(['2|11.30.02', '2|11.40.02'])
    for (const a of local) {
      if (sobreposicoesDoTexto.has(`${String(a.nivel)}|${a.codigo}`)) continue
      for (const p of parametrosDaAtividade(a)) {
        const conds = a.faixas
          .flatMap((f) => f.condicoes)
          .filter((c) => c.parametro === p)
          .sort((x, y) => (x.min ?? -1) - (y.min ?? -1))
        for (let i = 1; i < conds.length; i++) {
          const antes = conds[i - 1]
          const depois = conds[i]
          if (!antes || !depois) continue
          expect(antes.max, `${String(a.nivel)} ${a.codigo} ${p}`).toBe(depois.min)
          expect(antes.maxIncl, `${String(a.nivel)} ${a.codigo} ${p}`).not.toBe(depois.minIncl)
        }
      }
    }
  })

  it('na sobreposição do texto, vale o maior porte com aviso', () => {
    const a = local.find((x) => x.codigo === '11.30.02' && x.nivel === 2)
    if (!a) throw new Error('11.30.02 nível II fora do catálogo')
    const r = enquadrada(enquadrarAtividade(a, { 'AU(3)': 0.1 }))
    expect(r.faixa.porte).toBe('pequeno')
    expect(r.avisos[0]).toMatch(/dois portes/)
  })
})

describe('definirCompetencia', () => {
  const competencia = (codigo: string, medidas: Record<string, number>, nivel: 1 | 2 | 3 | null) =>
    definirCompetencia(codigo, medidas, nivel, CATALOGO_CONSEMA_250, CATALOGO_CONSEMA_251)

  it('usinagem (12.80.00) pequena num município nível I: municipal, pela faixa da 251', () => {
    const c = competencia('12.80.00', { 'AU(3)': 0.15 }, 1)
    expect(c.orgao).toBe('municipal')
    if (c.orgao !== 'municipal') return
    expect(c.nivel).toBe(1)
    expect(enquadrada(c.resultado).faixa).toMatchObject({ porte: 'pequeno', estudo: 'RAP' })
  })

  it('acima da maior faixa do nível do município vai para o Estado; no nível III fica no município', () => {
    const n1 = competencia('12.80.00', { 'AU(3)': 2 }, 1)
    expect(n1).toMatchObject({ orgao: 'estadual', motivo: 'fora_das_faixas_locais' })
    const n3 = competencia('12.80.00', { 'AU(3)': 2 }, 3)
    expect(n3.orgao).toBe('municipal')
    if (n3.orgao === 'municipal') expect(enquadrada(n3.resultado).faixa.estudo).toBe('EAS')
  })

  it('níveis cumulativos: município II licencia 17.21.00 pela lista do nível I', () => {
    expect(competencia('17.21.00', { 'AU(3)': 0.5 }, 2)).toMatchObject({
      orgao: 'municipal',
      nivel: 1,
    })
  })

  it('acima da maior faixa da lista local, o enquadramento diz o limite', () => {
    const a = CATALOGO_CONSEMA_251.atividades.find((x) => x.codigo === '12.80.00' && x.nivel === 1)
    if (!a) throw new Error('12.80.00 nível I fora do catálogo')
    expect(enquadrarAtividade(a, { 'AU(3)': 2 })).toEqual({
      tipo: 'acima_do_limite',
      parametro: 'AU(3)',
      limite: 1,
    })
  })

  it('município não habilitado: Estado', () => {
    expect(competencia('12.80.00', { 'AU(3)': 0.15 }, null)).toMatchObject({
      orgao: 'estadual',
      motivo: 'municipio_nao_habilitado',
    })
  })

  it('atividade fora da lista local (aterro sanitário 34.41.10): Estado', () => {
    expect(competencia('34.41.10', { QMR: 100 }, 3)).toMatchObject({
      orgao: 'estadual',
      motivo: 'fora_da_lista_local',
    })
  })

  it('antenas (34.16.00) vão sempre para o Estado (251/2024, Art. 3º, §6º)', () => {
    expect(competencia('34.16.00', { FR: 0.5 }, 3)).toMatchObject({
      orgao: 'estadual',
      motivo: 'sempre_estadual',
    })
  })

  it('PCH em divisa de municípios (34.11.06) ganha o aviso do §7º', () => {
    const c = competencia('34.11.06', { P: 0.1 }, 3)
    expect(c.orgao).toBe('municipal')
    if (c.orgao === 'municipal') expect(c.avisos[0]).toMatch(/divisa entre municípios/)
  })

  it('sem medida: diz o que falta; código inexistente: fora da lista', () => {
    const c = competencia('12.80.00', {}, 1)
    expect(c).toMatchObject({ orgao: 'estadual', motivo: 'falta_medida' })
    expect(competencia('99.99.99', {}, 1)).toEqual({ orgao: 'fora_da_lista', codigo: '99.99.99' })
  })
})
