// Consulta do local do empreendimento (docs/estudos/enquadramento-automatico.md): a Edge Function
// consultar-local cruza o ponto com camadas públicas do IMA/SC e do SIMGeo de Joinville. O tipo
// espelha ResultadoDoLocal de supabase/functions/_shared/consulta-de-local.ts.

import type { Coordenadas } from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

export type TipoDeRestricao =
  | 'app'
  | 'faixa_nao_edificavel'
  | 'inundacao'
  | 'risco_geologico'
  | 'unidade_de_conservacao'
  | 'zona_de_amortecimento'
  | 'terra_indigena'
  | 'quilombola'

export interface ResultadoDoLocal {
  municipio: { codigoIbge: string; nome: string } | null
  lote: {
    inscricaoImobiliaria: string | null
    quadra: string | null
    lote: string | null
    areaM2: number | null
  } | null
  bairro: string | null
  zoneamento: { setor: string; macrozona: string | null } | null
  restricoes: { tipo: TipoDeRestricao; descricao: string; fonte: string }[]
  falhas: string[]
  fontes: string[]
}

const MOTIVOS: Record<string, string> = {
  fora_de_santa_catarina: 'O ponto está fora de Santa Catarina.',
  ponto_invalido: 'Coordenadas inválidas.',
  sem_permissao: 'Sua sessão expirou. Entre de novo.',
}

/** Falha da consulta, já com a mensagem para a tela. */
export class ErroDaConsultaDeLocal extends Error {}

export async function consultarLocal(c: Coordenadas): Promise<ResultadoDoLocal> {
  const resposta = await obterSupabase().functions.invoke<ResultadoDoLocal>('consultar-local', {
    body: { latitude: c.latitude, longitude: c.longitude },
  })
  const erro: unknown = resposta.error
  if (!erro && resposta.data) return resposta.data
  if (erro instanceof FunctionsHttpError) {
    const corpo = (await (erro.context as Response).json().catch(() => ({}))) as { erro?: string }
    throw new ErroDaConsultaDeLocal(
      MOTIVOS[corpo.erro ?? ''] ?? 'Não foi possível consultar o local.',
    )
  }
  throw new ErroDaConsultaDeLocal('Sem conexão com o servidor.')
}
