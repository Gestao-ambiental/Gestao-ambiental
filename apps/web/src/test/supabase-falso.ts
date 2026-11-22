// Supabase falso para os testes do front: sessão, RPCs e leituras de tabela controladas pelo teste.
// Uso: vi.mock('@/lib/supabase', () => import('@/test/supabase-falso')) e falso.reiniciar({...}).

import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

interface Resposta {
  data?: unknown
  error?: unknown
  count?: number
}
type Evento =
  'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'USER_UPDATED' | 'MFA_CHALLENGE_VERIFIED'
type Ouvinte = (evento: Evento, sessao: Session | null) => void

/** Fator de dois fatores (TOTP) da conta, como o Auth devolve em listFactors().all. */
export interface FatorFalso {
  id: string
  status: 'verified' | 'unverified'
}

export interface CenarioDoisFatores {
  /** Nível da sessão atual. Padrão: aal1 (entrou só com senha). */
  nivel?: 'aal1' | 'aal2'
  /** Fatores da conta. Padrão: nenhum. */
  fatores?: FatorFalso[]
  /** Resposta de challengeAndVerify; padrão: código aceito (sessão vira aal2). */
  verificar?: Resposta
  /** Resposta de enroll; padrão: cria o fator 'fator-novo' com QR code e chave falsos. */
  cadastrar?: Resposta
  /** Resposta de unenroll; padrão: remove o fator. */
  remover?: Resposta
  /** Erro ao ler o nível da sessão (getAuthenticatorAssuranceLevel). */
  erroAoLer?: unknown
}

/**
 * Linhas da RPC catalogo_comercial iguais às da migration (o padrão do domínio). Usadas quando o
 * cenário não define `catalogo_comercial`, para as telas de preço e limite não pararem no erro.
 */
export const CATALOGO_COMERCIAL_FALSO = [
  ['essencial', 'Essencial', 99000, 3, 10, false, false, 1],
  ['equipe', 'Equipe', 129000, 10, 30, true, true, 2],
  ['escala', 'Escala', 299000, 25, 100, true, true, 3],
].map(([codigo, nome, mensal, pessoas, empreendimentos, orcamentos, ia, ordem]) => ({
  codigo,
  nome,
  mensal_centavos: mensal,
  pessoas,
  empreendimentos,
  orcamentos,
  ia,
  ordem,
  adicional_mensal_centavos: 2000,
  mensalidades_no_anual: 10,
  dias_de_teste_padrao: 10,
  dias_uteis_de_tolerancia: 2,
  fim_do_beta: '2027-01-31',
  moeda: 'BRL',
  recursos:
    codigo === 'escala'
      ? ['capacidade', 'integracao_ima', 'financeiro', 'analise_lotes']
      : codigo === 'equipe'
        ? ['capacidade']
        : [],
}))

export interface Cenario {
  sessao?: Session | null
  /** Resposta de cada RPC, por nome; função recebe os argumentos. */
  rpc?: Record<string, Resposta | ((args: Record<string, unknown>) => Resposta)>
  /** Resposta de cada Edge Function, por nome; função recebe o corpo. */
  funcoes?: Record<string, Resposta | ((corpo: Record<string, unknown>) => Resposta)>
  /** Linhas devolvidas por from(tabela).select()… (sem filtrar: o teste monta o que quer ver). */
  tabelas?: Record<string, unknown[]>
  /**
   * Formação e gênero do vínculo atual, lidos antes do sistema (RequerCadastroCompleto). Padrão:
   * cadastro completo, para os testes das outras telas não pararem em "Complete seu cadastro".
   */
  cadastro?: {
    profissao: string | null
    genero: string | null
    profissao_em_curso?: boolean
  } | null
  /** Resposta de signInWithOAuth (Google); padrão: sai para o Google sem erro. */
  oauth?: Resposta
  /** Resposta de signInWithPassword; padrão: entra com `sessaoAoEntrar`. */
  entrar?: Resposta
  sessaoAoEntrar?: Session
  /** Dois fatores (supabase.auth.mfa). */
  doisFatores?: CenarioDoisFatores
}

/** Chave e QR code falsos devolvidos pelo cadastro de dois fatores. */
export const SEGREDO_FALSO = 'JBSWY3DPEHPK3PXP'
export const QR_CODE_FALSO = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

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

const CADASTRO_COMPLETO = { profissao: 'eng_ambiental', genero: 'masculino' }

