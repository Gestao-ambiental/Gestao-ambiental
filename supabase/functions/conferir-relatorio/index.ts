// Edge Function conferir-relatorio (ADR-0036, fatia 3): confere com IA o relatório anexado como
// evidência, antes da Gestão. A orquestração vive em _shared/conferir-relatorio.ts, testada com
// `deno test`. Aqui só ligamos o Supabase, o Storage, o unpdf, o fflate (.docx) e o adapter.
// Segredos: OPENROUTER_API_KEY (obrigatório) e OPENROUTER_MODEL (opcional). Nunca em log.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { strFromU8, unzipSync } from 'npm:fflate@0.8.3'
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1'

import { textoDoDocx } from '../_shared/conferencia.ts'
import {
  criarTratadorDaConferencia,
  type InicioDaConferencia,
} from '../_shared/conferir-relatorio.ts'
import { criarConferidorOpenRouter } from './openrouter.ts'

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

function registro(r: {
  modelo: string
  versaoPrompt: string
  tokensEntrada: number | null
  tokensSaida: number | null
  custoMicros: number | null
  duracaoMs: number
}) {
  return {
    p_modelo: r.modelo,
    p_versao_prompt: r.versaoPrompt,
    p_tokens_entrada: r.tokensEntrada,
    p_tokens_saida: r.tokensSaida,
    p_custo_micros: r.custoMicros,
    p_duracao_ms: r.duracaoMs,
  }
}

Deno.serve(
  criarTratadorDaConferencia({
    env: (nome) => Deno.env.get(nome),
    async iniciar(autorizacao, conferenciaId, evidenciaId) {
      const { data, error } = await clienteDoUsuario(autorizacao).rpc('iniciar_conferencia_ia', {
        p_id: conferenciaId,
        p_evidencia_id: evidenciaId,
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: (data as InicioDaConferencia[] | null)?.[0] ?? null, erro: null }
    },
    async iniciarRelatorio(autorizacao, conferenciaId, relatorioId, versao) {
      const { data, error } = await clienteDoUsuario(autorizacao).rpc(
        'iniciar_conferencia_relatorio',
        { p_id: conferenciaId, p_relatorio_id: relatorioId, p_versao: versao },
      )
      if (error) return { dados: null, erro: error.message }
      const linha = (
        data as Omit<InicioDaConferencia, 'caminho' | 'mime' | 'tamanho_bytes'>[] | null
      )?.[0]
      return {
        dados: linha ? { ...linha, caminho: null, mime: null, tamanho_bytes: null } : null,
        erro: null,
      }
    },
    async baixar(autorizacao, caminho) {
      const { data, error } = await clienteDoUsuario(autorizacao)
        .storage.from('arquivos')
        .download(caminho)
      if (error) return { dados: null, erro: error.message }
      return { dados: new Uint8Array(await data.arrayBuffer()), erro: null }
    },
    async lerPdf(pdf) {
      const extraido = await extractText(await getDocumentProxy(pdf), { mergePages: false })
      return extraido.text
    },
    lerDocx(docx) {
      const arquivos = unzipSync(docx, {
        filter: (f: { name: string }) => f.name === 'word/document.xml',
      })
      const xml = arquivos['word/document.xml']
      if (!xml) return Promise.reject(new Error('sem word/document.xml'))
      return Promise.resolve(textoDoDocx(strFromU8(xml)))
    },
    async reservar(conferenciaId) {
      const { data, error } = await admin.rpc('reservar_conferencia_ia', { p_id: conferenciaId })
      if (error) return { dados: null, erro: error.message }
      return { dados: data === true, erro: null }
    },
    criarConferidor: criarConferidorOpenRouter,
    async concluir(conferenciaId, resumo, apontamentos, r) {
      const { data, error } = await admin.rpc('concluir_conferencia_ia', {
        p_id: conferenciaId,
        p_resumo: resumo,
        p_apontamentos: apontamentos,
        ...registro(r),
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: data as number, erro: null }
    },
    async falhar(conferenciaId, motivo, detalhe, apontamentos, r) {
      const { error } = await admin.rpc('falhar_conferencia_ia', {
        p_id: conferenciaId,
        p_motivo: motivo,
        p_detalhe: detalhe,
        p_apontamentos: apontamentos,
        ...registro(r),
      })
      return { erro: error ? error.message : null }
    },
  }),
)
