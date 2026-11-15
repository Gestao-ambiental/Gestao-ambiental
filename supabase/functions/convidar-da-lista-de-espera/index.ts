// Edge Function convidar-da-lista-de-espera (ADR-0034).
//
// A central chama esta função para convidar por e-mail quem está na lista de espera. Com o JWT de
// quem chama, o banco confere operador com dois fatores, registra o convite e devolve o contato; a
// função manda o convite pelo Resend com o link de criar conta do beta (LINK_DO_BETA, padrão
// https://beta.gramaapp.com.br).
// Segredos: RESEND_API_KEY e AVISO_REMETENTE. Nunca em log, nem o contato.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoConvite } from '../_shared/lista-de-espera.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

interface LinhaDoConvite {
  nome: string
  contato: string
  tipo_contato: 'email' | 'whatsapp'
}

Deno.serve(
  criarTratadorDoConvite({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async registrarConvite(autorizacao, id) {
      const usuario = createClient(url, anonima, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: autorizacao } },
      })
      const { data, error } = await usuario.rpc('central_registrar_convite', { p_id: id })
      if (error) return { dados: null, erro: error.message }
      const linha = (data as LinhaDoConvite[] | null)?.[0]
      if (!linha) return { dados: null, erro: 'cadastro_inexistente' }
      return {
        erro: null,
        dados: { nome: linha.nome, contato: linha.contato, tipoContato: linha.tipo_contato },
      }
    },
  }),
)
