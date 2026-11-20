import { describe, expect, it } from 'vitest'
import catalogo from '../exemplos/temas-provisorios.json'
import { PARAMETROS } from './apoio-de-teste'
import { cenarioPorTemas } from './cenario'
import { comparar } from './comparar'
import { planejar } from './planejar'
import { atividadeDoTema, entraNaCarteira, type Catalogo } from './temas'

const CATALOGO: Catalogo = catalogo
const de = (tema: string, prazo = '2027-06-30') =>
  atividadeDoTema(CATALOGO, tema, { id: 'x', prazo })

describe('catálogo de temas', () => {
  it('tem os 47 temas da matriz, cada um com trava e gravidade conhecidas', () => {
    expect(CATALOGO.temas).toHaveLength(47)
    expect(new Set(CATALOGO.temas.map((t) => t.id)).size).toBe(47)
    const niveis = PARAMETROS.niveis.map((n) => n.id)
    for (const tema of CATALOGO.temas) {
      expect(Object.keys(CATALOGO.travas)).toContain(tema.trava)
      expect(niveis).toContain(tema.gravidade)
    }
    expect(Object.keys(CATALOGO.travas)).toHaveLength(8)
  })

  it('medição pontual é toda antecipável, limitada pela janela de validade', () => {
    expect(de('laudo_ruido')).toMatchObject({
      antecipabilidade: 'antecipavel',
      esperaDias: 15,
      gravidade: 'media',
      inicioMaisCedo: '2027-01-01',
    })
  })

  it('documental é toda antecipável, sem limite', () => {
    const atividade = de('prad_plano')
    expect(atividade?.antecipabilidade).toBe('antecipavel')
    expect(atividade?.inicioMaisCedo).toBeUndefined()
  })

  it('cronograma aprovado e janela sazonal só liberam o preparo', () => {
    expect(de('passivo_remediacao')).toMatchObject({
      antecipabilidade: 'parcial',
      fracaoAntecipavel: 0.2,
      gravidade: 'critica',
    })
    expect(de('prad_plantio')).toMatchObject({
      antecipabilidade: 'parcial',
      fracaoAntecipavel: 0.3,
    })
  })

  it('janela legal só começa quando os dados do ano-base fecham', () => {
    expect(de('relatorio_ibama', '2027-03-31')).toMatchObject({
      antecipabilidade: 'parcial',
      fracaoAntecipavel: 0.8,
      inicioMaisCedo: '2027-01-01',
    })
  })

  it('prazo do órgão é fixo e condição contínua fica fora da carteira', () => {
    expect(de('resposta_oficio')?.antecipabilidade).toBe('fixa')
    expect(de('licencas_prestadores')).toBeNull()
    expect(CATALOGO.temas.filter((t) => !entraNaCarteira(CATALOGO, t)).map((t) => t.id)).toEqual([
      'licencas_prestadores',
    ])
  })

  it('a validade do tema substitui a janela padrão da trava', () => {
    const comValidade: Catalogo = {
      ...CATALOGO,
      temas: CATALOGO.temas.map((t) => (t.id === 'laudo_ruido' ? { ...t, validadeDias: 30 } : t)),
    }
    expect(
      atividadeDoTema(comValidade, 'laudo_ruido', { id: 'x', prazo: '2027-06-30' })?.inicioMaisCedo,
    ).toBe('2027-05-31')
  })

  it('recusa tema e trava desconhecidos', () => {
    expect(() => de('inexistente')).toThrow('Tema desconhecido')
    const quebrado: Catalogo = { ...CATALOGO, travas: {} }
    expect(() =>
      atividadeDoTema(quebrado, 'laudo_ruido', { id: 'x', prazo: '2027-06-30' }),
    ).toThrow('trava desconhecida')
  })

  it('todo tema da carteira gera atividade que o motor aceita', () => {
    const atividades = CATALOGO.temas.flatMap((tema, i) => {
      const prazo = tema.prazoFixo ? `2027-${tema.prazoFixo}` : '2027-08-15'
      const atividade = atividadeDoTema(CATALOGO, tema.id, { id: `t${String(i)}`, prazo })
      return atividade ? [atividade] : []
    })
    expect(atividades).toHaveLength(46)
    expect(planejar({ atividades }, PARAMETROS, '2026-10-01', 'metodo_completo').ok).toBe(true)
  })
})

describe('cenário por temas', () => {
  const opcoes = {
    semente: 1,
    ano: 2027,
    porMes: 30,
    mesDePico: 3,
    noPico: 130,
    catalogo: CATALOGO,
  }
  const carteira = cenarioPorTemas(opcoes)

  it('mantém 30 prazos por mês e 130 em março, e é reproduzível', () => {
    const emMarco = carteira.atividades.filter((a) => a.prazo?.startsWith('2027-03'))
    expect(carteira.atividades).toHaveLength(460)
    expect(emMarco).toHaveLength(130)
    expect(cenarioPorTemas(opcoes)).toEqual(carteira)
  })

  it('declarações com janela legal só aparecem em março, com prazo no dia 31', () => {
    const legais = carteira.atividades.filter((a) =>
      ['carga_poluidora', 'inventario_residuos', 'relatorio_ibama'].includes(a.grupo ?? ''),
    )
    expect(legais.length).toBeGreaterThan(0)
    expect(new Set(legais.map((a) => a.prazo))).toEqual(new Set(['2027-03-31']))
  })

  it('com as travas, o nivelamento reduz o pico menos do que sem elas, mas ainda reduz', () => {
    const comparacao = comparar(
      carteira,
      { ...PARAMETROS, capacidadeMensalHoras: null },
      '2026-07-01',
    )
    if (!comparacao.ok) throw new Error(JSON.stringify(comparacao.erros))
    const pico = (estrategia: string) =>
      comparacao.linhas.find((l) => l.estrategia === estrategia)?.metricas.picoHoras ?? 0
    expect(pico('metodo_completo')).toBeLessThan(pico('metodo_sem_antecipacao'))
    expect(pico('metodo_sem_antecipacao')).toBeLessThan(pico('so_prazo') + 1)
  })
})
