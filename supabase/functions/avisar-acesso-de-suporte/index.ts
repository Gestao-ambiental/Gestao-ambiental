// Edge Function avisar-acesso-de-suporte (ADR-0025; Termos de Uso §13.3 b).
//
// Chamada pelo gatilho do banco (pg_net, header x-aviso-token) a cada acesso de emergência aberto
// e pelo front da central logo depois de abrir (JWT do operador, conferido pelo banco). A reserva
// no banco garante um e-mail só por acesso. Com a service role, lê os e-mails da Gestão ativa e
// envia o aviso pelo Resend. Falhar aqui nunca desfaz o acesso: a faixa de aviso aparece para a
// Gestão no Grama do mesmo jeito. verify_jwt = false no config.toml: o gatilho não tem JWT; o JWT do
// front é conferido pelo banco na RPC dados_do_aviso_de_emergencia.
// Segredos: SUPORTE_AVISO_TOKEN, RESEND_API_KEY e AVISO_REMETENTE (ex.: "Grama <avisos@dominio>").
// Nunca em log, nem os e-mails, o token e o motivo.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoAviso, type DadosDoAviso } from '../_shared/aviso-de-suporte.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, servico, opcoes)

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

function paraDados(linha: LinhaDoAviso): DadosDoAviso {
  return {
    acessoId: linha.acesso_id,
    consultoriaId: linha.consultoria_id,
    consultoriaNome: linha.consultoria_nome,
    fuso: linha.consultoria_fuso,
    categoria: linha.categoria,
    motivo: linha.motivo,
    inicio: linha.inicio,
    fimPrevisto: linha.fim_previsto,
    operadorNome: linha.operador_nome,
  }
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
      return { erro: null, dados: paraDados(linha) }
    },
    async reservarAviso(acessoId) {
      const { data, error } = await admin.rpc('reservar_aviso_de_emergencia', {
        p_acesso_id: acessoId,
      })
      if (error) throw new Error('reserva')
      const linha = (data as LinhaDoAviso[] | null)?.[0]
      return linha ? paraDados(linha) : null
    },
    async liberarAviso(acessoId) {
      const { error } = await admin.rpc('liberar_aviso_de_emergencia', { p_acesso_id: acessoId })
      if (error) throw new Error('liberar')
    },
    async emailsDaGestao(consultoriaId) {
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
