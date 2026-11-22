import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { criarArmazem, type RegistroDoAparelho } from './armazem'
import { ehFalhaDeConexao } from './falhas'
import { FilaDeCampo } from './fila'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const item = (itemId: string, registradoEm: string, comentario: string | null = null) =>
  ({
    tipo: 'item',
    vistoriaId: 'v1',
    itemId,
    resultado: 'conforme',
    comentario,
    registradoEm,
  }) satisfies RegistroDoAparelho

const SEM_REDE = { error: { message: 'TypeError: Failed to fetch' } }

let fila: FilaDeCampo

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  fila = new FilaDeCampo(criarArmazem())
})

afterEach(() => {
  fila.descarregar()
  vi.useRealTimers()
})

const registrados = () =>
  falso.cliente.rpc.mock.calls
    .filter(([nome]) => nome === 'registrar_item_da_vistoria')
    .map(([, args]) => (args as { p_item_id: string }).p_item_id)

describe('fila de envio do Campo', () => {
  it('envia na ordem do registro e apaga do aparelho só o que o servidor confirmou', async () => {
    falso.reiniciar({ rpc: { registrar_item_da_vistoria: { data: null } } })
    await fila.definirUsuario('u1')
    await fila.registrar(item('i2', '2026-11-21T10:05:00Z'))
    await fila.registrar(item('i1', '2026-11-21T10:00:00Z'))
    await fila.processar()

    expect(registrados()).toEqual(['i2', 'i1'])
    expect(fila.obter().pendencias).toEqual([])
    expect(await criarArmazem().listar('u1')).toEqual([])
  })

  it('falha de conexão para a volta, mantém tudo e tenta de novo com espera crescente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let falhar = true
    falso.reiniciar({
      rpc: { registrar_item_da_vistoria: () => (falhar ? SEM_REDE : { data: null }) },
    })
    await fila.definirUsuario('u1')
    await fila.registrar(item('i1', '2026-11-21T10:00:00Z'))
    await fila.registrar(item('i2', '2026-11-21T10:01:00Z'))
    await fila.processar()

    // Cada volta para no primeiro: o segundo nem foi tentado.
    expect(new Set(registrados())).toEqual(new Set(['i1']))
    expect(fila.obter().pendencias.map((p) => p.estado)).toEqual(['no_aparelho', 'no_aparelho'])
    const tentativas = registrados().length

    // A espera dobra a cada falha seguida.
    const espera = () => (fila.obter().proximaTentativaEm ?? 0) - Date.now()
    const primeira = espera()
    await vi.advanceTimersByTimeAsync(primeira)
    expect(registrados()).toHaveLength(tentativas + 1)
    expect(espera()).toBe(primeira * 2)

    // A conexão responde: a próxima tentativa automática envia tudo, sem chamar ninguém.
    falhar = false
    await vi.advanceTimersByTimeAsync(espera())
    await vi.waitFor(() => {
      expect(fila.obter().pendencias).toEqual([])
    })
    expect(registrados().slice(-2)).toEqual(['i1', 'i2'])
    expect(fila.obter().proximaTentativaEm).toBeNull()
  })

  it('o que foi regravado durante o envio segue para o servidor na volta seguinte', async () => {
    let soltar: (() => void) | null = null
    const enviados: unknown[] = []
    falso.reiniciar({ rpc: {} })
    const padrao = falso.cliente.rpc.getMockImplementation()
    if (!padrao) throw new Error('rpc falso sem implementação')
    falso.cliente.rpc.mockImplementation((nome: string, args?: Record<string, unknown>) => {
      if (nome !== 'registrar_item_da_vistoria') return padrao(nome, args)
      enviados.push(args?.p_comentario)
      if (enviados.length > 1) return Promise.resolve({ data: null, error: null })
      return new Promise((resolver) => {
        soltar = () => {
          resolver({ data: null, error: null })
        }
      })
    })
    await fila.definirUsuario('u1')
    await fila.registrar(item('i1', '2026-11-21T10:00:00Z', 'primeiro'))
    await vi.waitFor(() => {
      expect(soltar).not.toBeNull()
    })
    await fila.registrar(item('i1', '2026-11-21T10:01:00Z', 'segundo'))
    ;(soltar as unknown as () => void)()
    await vi.waitFor(() => {
      expect(fila.obter().pendencias).toEqual([])
    })
    expect(enviados).toEqual(['primeiro', 'segundo'])
    falso.cliente.rpc.mockImplementation(padrao)
  })

  it('recusa do servidor para aquele registro e segue com os outros', async () => {
    falso.reiniciar({
      rpc: {
        registrar_item_da_vistoria: (args) =>
          args.p_item_id === 'i1' ? { error: { message: 'vistoria_fechada' } } : { data: null },
      },
    })
    await fila.definirUsuario('u1')
    await fila.registrar(item('i1', '2026-11-21T10:00:00Z'))
    await fila.registrar(item('i2', '2026-11-21T10:01:00Z'))
    await fila.processar()

    expect(fila.obter().pendencias.map((p) => [p.registro.tipo, p.estado])).toEqual([
      ['item', 'recusado'],
    ])
    await fila.descartar(fila.obter().pendencias[0]?.id ?? '')
    expect(await criarArmazem().listar('u1')).toEqual([])
  })

  it('outra conta no mesmo celular apaga o rascunho da anterior; a mesma conta o recupera', async () => {
    falso.reiniciar({ rpc: { registrar_item_da_vistoria: SEM_REDE } })
    await fila.definirUsuario('u1')
    await fila.registrar(item('i1', '2026-11-21T10:00:00Z'))
    await fila.processar()

    // Sair e voltar com a mesma conta: continua lá.
    await fila.definirUsuario(null)
    expect(fila.obter().pendencias).toEqual([])
    await fila.definirUsuario('u1')
    expect(fila.obter().pendencias).toHaveLength(1)

    // Outra conta: o da u1 sai do aparelho.
    await fila.definirUsuario('u2')
    expect(fila.obter().pendencias).toEqual([])
    expect(await criarArmazem().listar('u1')).toEqual([])
  })

  it('sem sessão não grava nada', async () => {
    await expect(fila.registrar(item('i1', '2026-11-21T10:00:00Z'))).rejects.toThrow('sem_sessao')
  })
})

describe('ehFalhaDeConexao', () => {
  it('rede fora, tempo esgotado, servidor fora e sessão a renovar são conexão', () => {
    expect(ehFalhaDeConexao(new TypeError('Failed to fetch'))).toBe(true)
    expect(ehFalhaDeConexao({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true)
    expect(ehFalhaDeConexao({ message: 'Load failed' })).toBe(true)
    expect(ehFalhaDeConexao({ status: 503, message: 'x' })).toBe(true)
    expect(ehFalhaDeConexao({ statusCode: '401', message: 'jwt expired' })).toBe(true)
    expect(ehFalhaDeConexao({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
    expect(ehFalhaDeConexao({ name: 'StorageUnknownError', message: 'x' })).toBe(true)
    expect(ehFalhaDeConexao('qualquer coisa')).toBe(true)
  })

  it('o banco dizendo não é recusa', () => {
    expect(ehFalhaDeConexao({ message: 'vistoria_fechada', code: 'P0001' })).toBe(false)
    expect(ehFalhaDeConexao({ message: 'arquivo_nao_encontrado' })).toBe(false)
    expect(ehFalhaDeConexao({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(ehFalhaDeConexao({ status: 403, message: 'proibido' })).toBe(false)
  })
})
