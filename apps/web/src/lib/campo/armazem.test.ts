import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarArmazem, type Armazem, type RegistroDoAparelho } from './armazem'

const item = (itemId: string, comentario: string | null = null): RegistroDoAparelho => ({
  tipo: 'item',
  vistoriaId: 'v1',
  itemId,
  resultado: 'conforme',
  comentario,
  registradoEm: '2026-11-21T10:00:00Z',
})

const foto: RegistroDoAparelho = {
  tipo: 'foto',
  vistoriaId: 'v1',
  itemId: 'i1',
  fotoId: 'f1',
  sha256: 'aa',
  registradoEm: '2026-11-21T10:00:00Z',
  dados: {
    consultoriaId: 'c1',
    nome: 'abrigo.jpg',
    mime: 'image/jpeg',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    legenda: null,
    capturadaEm: '2026-11-21T10:00:00Z',
    local: {
      origem: 'nenhum',
      latitude: null,
      longitude: null,
      precisaoM: null,
      localManual: null,
    },
  },
}

let armazem: Armazem

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  armazem = criarArmazem()
})

afterEach(() => {
  armazem.fechar()
})

describe('armazém do aparelho (IndexedDB)', () => {
  it('guarda, sobe a versão ao regravar e devolve só as linhas do usuário', async () => {
    expect((await armazem.guardar('u1', item('i1'))).versao).toBe(1)
    expect((await armazem.guardar('u1', item('i1', 'Piso rachado'))).versao).toBe(2)
    await armazem.guardar('u1', foto)
    await armazem.guardar('u2', item('i9'))

    const linhas = await armazem.listar('u1')
    expect(linhas.map((l) => l.id).sort()).toEqual(['u1|foto:f1', 'u1|item:i1'])
    const doItem = linhas.find((l) => l.id === 'u1|item:i1')
    expect(doItem?.registro).toMatchObject({ comentario: 'Piso rachado' })
    const daFoto = linhas.find((l) => l.id === 'u1|foto:f1')?.registro
    if (daFoto?.tipo !== 'foto') throw new Error('foto ausente')
    expect([...new Uint8Array(daFoto.dados.bytes)]).toEqual([1, 2, 3])
  })

  it('confirma só a versão enviada: o que foi regravado durante o envio fica', async () => {
    const enviada = await armazem.guardar('u1', item('i1'))
    await armazem.guardar('u1', item('i1', 'mudou'))
    expect(await armazem.confirmar(enviada.id, enviada.versao)).toBe(false)
    expect(await armazem.listar('u1')).toHaveLength(1)
    expect(await armazem.confirmar(enviada.id, enviada.versao + 1)).toBe(true)
    expect(await armazem.listar('u1')).toHaveLength(0)
  })

  it('trocar de conta apaga o rascunho das outras contas', async () => {
    await armazem.guardar('u1', item('i1'))
    await armazem.guardar('u2', item('i2'))
    await armazem.limparOutros('u2')
    expect(await armazem.listar('u1')).toEqual([])
    expect(await armazem.listar('u2')).toHaveLength(1)
  })

  it('o rascunho sobrevive a fechar e abrir o banco (recarregar a página)', async () => {
    await armazem.guardar('u1', item('i1'))
    armazem.fechar()
    const outro = criarArmazem()
    expect(await outro.listar('u1')).toHaveLength(1)
    outro.fechar()
  })

  it('não guarda nada de sessão: só o registro e o id do usuário', async () => {
    await armazem.guardar('u1', foto)
    const [linha] = await armazem.listar('u1')
    expect(Object.keys(linha ?? {}).sort()).toEqual(['id', 'registro', 'usuarioId', 'versao'])
    expect(JSON.stringify({ ...linha, registro: { ...linha?.registro, dados: null } })).not.toMatch(
      /token|access|refresh|cpf/i,
    )
  })
})
