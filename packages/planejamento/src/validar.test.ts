import { describe, expect, it } from 'vitest'
import { atividade, HOJE, PARAMETROS } from './apoio-de-teste'
import { planejar } from './planejar'
import type { Atividade, Carteira, Estrategia, Parametros } from './tipos'

function codigos(
  atividades: Atividade[],
  parametros: Parametros = PARAMETROS,
  hoje: string = HOJE,
  estrategia: Estrategia = 'metodo_completo',
): string[] {
  const resultado = planejar({ atividades }, parametros, hoje, estrategia)
  return resultado.ok ? [] : resultado.erros.map((e) => e.codigo)
}

const valida = atividade({ id: 'ok', prazo: '2027-06-30' })

describe('validação', () => {
  it('aceita a carteira vazia e a carteira válida', () => {
    expect(codigos([])).toEqual([])
    expect(codigos([valida])).toEqual([])
  })

  it.each<[string, Atividade[]]>([
    ['id_duplicado', [valida, valida]],
    ['data_invalida', [atividade({ id: 'a', prazo: '2027-02-30' })]],
    ['data_invalida', [atividade({ id: 'a', prazo: '31/03/2027' })]],
    ['valor_invalido', [atividade({ id: 'a', prazo: '2027-06-30', duracaoDias: -1 })]],
    ['valor_invalido', [atividade({ id: 'a', prazo: '2027-06-30', esperaDias: 1.5 })]],
    ['valor_invalido', [atividade({ id: 'a', prazo: '2027-06-30', esforcoHoras: Number.NaN })]],
    ['valor_invalido', [atividade({ id: 'a', prazo: '2027-06-30', inicioFixo: '2027-05-01' })]],
    ['gravidade_desconhecida', [atividade({ id: 'a', prazo: '2027-06-30', gravidade: 'x' })]],
    ['prazo_ausente', [atividade({ id: 'a' })]],
    [
      'dependencia_inexistente',
      [atividade({ id: 'a', prazo: '2027-06-30', dependeDe: [{ id: 'z', defasagemDias: 0 }] })],
    ],
    [
      'dependencia_ciclica',
      [
        atividade({ id: 'a', prazo: '2027-06-30', dependeDe: [{ id: 'b', defasagemDias: 0 }] }),
        atividade({ id: 'b', prazo: '2027-06-30', dependeDe: [{ id: 'a', defasagemDias: 0 }] }),
      ],
    ],
    ['fracao_invalida', [atividade({ id: 'a', prazo: '2027-06-30', antecipabilidade: 'parcial' })]],
    [
      'fracao_invalida',
      [
        atividade({
          id: 'a',
          prazo: '2027-06-30',
          antecipabilidade: 'parcial',
          fracaoAntecipavel: 1,
        }),
      ],
    ],
  ])('recusa com %s', (codigo, atividades) => {
    expect(codigos(atividades)).toContain(codigo)
  })

  it('aponta só as atividades do ciclo, não as que dependem dele', () => {
    const resultado = planejar(
      {
        atividades: [
          atividade({ id: 'a', prazo: '2027-06-30', dependeDe: [{ id: 'b', defasagemDias: 0 }] }),
          atividade({ id: 'b', prazo: '2027-06-30', dependeDe: [{ id: 'a', defasagemDias: 0 }] }),
          atividade({ id: 'c', prazo: '2027-06-30', dependeDe: [{ id: 'a', defasagemDias: 0 }] }),
        ],
      },
      PARAMETROS,
      HOJE,
      'metodo_completo',
    )
    expect(resultado).toEqual({
      ok: false,
      erros: [{ codigo: 'dependencia_ciclica', detalhe: 'a, b' }],
    })
  })

  it.each<[string, Partial<Parametros>]>([
    ['níveis vazios', { niveis: [] }],
    ['margem negativa', { niveis: [{ id: 'media', rotulo: 'Média', margemDias: -1 }] }],
    ['nível grave desconhecido', { niveisGraves: ['inexistente'] }],
    ['passo zero', { passoNivelamentoDias: 0 }],
    ['horizonte zero', { horizonteMeses: 0 }],
    ['versão vazia', { versao: '' }],
    ['capacidade zero', { capacidadeMensalHoras: 0 }],
  ])('recusa parâmetros com %s', (_, mudanca) => {
    expect(codigos([valida], { ...PARAMETROS, ...mudanca })).toContain('parametro_invalido')
  })

  it('recusa hoje e estratégia inválidos, e entrada que não é objeto', () => {
    expect(codigos([valida], PARAMETROS, '11/01/2027')).toContain('data_invalida')
    expect(codigos([valida], PARAMETROS, HOJE, 'outra' as Estrategia)).toContain(
      'parametro_invalido',
    )
    const resultado = planejar(null as unknown as Carteira, PARAMETROS, HOJE, 'so_prazo')
    expect(resultado.ok).toBe(false)
  })

  it('não devolve plano parcial: um erro em uma atividade recusa a carteira inteira', () => {
    const resultado = planejar(
      { atividades: [valida, atividade({ id: 'ruim', prazo: 'ontem' })] },
      PARAMETROS,
      HOJE,
      'metodo_completo',
    )
    expect(resultado).toEqual({
      ok: false,
      erros: [
        { codigo: 'data_invalida', atividadeId: 'ruim', campo: 'prazo', detalhe: 'use AAAA-MM-DD' },
      ],
    })
  })
})
