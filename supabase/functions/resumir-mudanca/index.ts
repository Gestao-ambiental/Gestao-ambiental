// Edge Function resumir-mudanca (ADR-0050, pacote L4): resume com IA uma mudança de norma do catálogo
// global, para o operador do Grama revisar e publicar na Central. A orquestração vive em
// _shared/resumir-mudanca.ts, testada com `deno test`. Aqui só ligamos o Supabase e o adapter.
//
// Chamada pelo gatilho do banco (pg_net, header x-resumo-token) a cada mudança detectada e pela
// Central (JWT do operador, conferido pelo banco em central_detalhe_da_mudanca_de_norma).
// verify_jwt = false no config.toml: o gatilho não tem JWT.
// Segredos: RESUMO_NORMAS_TOKEN, OPENROUTER_API_KEY e OPENROUTER_MODEL (opcional). Nunca em log.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDoResumo } from '../_shared/resumir-mudanca.ts'
import { criarResumidorOpenRouter } from './openrouter.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, servico, opcoes)

Deno.serve(
  criarTratadorDoResumo({
    env: (nome) => Deno.env.get(nome),
    async conferirOperador(autorizacao, mudancaId) {
      const usuario = createClient(url, anonima, {
        ...opcoes,
        global: { headers: { Authorization: autorizacao } },
      })
      const { error } = await usuario.rpc('central_detalhe_da_mudanca_de_norma', {
        p_id: mudancaId,
      })
      return { erro: error ? error.message : null }
    },
    async reservar(mudancaId) {
      const { data, error } = await admin.rpc('reservar_resumo_de_mudanca', {
        p_mudanca_id: mudancaId,
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: data as unknown, erro: null }
    },
    criarResumidor: criarResumidorOpenRouter,
    async concluir(reservaId, resumo, criterios, r) {
      const { error } = await admin.rpc('concluir_resumo_de_mudanca', {
        p_reserva_id: reservaId,
        p_resumo: resumo,
        p_criterios: criterios,
        p_modelo: r.modelo,
        p_versao_prompt: r.versaoPrompt,
        p_tokens_entrada: r.tokensEntrada,
        p_tokens_saida: r.tokensSaida,
        p_custo_micros: r.custoMicros,
        p_duracao_ms: r.duracaoMs,
      })
      return { erro: error ? error.message : null }
    },
    async falhar(reservaId, motivo) {
      const { error } = await admin.rpc('falhar_resumo_de_mudanca', {
        p_reserva_id: reservaId,
        p_motivo: motivo,
      })
      return { erro: error ? error.message : null }
    },
  }),
)
