// Autorização da Gestão para mandar conteúdo da consultoria à IA (ADR-0061). Hoje só a conferência
// de relatórios. Leitura por RPC (todo membro ativo); ligar e desligar só pela RPC, da Gestão. Quem
// barra de verdade é o banco: sem autorização, reservar_conferencia_ia recusa e nada vai à IA.

import { obterSupabase } from '@/lib/supabase'

export type FinalidadeDaIa = 'conferencia_relatorio'

export interface AutorizacaoDaIa {
  finalidade: FinalidadeDaIa
  autorizada: boolean
  decididaEm: string | null
  decididaPor: string | null
}

export async function obterAutorizacaoDaIa(
  consultoriaId: string,
  finalidade: FinalidadeDaIa = 'conferencia_relatorio',
): Promise<AutorizacaoDaIa> {
  const { data, error } = await obterSupabase().rpc('autorizacao_ia_atual', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const linha = data.find((l) => l.finalidade === finalidade)
  return {
    finalidade,
    autorizada: linha?.autorizada ?? false,
    decididaEm: linha?.decidida_em ?? null,
    decididaPor: linha?.decidida_por_nome ?? null,
  }
}

export async function definirAutorizacaoDaIa(
  consultoriaId: string,
  autorizada: boolean,
  finalidade: FinalidadeDaIa = 'conferencia_relatorio',
): Promise<boolean> {
  const { data, error } = await obterSupabase().rpc('definir_autorizacao_ia', {
    p_consultoria_id: consultoriaId,
    p_finalidade: finalidade,
    p_autorizada: autorizada,
  })
  if (error) throw error
  return data
}
