import { describe, expect, it } from 'vitest'

import {
  ESPERA_MAXIMA_MS,
  aplicarRascunho,
  chaveDoRegistro,
  contarPendencias,
  esperaAntesDaTentativa,
  fotoRepetida,
  ordemDeEnvio,
  type RegistroNaFila,
} from './fila-de-campo'

const item = (itemId: string, registradoEm: string, extra: Partial<RegistroNaFila> = {}) =>
  ({
    tipo: 'item',
    vistoriaId: 'v1',
    itemId,
    resultado: 'conforme',
    comentario: null,
    registradoEm,
    ...extra,
  }) as RegistroNaFila

const foto = (fotoId: string, itemId: string, registradoEm: string, sha256 = 'aa') =>
  ({ tipo: 'foto', vistoriaId: 'v1', itemId, fotoId, sha256, registradoEm }) as RegistroNaFila

const observacao = (registradoEm: string): RegistroNaFila => ({
  tipo: 'observacao',
  vistoriaId: 'v1',
  observacao: 'Chuva forte',
  registradoEm,
})

describe('chaveDoRegistro', () => {
  it('item e observação têm uma chave só; cada foto tem a sua', () => {
    expect(chaveDoRegistro(item('i1', '2026-11-21T10:00:00Z'))).toBe('item:i1')
    expect(chaveDoRegistro(item('i1', '2026-11-21T11:00:00Z'))).toBe('item:i1')
    expect(chaveDoRegistro(foto('f1', 'i1', '2026-11-21T10:00:00Z'))).toBe('foto:f1')
    expect(chaveDoRegistro(foto('f2', 'i1', '2026-11-21T10:00:00Z'))).toBe('foto:f2')
    expect(chaveDoRegistro(observacao('2026-11-21T10:00:00Z'))).toBe('observacao:v1')
  })
})

describe('ordemDeEnvio', () => {
  it('itens, depois fotos, depois observação; cada tipo na ordem do registro', () => {
    const ordem = ordemDeEnvio([
      observacao('2026-11-21T09:00:00Z'),
      foto('f2', 'i2', '2026-11-21T10:05:00Z'),
      item('i2', '2026-11-21T10:10:00Z'),
      foto('f1', 'i1', '2026-11-21T10:01:00Z'),
      item('i1', '2026-11-21T10:00:00Z'),
    ])
    expect(ordem.map(chaveDoRegistro)).toEqual([
      'item:i1',
      'item:i2',
      'foto:f1',
      'foto:f2',
      'observacao:v1',
    ])
  })

  it('cada foto segue no item em que foi tirada', () => {
    const ordem = ordemDeEnvio([
      foto('f2', 'i2', '2026-11-21T10:00:00Z'),
      foto('f1', 'i1', '2026-11-21T10:00:00Z'),
    ])
    expect(ordem.map((r) => (r.tipo === 'foto' ? [r.fotoId, r.itemId] : null))).toEqual([
      ['f1', 'i1'],
      ['f2', 'i2'],
    ])
  })

  it('não muda a lista recebida', () => {
    const lista = [item('i2', '2026-11-21T10:10:00Z'), item('i1', '2026-11-21T10:00:00Z')]
    ordemDeEnvio(lista)
    expect(lista.map(chaveDoRegistro)).toEqual(['item:i2', 'item:i1'])
  })
})

describe('esperaAntesDaTentativa', () => {
  it('sem falha tenta já; depois dobra a cada falha até o teto', () => {
    expect(esperaAntesDaTentativa(0)).toBe(0)
    expect(esperaAntesDaTentativa(1)).toBe(2_000)
    expect(esperaAntesDaTentativa(2)).toBe(4_000)
    expect(esperaAntesDaTentativa(3)).toBe(8_000)
    expect(esperaAntesDaTentativa(7)).toBe(ESPERA_MAXIMA_MS)
    expect(esperaAntesDaTentativa(500)).toBe(ESPERA_MAXIMA_MS)
  })
})

describe('fotoRepetida', () => {
  const fotos = [
    { itemId: 'i1', sha256: 'ABC' },
    { itemId: 'i2', sha256: 'def' },
    { itemId: 'i3', sha256: null },
  ]

  it('a mesma imagem no mesmo item é repetida, sem diferenciar maiúscula', () => {
    expect(fotoRepetida(fotos, 'i1', 'abc')).toBe(true)
  })

  it('a mesma imagem em outro item, ou imagem nova, é aceita', () => {
    expect(fotoRepetida(fotos, 'i2', 'abc')).toBe(false)
    expect(fotoRepetida(fotos, 'i1', 'def')).toBe(false)
    expect(fotoRepetida(fotos, 'i3', 'abc')).toBe(false)
  })
})

describe('contarPendencias', () => {
  it('conta o total, por item e a observação', () => {
    expect(
      contarPendencias([
        item('i1', '2026-11-21T10:00:00Z'),
        foto('f1', 'i1', '2026-11-21T10:00:00Z'),
        foto('f2', 'i2', '2026-11-21T10:00:00Z'),
        observacao('2026-11-21T10:00:00Z'),
      ]),
    ).toEqual({ total: 4, porItem: { i1: 2, i2: 1 }, observacao: true })
    expect(contarPendencias([])).toEqual({ total: 0, porItem: {}, observacao: false })
  })
})

describe('aplicarRascunho', () => {
  it('o registro do aparelho aparece por cima do servidor; o resto fica como veio', () => {
    const servidor = [
      { id: 'i1', titulo: 'A', resultado: 'pendente' as const, comentario: null },
      { id: 'i2', titulo: 'B', resultado: 'conforme' as const, comentario: 'ok' },
    ]
    const vistos = aplicarRascunho(servidor, [
      item('i1', '2026-11-21T10:00:00Z', { resultado: 'nao_conforme', comentario: 'Piso rachado' }),
      foto('f1', 'i2', '2026-11-21T10:00:00Z'),
    ])
    expect(vistos).toEqual([
      { id: 'i1', titulo: 'A', resultado: 'nao_conforme', comentario: 'Piso rachado' },
      { id: 'i2', titulo: 'B', resultado: 'conforme', comentario: 'ok' },
    ])
    expect(servidor[0]?.resultado).toBe('pendente')
  })
})
