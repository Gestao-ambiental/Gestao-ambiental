// Edge Function consultar-local (docs/estudos/enquadramento-automatico.md; LEG-05, ADR-0050).
//
// Recebe { latitude, longitude } de quem está logado e consulta camadas públicas do IMA/SC e do
// SIMGeo de Joinville: município, lote e inscrição imobiliária, zoneamento e restrições (APP,
// inundação, risco, unidades de conservação, terras indígenas e quilombolas). Sem segredos.
// Com { consultoriaId, unidadeId } opcionais, grava o município achado na unidade pela RPC
// gravar_municipio_da_unidade, com a chave anônima e o JWT de quem chamou (a RPC confere o vínculo;
// nunca service role). Falha ao gravar não derruba a consulta: só o código do erro vai para o log,
// nada da consulta. As regras ficam em _shared/consulta-de-local.ts.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import { criarTratadorDaConsultaDeLocal } from '../_shared/consulta-de-local.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonima = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

Deno.serve(
  criarTratadorDaConsultaDeLocal({
    fetch,
    async gravarMunicipio(autorizacao, gravacao) {
      const cliente = createClient(url, anonima, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: autorizacao } },
      })
      const { error } = await cliente.rpc('gravar_municipio_da_unidade', {
        p_consultoria_id: gravacao.consultoriaId,
        p_unidade_id: gravacao.unidadeId,
        p_codigo_ibge: gravacao.codigoIbge,
        p_nome: gravacao.nome,
      })
      return { erro: error ? error.code || 'desconhecido' : null }
    },
  }),
)
