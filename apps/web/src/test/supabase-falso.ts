// Supabase falso para os testes do front: sessão, RPCs e leituras de tabela controladas pelo teste.
// Uso: vi.mock('@/lib/supabase', () => import('@/test/supabase-falso')) e falso.reiniciar({...}).

import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

interface Resposta {
  data?: unknown
  error?: unknown
  count?: number
}
type Evento = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'USER_UPDATED'
type Ouvinte = (evento: Evento, sessao: Session | null) => void

export interface Cenario {
  sessao?: Session | null
  /** Resposta de cada RPC, por nome; função recebe os argumentos. */
  rpc?: Record<string, Resposta | ((args: Record<string, unknown>) => Resposta)>
  /** Linhas devolvidas por from(tabela).select()… (sem filtrar: o teste monta o que quer ver). */
  tabelas?: Record<string, unknown[]>
  /** Resposta de signInWithPassword; padrão: entra com `sessaoAoEntrar`. */
  entrar?: Resposta
  sessaoAoEntrar?: Session
}

export function sessaoDe(email: string, nome: string, id = `u-${email}`): Session {
  return {
    access_token: 'token-falso',
    refresh_token: 'refresh-falso',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id,
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: { nome },
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

function criar() {
  let cenario: Cenario = {}
  let sessao: Session | null = null
  const ouvintes = new Set<Ouvinte>()

  const emitir = (evento: Evento) => {
    for (const ouvinte of ouvintes) ouvinte(evento, sessao)
  }

  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: sessao }, error: null })),
    onAuthStateChange: vi.fn((ouvinte: Ouvinte) => {
      ouvintes.add(ouvinte)
      return { data: { subscription: { unsubscribe: () => ouvintes.delete(ouvinte) } } }
    }),
    signInWithPassword: vi.fn(() => {
      const resposta = cenario.entrar
      if (resposta?.error)
        return Promise.resolve({ data: { session: null }, error: resposta.error })
      sessao = cenario.sessaoAoEntrar ?? sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')
      emitir('SIGNED_IN')
      return Promise.resolve({ data: { session: sessao }, error: null })
    }),
    signOut: vi.fn(() => {
      sessao = null
      emitir('SIGNED_OUT')
      return Promise.resolve({ error: null })
    }),
    signUp: vi.fn(() =>
      Promise.resolve({ data: { user: { identities: [{}] }, session: null }, error: null }),
    ),
    resetPasswordForEmail: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    updateUser: vi.fn(() => Promise.resolve({ data: { user: sessao?.user }, error: null })),
    signInWithOtp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  }

  const rpc = vi.fn((nome: string, args: Record<string, unknown> = {}) => {
    const definida = cenario.rpc?.[nome]
    const resposta = typeof definida === 'function' ? definida(args) : definida
    return Promise.resolve({ data: resposta?.data ?? null, error: resposta?.error ?? null })
  })

  function consulta(tabela: string) {
    const linhas = () => cenario.tabelas?.[tabela] ?? []
    const construtor = {
      select: () => construtor,
      eq: () => construtor,
      order: () => construtor,
      range: () => construtor,
      maybeSingle: () => Promise.resolve({ data: linhas()[0] ?? null, error: null }),
      then: (resolver: (valor: unknown) => unknown, rejeitar?: (erro: unknown) => unknown) =>
        Promise.resolve({ data: linhas(), error: null, count: linhas().length }).then(
          resolver,
          rejeitar,
        ),
    }
    return construtor
  }

  const armazenamento = {
    upload: vi.fn((caminho: string) => Promise.resolve({ data: { path: caminho }, error: null })),
    createSignedUrl: vi.fn((caminho: string) =>
      Promise.resolve({ data: { signedUrl: `https://falso.test/${caminho}` }, error: null }),
    ),
  }
  const storage = { from: vi.fn(() => armazenamento) }

  const cliente = { auth, rpc, from: vi.fn(consulta), storage }

  return {
    cliente,
    reiniciar(novo: Cenario) {
      cenario = novo
      sessao = novo.sessao ?? null
      ouvintes.clear()
      for (const funcao of [...Object.values(auth), ...Object.values(armazenamento), rpc]) {
        funcao.mockClear()
      }
    },
    /** Encerra a sessão como se tivesse expirado (sem a pessoa pedir). */
    expirarSessao() {
      sessao = null
      emitir('SIGNED_OUT')
    },
  }
}

export const falso = criar()

export function obterSupabase() {
  return falso.cliente
}
