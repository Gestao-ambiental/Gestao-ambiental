// Relatório mensal ao cliente (P6, ADR-0052): uma leitura do banco, só para a Gestão.
import type { DadosParaRelatorioMensal } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export async function dadosParaRelatorioMensal(
  empreendimentoId: string,
  mes: string,
): Promise<DadosParaRelatorioMensal> {
  const { data, error } = await obterSupabase().rpc('dados_para_relatorio_mensal', {
    p_empreendimento_id: empreendimentoId,
    p_mes: mes,
  })
  if (error) throw error
  return data as unknown as DadosParaRelatorioMensal
}
