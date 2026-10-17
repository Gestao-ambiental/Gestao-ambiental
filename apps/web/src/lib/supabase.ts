import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { armazenamentoSessao } from './armazenamento-sessao'
import type { Database } from './database.types'
import { lerAmbiente } from './env'

let cliente: SupabaseClient<Database> | undefined

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
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return cliente
}
