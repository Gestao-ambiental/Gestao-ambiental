// Selo "Norma mudou" na tabela de licenças (ADR-0050, item 25): quais licenças do empreendimento
// têm aviso de mudança de norma ainda não visto. O banco confere o vínculo (sem vínculo, vazio).

import { obterSupabase } from '@/lib/supabase'

export interface LicencaComMudancaDeNorma {
  instrumentoId: string
  mudancas: number
}

export async function listarLicencasComMudancaDeNorma(
  consultoriaId: string,
  empreendimentoId: string,
): Promise<LicencaComMudancaDeNorma[]> {
  const { data, error } = await obterSupabase().rpc('licencas_com_mudanca_de_norma', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
  })
  if (error) throw error
  // Sem aviso o banco devolve lista vazia; nulo vale o mesmo.
  return ((data as typeof data | null) ?? [])
    .filter((linha) => linha.mudancas > 0)
    .map((linha) => ({ instrumentoId: linha.instrumento_id, mudancas: linha.mudancas }))
}
