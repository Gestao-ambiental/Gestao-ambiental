// Edge Function conferir-arquivo: recalcula no servidor o SHA-256 do arquivo de uma versão e grava
// se confere com o declarado no envio. A regra vive em _shared/conferir-arquivo.ts (testada com
// `deno test`); aqui só ligamos o Supabase. A service role só baixa o objeto e grava o resultado,
// depois de o JWT de quem pediu provar, pela RLS, que a versão é da consultoria dele.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDaConferenciaDeArquivo } from '../_shared/conferir-arquivo.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }

const admin = createClient(url, servico, opcoes)

Deno.serve(
  criarTratadorDaConferenciaDeArquivo({
    async lerVersao(autorizacao, versaoId) {
      const cliente = createClient(url, anonima, {
        ...opcoes,
        global: { headers: { Authorization: autorizacao } },
      })
      const { data, error } = await cliente
        .from('documento_versao')
        .select('caminho, conferencia_de_arquivo(confere, sha256_calculado)')
        .eq('id', versaoId)
        .maybeSingle()
      if (error) return { dados: null, erro: error.message }
      if (!data) return { dados: null, erro: null }
      const feita = Array.isArray(data.conferencia_de_arquivo)
        ? data.conferencia_de_arquivo[0]
        : data.conferencia_de_arquivo
      return {
        dados: {
          caminho: data.caminho as string,
          confere: (feita?.confere as boolean | undefined) ?? null,
          sha256Calculado: (feita?.sha256_calculado as string | undefined) ?? null,
        },
        erro: null,
      }
    },
    async baixar(caminho) {
      const { data, error } = await admin.storage.from('arquivos').download(caminho)
      if (error) return { dados: null, erro: error.message }
      return { dados: new Uint8Array(await data.arrayBuffer()), erro: null }
    },
    async registrar(versaoId, sha256) {
      const { data, error } = await admin.rpc('registrar_conferencia_de_arquivo', {
        p_versao_id: versaoId,
        p_sha256: sha256,
      })
      if (error) return { dados: null, erro: error.message }
      return { dados: data === true, erro: null }
    },
  }),
)
