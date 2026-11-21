// Edge Function feed-calendario (ADR-0047): GET público /functions/v1/feed-calendario/<token>.ics
// com os prazos do membro em eventos de dia inteiro. A regra fica em _shared/feed-calendario.ts.
// verify_jwt = false (supabase/config.toml): o token na URL é a credencial; o banco guarda só o
// hash dele. LINK_DO_BETA opcional (link de cada evento). Nunca em log: o token nem o hash.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoFeed, type LinhaDoFeed } from '../_shared/feed-calendario.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(url, servico, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface LinhaDoBanco {
  tipo_linha: string
  id: string
  prazo: string
  codigo: string | null
  empreendimento_nome: string | null
}

Deno.serve(
  criarTratadorDoFeed({
    env: (nome) => Deno.env.get(nome),
    async feed(hash): Promise<LinhaDoFeed[] | null> {
      const { data, error } = await admin.rpc('feed_do_calendario', { p_token_hash: hash })
      if (error) {
        if (error.message === 'token_invalido') return null
        throw new Error('feed')
      }
      return ((data ?? []) as LinhaDoBanco[]).map((l) => ({
        tipoLinha: l.tipo_linha,
        id: l.id,
        prazo: l.prazo,
        codigo: l.codigo,
        empreendimentoNome: l.empreendimento_nome,
      }))
    },
  }),
)
