// Edge Function avisar-lista-de-espera (ADR-0034).
//
// Chamada pelo gatilho do banco (pg_net) a cada cadastro novo na lista de espera, com o header
// x-aviso-token. Com a service role, lê os cadastros ainda sem aviso e os e-mails dos operadores,
// manda um e-mail pelo Resend e marca os cadastros como avisados. verify_jwt = false no config.toml:
// quem chama é o banco, e o token é a única credencial aceita.
// Segredos: LISTA_AVISO_TOKEN, RESEND_API_KEY e AVISO_REMETENTE. Nunca em log, nem os contatos.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoAvisoDaLista, type PendentesDeAviso } from '../_shared/lista-de-espera.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(url, servico, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface Bruto {
  cadastros: {
    id: string
    nome: string
    contato: string
    tipo_contato: 'email' | 'whatsapp'
    criada_em: string
  }[]
  destinatarios: string[]
}

Deno.serve(
  criarTratadorDoAvisoDaLista({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async pendentes(): Promise<PendentesDeAviso> {
      const { data, error } = await admin.rpc('lista_de_espera_pendente_de_aviso')
      if (error) throw new Error('pendentes')
      const bruto = data as Bruto
      return {
        destinatarios: bruto.destinatarios.filter((e) => e.includes('@')),
        cadastros: bruto.cadastros.map((c) => ({
          id: c.id,
          nome: c.nome,
          contato: c.contato,
          tipoContato: c.tipo_contato,
          criadaEm: c.criada_em,
        })),
      }
    },
    async marcarAvisados(ids) {
      const { data, error } = await admin.rpc('lista_de_espera_marcar_avisados', { p_ids: ids })
      if (error) throw new Error('marcar')
      return data as number
    },
  }),
)
