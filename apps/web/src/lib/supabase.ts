import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { armazenamentoSessao } from './armazenamento-sessao'
import type { Database } from './database.types'
import { lerAmbiente } from './env'

let cliente: SupabaseClient<Database> | undefined

function chaveDaSessao(url: string): string {
  const { hostname } = new URL(url)
  return `sb-${hostname.split('.')[0] ?? hostname}-auth-token`
}

/** Identifica a conta lembrada apenas para abrir registros preparados neste navegador. */
export function usuarioDaSessaoLocal(): string | undefined {
  try {
    const texto = armazenamentoSessao.getItem(chaveDaSessao(lerAmbiente().VITE_SUPABASE_URL))
    if (!texto) return undefined
    const salvo = JSON.parse(texto) as { user?: { id?: unknown } }
    return typeof salvo.user?.id === 'string' ? salvo.user.id : undefined
  } catch {
    return undefined
  }
}

/**
 * Cliente supabase-js tipado, criado na primeira chamada. Usa sempre a chave anônima + o JWT do
 * usuário logado; a autorização é a RLS. Tipos gerados por `corepack pnpm db:types` (ou pelo job
 * "banco" do CI).
 *
 * Fluxo implícito: os links de e-mail (convite, recuperação de senha, confirmação) trazem a sessão
 * no próprio link e funcionam em outro aparelho (ACC-02). O PKCE exigiria abrir o link no mesmo
 * navegador que pediu o e-mail.
 */
export function obterSupabase(): SupabaseClient<Database> {
  if (!cliente) {
    const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = lerAmbiente()
    cliente = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'implicit',
        storage: armazenamentoSessao,
        storageKey: chaveDaSessao(VITE_SUPABASE_URL),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return cliente
}
