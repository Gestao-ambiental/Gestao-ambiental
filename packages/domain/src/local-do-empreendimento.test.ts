import { describe, expect, it } from 'vitest'

import {
  dentroDeSantaCatarina,
  formatarCoordenadas,
  lerCoordenadas,
  metrosQuadradosParaHectares,
} from './local-do-empreendimento'

describe('lerCoordenadas', () => {
  it('aceita o formato do Google Maps, ponto e vírgula com vírgula decimal e espaço', () => {
    expect(lerCoordenadas('-26.3044, -48.8487')).toEqual({
      latitude: -26.3044,
      longitude: -48.8487,
    })
    expect(lerCoordenadas('-26,3044; -48,8487')).toEqual({
      latitude: -26.3044,
      longitude: -48.8487,
    })
    expect(lerCoordenadas('  -26.3044   -48.8487 ')).toEqual({
      latitude: -26.3044,
      longitude: -48.8487,
    })
  })

  it('recusa vazio, texto, um número só, três números e fora do globo', () => {
    expect(lerCoordenadas('')).toBeNull()
    expect(lerCoordenadas('Joinville')).toBeNull()
    expect(lerCoordenadas('-26.3')).toBeNull()
    expect(lerCoordenadas('-26.3, -48.8, 10')).toBeNull()
    expect(lerCoordenadas('-126.3, -48.8')).toBeNull()
  })
})

describe('dentroDeSantaCatarina', () => {
  it('Joinville e Florianópolis dentro; São Paulo e Porto Alegre fora', () => {
    expect(dentroDeSantaCatarina({ latitude: -26.3044, longitude: -48.8487 })).toBe(true)
    expect(dentroDeSantaCatarina({ latitude: -27.5969, longitude: -48.5482 })).toBe(true)
    expect(dentroDeSantaCatarina({ latitude: -23.55, longitude: -46.63 })).toBe(false)
    expect(dentroDeSantaCatarina({ latitude: -30.03, longitude: -51.23 })).toBe(false)
  })
})

describe('formatação e área', () => {
  it('formata com 5 casas, e o texto formatado volta a ser lido', () => {
    const c = { latitude: -26.3044, longitude: -48.8487 }
    expect(formatarCoordenadas(c)).toBe('-26.30440, -48.84870')
    expect(lerCoordenadas(formatarCoordenadas(c))).toEqual(c)
  })

  it('converte m² em hectares com 4 casas', () => {
    expect(metrosQuadradosParaHectares(2312.2588)).toBe(0.2312)
    expect(metrosQuadradosParaHectares(10_000)).toBe(1)
  })
})
