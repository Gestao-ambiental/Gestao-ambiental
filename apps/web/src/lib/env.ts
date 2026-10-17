import { z } from 'zod'

// Só chaves públicas: a anon/publishable key funciona dentro das políticas de RLS.
// A service role nunca chega ao front (CLAUDE.md, ADR-0003).
const esquema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})

export type Ambiente = z.infer<typeof esquema>

/** Lê e valida as variáveis do front. Lança erro legível se faltar configuração. */
export function lerAmbiente(variaveis: Record<string, unknown> = import.meta.env): Ambiente {
  const resultado = esquema.safeParse(variaveis)
  if (!resultado.success) {
    throw new Error(
      'Configuração do Supabase ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ' +
        'em apps/web/.env.local (veja .env.example) ou nas variáveis da Vercel.',
    )
  }
  return resultado.data
}
