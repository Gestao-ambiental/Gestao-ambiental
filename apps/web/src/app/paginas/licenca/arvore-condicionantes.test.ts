import { describe, expect, it } from 'vitest'

import type { Condicionante } from '@/lib/api/licencas'

import {
  descendentes,
  destinoAoSoltar,
  destinoDoNovo,
  linhasVisiveis,
  montarArvore,
  proximoCodigo,
} from './arvore-condicionantes'

function item(
  id: string,
  codigo: string,
  paiId: string | null,
  extra: Partial<Condicionante> = {},
): Condicionante {
  return {
    id,
    paiId,
    codigo,
    posicao: 0,
    revisao: 'aceita',
    responsavelId: null,
    titulo: id,
    textoLiteral: '',
    natureza: 'obrigacao',
    recorrencia: null,
    unidade: null,
    intervalo: null,
    dataReferencia: null,
    primeiraData: null,
    fonteRegra: null,
    confirmadoEm: null,
    confirmadoPor: null,
    origem: 'manual',
    fontePagina: null,
    periodicidadeIa: null,
    ...extra,
  }
}

const agrupador = { natureza: 'agrupador' } as const

describe('árvore de condicionantes', () => {
  it('soltar: em agrupador entra nele, em item fica junto dele, nunca dentro de si', () => {
    const itens = [
      item('g3', '3', null, agrupador),
      item('g32', '3.2', 'g3', agrupador),
      item('c321', '3.2.1', 'g32'),
      item('solto', '3.2.2.1', null),
      item('desc', '9', null, { ...agrupador, revisao: 'descartada' }),
    ]
    const [g3, g32, c321, solto, desc] = itens as [
      Condicionante,
      Condicionante,
      Condicionante,
      Condicionante,
      Condicionante,
    ]
    expect(destinoAoSoltar(itens, solto, g32)).toBe('g32')
    expect(destinoAoSoltar(itens, solto, c321)).toBe('g32')
    expect(destinoAoSoltar(itens, c321, null)).toBeNull()
    expect(destinoAoSoltar(itens, c321, solto)).toBeNull()
    // Já está aí, ou seria dentro de si mesmo / de um descendente.
    expect(destinoAoSoltar(itens, c321, g32)).toBeUndefined()
    expect(destinoAoSoltar(itens, solto, null)).toBeUndefined()
    expect(destinoAoSoltar(itens, g3, g32)).toBeUndefined()
    expect(destinoAoSoltar(itens, g3, c321)).toBeUndefined()
    expect(destinoAoSoltar(itens, g32, g32)).toBeUndefined()
    // Agrupador descartado não recebe: soltar nele vale como soltar junto dele (na raiz).
    expect(destinoAoSoltar(itens, c321, desc)).toBeNull()
  })

  it('sugere o código do item novo pelo lugar, como o VS Code', () => {
    const itens = [
      item('g3', '3', null, agrupador),
      item('g32', '3.2', 'g3', agrupador),
      item('g325', '3.2.5', 'g32', agrupador),
      item('c3251', '3.2.5.1', 'g325'),
      item('c3252', '3.2.5.2', 'g325'),
      item('c3253', '3.2.5.3', 'g325', { revisao: 'descartada' }),
      item('g3210', '3.2.10', 'g32', agrupador),
      item('vazio', '3.2.11', 'g32', agrupador),
      item('sem', '', 'g32', agrupador),
      item('alineas', 'Alíneas', null, agrupador),
      item('a', 'a)', 'alineas'),
      item('b', 'b)', 'alineas'),
      item('romanos', 'IV', null, agrupador),
      item('r1', 'IV', 'romanos'),
      item('r2', 'Anexo', 'alineas', { revisao: 'descartada' }),
    ]
    // Seguinte ao último irmão, na ordem do código; descartado não conta.
    expect(proximoCodigo(itens, 'g325')).toBe('3.2.5.3')
    expect(proximoCodigo(itens, 'g32')).toBe('3.2.12')
    expect(
      proximoCodigo([item('x1', '1', null), item('x2', '2', null), item('x10', '10', null)], null),
    ).toBe('11')
    // Agrupador vazio: o primeiro dentro dele. Sem código no pai: em branco.
    expect(proximoCodigo(itens, 'vazio')).toBe('3.2.11.1')
    expect(proximoCodigo(itens, 'sem')).toBe('')
    expect(proximoCodigo(itens, 'alineas')).toBe('c)')
    expect(proximoCodigo(itens, 'romanos')).toBe('')
    expect(proximoCodigo([], null)).toBe('1')
  })

  // A IA às vezes manda o subitem antes do agrupador: a tela segue o código da licença.
  const itens = [
    item('311', '3.1.1', '31'),
    item('31', '3.1', '3', agrupador),
    item('3', '3', null, agrupador),
    item('310', '3.10', '3'),
    item('32', '3.2', '3', { ...agrupador, revisao: 'pendente' }),
    item('321', '3.2.1', '32', { revisao: 'pendente' }),
    item('sem', '', null, { posicao: 9 }),
    item('1', '1', null),
  ]
  const arvore = montarArvore(itens)

  it('ordena pelo código, com números como números, e leva o item sem código ao fim', () => {
    const linhas = linhasVisiveis(arvore, new Set(), 'todos')
    expect(linhas.map((l) => [l.item.codigo, l.nivel])).toEqual([
      ['1', 0],
      ['3', 0],
      ['3.1', 1],
      ['3.1.1', 2],
      ['3.2', 1],
      ['3.2.1', 2],
      ['3.10', 1],
      ['', 0],
    ])
  })

  it('agrupador recolhido esconde tudo abaixo dele', () => {
    const linhas = linhasVisiveis(arvore, new Set(['3']), 'todos')
    expect(linhas.map((l) => l.item.codigo)).toEqual(['1', '3', ''])
    expect(linhas[1]).toMatchObject({ temFilhos: true, recolhido: true })
  })

  it('filtro mostra o item e os agrupadores acima dele', () => {
    const linhas = linhasVisiveis(arvore, new Set(), 'pendente')
    expect(linhas.map((l) => l.item.codigo)).toEqual(['3', '3.2', '3.2.1'])
  })

  it('pai inexistente ou ciclo não some com o item', () => {
    const soltos = montarArvore([item('a', 'A', 'b', agrupador), item('b', 'B', 'a', agrupador)])
    expect(linhasVisiveis(soltos, new Set(), 'todos').map((l) => l.item.codigo)).toEqual(['A', 'B'])
    const orfao = montarArvore([item('x', '9.1', 'nao-existe')])
    expect(orfao[0]?.item.id).toBe('x')
  })

  it('descendentes inclui o próprio item e tudo abaixo', () => {
    expect(descendentes(arvore, '3')).toEqual(new Set(['3', '31', '311', '310', '32', '321']))
  })

  it('novo item entra no agrupador selecionado ou no pai do item selecionado', () => {
    expect(destinoDoNovo(undefined)).toBeNull()
    expect(destinoDoNovo(itens[1])).toBe('31')
    expect(destinoDoNovo(itens[0])).toBe('31')
    expect(destinoDoNovo(itens[7])).toBeNull()
  })
})
