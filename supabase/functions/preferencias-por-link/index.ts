// Edge Function preferencias-por-link (ADR-0047): descadastro do resumo diário sem login, pelo
// List-Unsubscribe one-click do e-mail ou pela página /avisos/parar do app. Só POST desliga. A
// regra fica em _shared/preferencias-por-link.ts.
// verify_jwt = false (supabase/config.toml): o token assinado (AVISO_ASSINATURA) é a credencial.
// Nunca em log: o token nem os ids.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoDescadastro } from '../_shared/preferencias-por-link.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(url, servico, {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(
  criarTratadorDoDescadastro({
    env: (nome) => Deno.env.get(nome),
    async desligar(consultoriaId, membroId) {
      const { data, error } = await admin.rpc('desligar_resumo_por_link', {
        p_consultoria_id: consultoriaId,
        p_membro_id: membroId,
      })
      if (error) throw new Error('desligar')
      return data === true
    },
  }),
)
