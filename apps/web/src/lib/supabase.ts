import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import { lerAmbiente } from './env'

let cliente: SupabaseClient<Database> | undefined

/**
 * Cliente supabase-js tipado, criado na primeira chamada (o shell não depende de configuração
 * para abrir). Usa sempre a chave anônima + o JWT do usuário logado; a autorização é a RLS.
 * Tipos gerados por `corepack pnpm db:types` (ou pelo job "banco" do CI).
 */
export function obterSupabase(): SupabaseClient<Database> {
  if (!cliente) {
    const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = lerAmbiente()
    cliente = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  }
  return cliente
}
