// Recursos do plano (ADR-0030) vistos pelo front: só para mostrar ou esconder telas. Quem barra de
// verdade é o banco (private.recurso_liberado nas RPCs e tabelas de cada recurso).

import { obterSupabase } from '@/lib/supabase'

export type RecursoDoPlanoNoFront =
  'capacidade' | 'integracao_ima' | 'financeiro' | 'analise_lotes' | 'ia' | 'orcamentos'

export async function recursoLiberado(
  consultoriaId: string,
  recurso: RecursoDoPlanoNoFront,
): Promise<boolean> {
  const { data, error } = await obterSupabase().rpc('recurso_liberado', {
    p_consultoria_id: consultoriaId,
    p_recurso: recurso,
  })
  if (error) throw error
  return data
}
