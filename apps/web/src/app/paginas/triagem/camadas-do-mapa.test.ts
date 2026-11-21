import { describe, expect, it } from 'vitest'

import { estiloSoDeNomes, NOMES_MANTIDOS, ORTOFOTO_SC } from './camadas-do-mapa'

describe('camadas do mapa da triagem', () => {
  it('a base é a ortofoto oficial de SC, com a fonte na atribuição', () => {
    expect(ORTOFOTO_SC.url).toBe('https://sigsc.sc.gov.br/sigserver/SIGSC/wms')
    expect(ORTOFOTO_SC.atribuicao).toMatch(/Governo de Santa Catarina/)
  })

  it('dos nomes do OpenFreeMap, fica só o que ajuda a se achar, em branco com contorno', () => {
    const estilo = estiloSoDeNomes({
      version: 8,
      layers: [
        { id: 'background', type: 'background' },
        { id: 'highway-name-major', type: 'symbol', paint: { 'text-color': '#666' } },
        { id: 'label_city', type: 'symbol' },
        { id: 'airport', type: 'symbol' },
        { id: 'water', type: 'fill' },
      ],
    })
    expect(estilo.layers.map((c) => c.id)).toEqual(['highway-name-major', 'label_city'])
    expect(estilo.layers.every((c) => NOMES_MANTIDOS.has(c.id))).toBe(true)
    expect(estilo.layers[0]?.paint).toMatchObject({
      'text-color': '#ffffff',
      'text-halo-width': 1.4,
    })
    expect(estilo.version).toBe(8)
  })
})
