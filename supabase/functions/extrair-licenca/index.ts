// Edge Function extrair-licenca (épico 9; IA-01, IA-03, IA-04; ADR-0006).
//
// A orquestração (iniciar com o JWT de quem pediu, baixar e ler o PDF, cota, provedor, concluir ou
// registrar a falha com a service role) vive em _shared/extrair-licenca.ts, testada com
// `deno test`. Aqui só ligamos o Supabase, o Storage, o unpdf e o adapter do OpenRouter.
// Segredos: OPENROUTER_API_KEY (obrigatório) e OPENROUTER_MODEL (opcional). Nunca em log.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1'

import { criarTratadorDaExtracao, type InicioDaExtracao } from '../_shared/extrair-licenca.ts'
import { criarExtratorOpenRouter } from './openrouter.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }

function clienteDoUsuario(autorizacao: string) {
  return createClient(url, anonima, {
    ...opcoes,
    global: { headers: { Authorization: autorizacao } },
  })
}

const admin = createClient(url, servico, opcoes)

Deno.serve(
  criarTratadorDaExtracao({
    env: (nome) => Deno.env.get(nome),
    async iniciar(autorizacao, extracaoId, instrumentoId) {
      const { data, error } = await clienteDoUsuario(autorizacao).rpc('iniciar_extracao_ia', {
        p_id: extracaoId,
        p_instrumento_id: instrumentoId,
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: (data as InicioDaExtracao[] | null)?.[0] ?? null, erro: null }
    },
    async baixarPdf(autorizacao, caminho) {
      const { data, error } = await clienteDoUsuario(autorizacao)
        .storage.from('arquivos')
        .download(caminho)
      if (error) return { dados: null, erro: error.message }
      return { dados: new Uint8Array(await data.arrayBuffer()), erro: null }
    },
    async lerPdf(pdf) {
      const extraido = await extractText(await getDocumentProxy(pdf), { mergePages: false })
      return { totalPaginas: extraido.totalPages, textos: extraido.text }
    },
    async reservar(extracaoId) {
      const { data, error } = await admin.rpc('reservar_extracao_ia', { p_id: extracaoId })
      if (error) return { dados: null, erro: error.message }
      return { dados: data === true, erro: null }
    },
    criarExtrator: criarExtratorOpenRouter,
    async concluir(extracaoId, proposta, registro) {
      const { data, error } = await admin.rpc('concluir_extracao_ia', {
        p_id: extracaoId,
        p_resultado: proposta,
        p_modelo: registro.modelo,
        p_versao_prompt: registro.versaoPrompt,
        p_tokens_entrada: registro.tokensEntrada,
        p_tokens_saida: registro.tokensSaida,
        p_custo_micros: registro.custoMicros,
        p_paginas: registro.paginas,
        p_duracao_ms: registro.duracaoMs,
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: data as number, erro: null }
    },
    async falhar(extracaoId, motivo, registro, detalhe) {
      const { error } = await admin.rpc('falhar_extracao_ia', {
        p_id: extracaoId,
        p_motivo: motivo,
        p_modelo: registro.modelo,
        p_versao_prompt: registro.versaoPrompt,
        p_tokens_entrada: registro.tokensEntrada,
        p_tokens_saida: registro.tokensSaida,
        p_custo_micros: registro.custoMicros,
        p_paginas: registro.paginas,
        p_duracao_ms: registro.duracaoMs,
        p_detalhe: detalhe,
      })
      return { erro: error ? error.message : null }
    },
  }),
)
