import { describe, expect, it } from 'vitest'

import { dataCivil } from './data-civil'
import {
  agruparPorDia,
  ordenarItensDaSemana,
  periodoDaMinhaSemana,
  rotuloDoDia,
  type ItemDaMinhaSemana,
} from './minha-semana'

const hoje = dataCivil('2026-11-21') // sábado

function item(
  data: string,
  consultoriaNome: string,
  tipo: string,
  titulo: string,
  id = titulo,
): ItemDaMinhaSemana {
  return {
    data: dataCivil(data),
    consultoriaId: `id-${consultoriaNome}`,
    consultoriaNome,
    tipo,
    titulo,
    id,
  }
}

describe('ordenarItensDaSemana', () => {
  it('ordena por data, consultoria, tipo e título', () => {
    const itens = [
      item('2026-11-23', 'Verde Sul', 'prazo', 'B'),
      item('2026-11-22', 'Verde Sul', 'meta', 'Z'),
      item('2026-11-22', 'Filtroville', 'meta', 'A'),
      item('2026-11-22', 'Filtroville', 'prazo', 'C'),
      item('2026-11-22', 'Filtroville', 'exigencia', 'A'),
      item('2026-11-22', 'Filtroville', 'prazo', 'B'),
    ]
    expect(
      ordenarItensDaSemana(itens).map(
        (i) => `${i.data} ${i.consultoriaNome} ${i.tipo} ${i.titulo}`,
      ),
    ).toEqual([
      '2026-11-22 Filtroville prazo B',
      '2026-11-22 Filtroville prazo C',
      '2026-11-22 Filtroville exigencia A',
      '2026-11-22 Filtroville meta A',
      '2026-11-22 Verde Sul meta Z',
      '2026-11-23 Verde Sul prazo B',
    ])
  })

  it('tipo desconhecido vai depois dos conhecidos e não some', () => {
    const itens = [item('2026-11-22', 'A', 'novo_tipo', 'X'), item('2026-11-22', 'A', 'meta', 'Y')]
    expect(ordenarItensDaSemana(itens).map((i) => i.tipo)).toEqual(['meta', 'novo_tipo'])
  })

  it('não muda a lista recebida', () => {
    const itens = [item('2026-11-23', 'A', 'prazo', 'B'), item('2026-11-22', 'A', 'prazo', 'A')]
    ordenarItensDaSemana(itens)
    expect(itens[0]?.titulo).toBe('B')
  })
})

describe('rotuloDoDia', () => {
  it('hoje, amanhã e ontem por nome; os outros com o dia da semana e dd/mm/aaaa', () => {
    expect(rotuloDoDia(dataCivil('2026-11-21'), hoje)).toBe('Hoje')
    expect(rotuloDoDia(dataCivil('2026-11-22'), hoje)).toBe('Amanhã')
    expect(rotuloDoDia(dataCivil('2026-11-20'), hoje)).toBe('Ontem')
    expect(rotuloDoDia(dataCivil('2026-11-26'), hoje)).toBe('quinta-feira, 26/11/2026')
  })
})

describe('agruparPorDia', () => {
  it('agrupa por dia, em ordem, e marca os dias que já passaram', () => {
    const dias = agruparPorDia(
      [
        item('2026-11-24', 'Verde Sul', 'prazo', 'C'),
        item('2026-11-18', 'Filtroville', 'prazo', 'A'),
        item('2026-11-24', 'Filtroville', 'prazo', 'B'),
        item('2026-11-21', 'Filtroville', 'exigencia', 'D'),
      ],
      hoje,
    )
    expect(dias.map((d) => [d.rotulo, d.passado, d.itens.map((i) => i.titulo)])).toEqual([
      ['quarta-feira, 18/11/2026', true, ['A']],
      ['Hoje', false, ['D']],
      ['terça-feira, 24/11/2026', false, ['B', 'C']],
    ])
  })

  it('lista vazia vira nenhum dia', () => {
    expect(agruparPorDia([], hoje)).toEqual([])
  })
})

describe('periodoDaMinhaSemana', () => {
  it('a semana 0 começa hoje e traz o que ficou para trás', () => {
    expect(periodoDaMinhaSemana(hoje, 0)).toEqual({ de: null, ate: '2026-11-27' })
  })

  it('as seguintes andam de 7 em 7 dias', () => {
    expect(periodoDaMinhaSemana(hoje, 1)).toEqual({ de: '2026-11-28', ate: '2026-12-04' })
    expect(periodoDaMinhaSemana(hoje, 2)).toEqual({ de: '2026-12-05', ate: '2026-12-11' })
  })

  it('semana negativa vale como a semana 0', () => {
    expect(periodoDaMinhaSemana(hoje, -3)).toEqual({ de: null, ate: '2026-11-27' })
  })
})
