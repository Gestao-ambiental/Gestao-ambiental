// Edge Function avisar-acesso-de-suporte (ADR-0025; Termos de Uso §13.3 b).
//
// O front da central chama esta função logo depois de abrir um acesso de emergência. Ela confere,
// com o JWT de quem chama, que existe acesso de emergência valendo aberto por esse operador (o
// banco exige operador com dois fatores), lê os e-mails da Gestão ativa com a service role e envia
// o aviso pelo Resend. Falhar aqui nunca desfaz o acesso: a faixa de aviso aparece para a Gestão no
// Grama do mesmo jeito.
// Segredos: RESEND_API_KEY e AVISO_REMETENTE (ex.: "Grama <avisos@dominio>"). Nunca em log, nem os
// e-mails e o motivo.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoAviso } from '../_shared/aviso-de-suporte.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }

interface LinhaDoAviso {
  acesso_id: string
  consultoria_id: string
  consultoria_nome: string
  consultoria_fuso: string
  categoria: string
  motivo: string
  inicio: string
  fim_previsto: string
  operador_nome: string
}

Deno.serve(
  criarTratadorDoAviso({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async conferirAviso(autorizacao, acessoId) {
      const usuario = createClient(url, anonima, {
        ...opcoes,
        global: { headers: { Authorization: autorizacao } },
      })
      const { data, error } = await usuario.rpc('dados_do_aviso_de_emergencia', {
        p_acesso_id: acessoId,
      })
      if (error) return { dados: null, erro: error.message }
      const linha = (data as LinhaDoAviso[] | null)?.[0]
      if (!linha) return { dados: null, erro: 'sem_acesso_de_emergencia' }
      return {
        erro: null,
        dados: {
          acessoId: linha.acesso_id,
          consultoriaId: linha.consultoria_id,
          consultoriaNome: linha.consultoria_nome,
          fuso: linha.consultoria_fuso,
          categoria: linha.categoria,
          motivo: linha.motivo,
          inicio: linha.inicio,
          fimPrevisto: linha.fim_previsto,
          operadorNome: linha.operador_nome,
        },
      }
    },
    async emailsDaGestao(consultoriaId) {
      const admin = createClient(url, servico, opcoes)
      const { data, error } = await admin
        .from('membro')
        .select('email')
        .eq('consultoria_id', consultoriaId)
        .eq('papel', 'gestao')
        .eq('situacao', 'ativo')
      if (error) throw new Error('membro')
      return (data as { email: string }[]).map((m) => m.email).filter((e) => e.includes('@'))
    },
  }),
)
