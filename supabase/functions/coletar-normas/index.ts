// Edge Function coletar-normas (pacotes L1, L2 e L8, ADR-0050): coleta as normas de uma fonte (IMA · INs, IMA
// · Portarias, CONSEMA). Chamada pelo pg_cron + pg_net (private.ligar_coleta_de_normas, desligado
// até a publicação) com o header x-cron-token. verify_jwt = false (supabase/config.toml): quem
// protege é o segredo COLETA_NORMAS_TOKEN.
//
// A regra vive em _shared/coleta-de-normas.ts e _shared/fontes/, testada com `deno test`. Aqui só
// ligamos o Supabase com a service role (RPCs da coleta e o bucket privado 'normas'), o fetch e o
// unpdf. Nunca vão para o log: o token, a chave nem textos de norma.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1'

import { criarTratadorDaColeta } from '../_shared/coleta-de-normas.ts'
import {
  BUCKET_DE_NORMAS,
  ErroDaColeta,
  type VersaoConhecida,
  type VersaoRegistrada,
} from '../_shared/fontes/comum.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(url, servico, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Códigos que as RPCs levantam de propósito; qualquer outro erro do banco vira banco_<rpc>, sem a
// mensagem (que pode trazer valores).
const CODIGOS_DO_BANCO = new Set([
  'fonte_inexistente',
  'fonte_desligada',
  'norma_inexistente',
  'coleta_inexistente',
  'publicada_em_invalida',
])

async function rpc<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros)
  if (error) {
    throw new ErroDaColeta(CODIGOS_DO_BANCO.has(error.message) ? error.message : `banco_${nome}`)
  }
  return data as T
}

Deno.serve(
  criarTratadorDaColeta({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async lerPdf(bytes) {
      const extraido = await extractText(await getDocumentProxy(bytes), { mergePages: true })
      return extraido.text
    },
    banco: {
      iniciarColeta: (fonte, janela, forcar) =>
        rpc<string | null>('iniciar_coleta', {
          p_fonte: fonte,
          p_janela: janela,
          p_forcar: forcar,
        }),
      garantirNorma: (norma) => rpc<string>('garantir_norma', { p_norma: norma }),
      async versoesConhecidas(fonte) {
        return (await rpc<VersaoConhecida[] | null>('versoes_conhecidas', { p_fonte: fonte })) ?? []
      },
      textoDaUltimaVersao: (normaId) =>
        rpc<string | null>('texto_da_ultima_versao', { p_norma_id: normaId }),
      registrarVersao: (coletaId, normaId, versao, diferenca, atoNovo) =>
        rpc<VersaoRegistrada>('registrar_versao_de_norma', {
          p_coleta_id: coletaId,
          p_norma_id: normaId,
          p_versao: versao,
          p_diferenca: diferenca,
          p_ato_novo: atoNovo,
        }),
      registrarRevogacao: (coletaId, chaveRevogada, chaveAto, revogadaEm) =>
        rpc<string>('registrar_revogacao', {
          p_coleta_id: coletaId,
          p_chave_revogada: chaveRevogada,
          p_chave_ato: chaveAto,
          p_revogada_em: revogadaEm,
        }),
      async concluirColeta(coletaId, itensNovos, erro) {
        await rpc<null>('concluir_coleta', {
          p_coleta_id: coletaId,
          p_itens_novos: itensNovos,
          p_erro: erro,
        })
      },
      async enviarArquivo(caminho, bytes, mime) {
        const { error } = await admin.storage
          .from(BUCKET_DE_NORMAS)
          .upload(caminho, bytes, { contentType: mime, upsert: false })
        if (error) throw new ErroDaColeta('falha_no_storage')
      },
    },
  }),
)