function criar() {
  let cenario: Cenario = {}
  let sessao: Session | null = null
  let nivel: 'aal1' | 'aal2' = 'aal1'
  let fatores: FatorFalso[] = []
  const ouvintes = new Set<Ouvinte>()

  const emitir = (evento: Evento) => {
    for (const ouvinte of ouvintes) ouvinte(evento, sessao)
  }

  const comoFator = (f: FatorFalso) => ({
    id: f.id,
    status: f.status,
    factor_type: 'totp',
    friendly_name: '',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  })

  const mfa = {
    getAuthenticatorAssuranceLevel: vi.fn(() =>
      cenario.doisFatores?.erroAoLer
        ? Promise.resolve({ data: null, error: cenario.doisFatores.erroAoLer })
        : Promise.resolve({
            data: {
              currentLevel: nivel,
              nextLevel: fatores.some((f) => f.status === 'verified') ? 'aal2' : 'aal1',
              currentAuthenticationMethods: [],
            },
            error: null,
          }),
    ),
    listFactors: vi.fn(() =>
      Promise.resolve({
        data: {
          all: fatores.map(comoFator),
          totp: fatores.filter((f) => f.status === 'verified').map(comoFator),
          phone: [],
        },
        error: null,
      }),
    ),
    enroll: vi.fn(() => {
      const resposta = cenario.doisFatores?.cadastrar
      if (resposta?.error) return Promise.resolve({ data: null, error: resposta.error })
      fatores = [...fatores, { id: 'fator-novo', status: 'unverified' }]
      return Promise.resolve({
        data: {
          id: 'fator-novo',
          type: 'totp',
          friendly_name: '',
          totp: { qr_code: QR_CODE_FALSO, secret: SEGREDO_FALSO, uri: 'otpauth://totp/Grama' },
        },
        error: null,
      })
    }),
    challengeAndVerify: vi.fn(({ factorId }: { factorId: string; code: string }) => {
      const resposta = cenario.doisFatores?.verificar
      if (resposta?.error) return Promise.resolve({ data: null, error: resposta.error })
      fatores = fatores.map((f): FatorFalso =>
        f.id === factorId ? { ...f, status: 'verified' } : f,
      )
      nivel = 'aal2'
      emitir('MFA_CHALLENGE_VERIFIED')
      return Promise.resolve({ data: {}, error: null })
    }),
    unenroll: vi.fn(({ factorId }: { factorId: string }) => {
      const resposta = cenario.doisFatores?.remover
      if (resposta?.error) return Promise.resolve({ data: null, error: resposta.error })
      fatores = fatores.filter((f) => f.id !== factorId)
      return Promise.resolve({ data: { id: factorId }, error: null })
    }),
  }

  const funcoesDoAuth = {
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
    signInWithOAuth: vi.fn(() =>
      Promise.resolve({
        data: { provider: 'google', url: 'https://accounts.google.test/' },
        error: null,
        ...cenario.oauth,
      }),
    ),
  }
  const auth = { ...funcoesDoAuth, mfa }

  const rpc = vi.fn((nome: string, args: Record<string, unknown> = {}) => {
    const definida =
      cenario.rpc?.[nome] ??
      (nome === 'catalogo_comercial' ? { data: CATALOGO_COMERCIAL_FALSO } : undefined)
    const resposta = typeof definida === 'function' ? definida(args) : definida
    return Promise.resolve({ data: resposta?.data ?? null, error: resposta?.error ?? null })
  })

  function consulta(tabela: string) {
    let faixa: [number, number] | null = null
    const todas = () => cenario.tabelas?.[tabela] ?? []
    const linhas = () => (faixa ? todas().slice(faixa[0], faixa[1] + 1) : todas())
    let colunas = ''
    const construtor = {
      select: (lidas = '') => {
        colunas = lidas
        return construtor
      },
      eq: () => construtor,
      neq: () => construtor,
      in: () => construtor,
      is: () => construtor,
      order: () => construtor,
      range: (de: number, ate: number) => {
        faixa = [de, ate]
        return construtor
      },
      maybeSingle: () => {
        // A leitura do cadastro (lib/api/perfil: COLUNAS_CADASTRO) vem do cenário, não da tabela.
        if (tabela === 'membro' && colunas === 'profissao, profissao_em_curso, genero') {
          const cadastro = cenario.cadastro === undefined ? CADASTRO_COMPLETO : cenario.cadastro
          // Como no banco, "em curso" nunca é nulo: falso quando o cenário não diz.
          return Promise.resolve({
            data: cadastro ? { profissao_em_curso: false, ...cadastro } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: linhas()[0] ?? null, error: null })
      },
      then: (resolver: (valor: unknown) => unknown, rejeitar?: (erro: unknown) => unknown) =>
        Promise.resolve({ data: linhas(), error: null, count: todas().length }).then(
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
    createSignedUrls: vi.fn((caminhos: string[]) =>
      Promise.resolve({
        data: caminhos.map((caminho) => ({
          path: caminho,
          signedUrl: `https://falso.test/${caminho}`,
          error: null,
        })),
        error: null,
      }),
    ),
  }
  const storage = { from: vi.fn(() => armazenamento) }

  const functions = {
    invoke: vi.fn((nome: string, opcoes: { body?: Record<string, unknown> } = {}) => {
      const definida = cenario.funcoes?.[nome]
      const resposta = typeof definida === 'function' ? definida(opcoes.body ?? {}) : definida
      return Promise.resolve({ data: resposta?.data ?? null, error: resposta?.error ?? null })
    }),
  }

  const cliente = { auth, rpc, from: vi.fn(consulta), storage, functions }

  return {
    cliente,
    reiniciar(novo: Cenario) {
      cenario = novo
      sessao = novo.sessao ?? null
      nivel = novo.doisFatores?.nivel ?? 'aal1'
      fatores = novo.doisFatores?.fatores ?? []
      ouvintes.clear()
      for (const funcao of [
        ...Object.values(funcoesDoAuth),
        ...Object.values(mfa),
        ...Object.values(armazenamento),
        rpc,
        functions.invoke,
      ]) {
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
