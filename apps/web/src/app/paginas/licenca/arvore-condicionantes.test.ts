import { describe, expect, it } from 'vitest'

import type { Condicionante } from '@/lib/api/licencas'

import { descendentes, destinoDoNovo, linhasVisiveis, montarArvore } from './arvore-condicionantes'

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
