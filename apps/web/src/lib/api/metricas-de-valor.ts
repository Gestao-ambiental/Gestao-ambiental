// Métricas de valor da central (etapa 1). Uma RPC, só operador com dois fatores: contagens e
// médias por mês (mês atual primeiro), de uma consultoria ou do total. Nada de conteúdo.

import { MESES_DE_METRICAS } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export interface MetricasDoMes {
  /** Primeiro dia do mês, aaaa-mm-01. */
  mes: string
  prazoPrevistas: number
  prazoCumpridas: number
  antecedenciaMedia: number | null
  urgencias: number
  metaPrevistas: number
  metaCumpridas: number
  criadas: number
  naoPlanejadas: number
  atrasadas: number
  diasDeAtraso: number
  renovacoesVencendo: number
  renovacoesProtegidas: number
  cargaEntregas: number
  cargaPico: number
  cargaCelulas: number
  orcamentosEnviados: number
  diasAteEnvio: number | null
  orcamentosDecididos: number
  orcamentosAprovados: number
  diasAteDecisao: number | null
  ticketMedioAprovadoCentavos: number | null
  orcamentosCriados: number
  orcamentosPelosCustos: number
  orcamentosPrecoDigitado: number
  concluidas: number
  concluidasComEvidencia: number
  /** Retrato de agora: só no mês atual. */
  condicionantesAtivas: number | null
  condicionantesComResponsavel: number | null
}

// Médias e o retrato das condicionantes vêm nulos sem dados (o tipo gerado não sabe).
const ouNulo = (valor: number) => (valor as number | null) ?? null

/** `consultoriaId` nulo: todas as consultorias somadas. */
export async function obterMetricasDeValor(consultoriaId: string | null): Promise<MetricasDoMes[]> {
  const { data: linhas, error } = await obterSupabase().rpc('central_metricas_de_valor', {
    p_consultoria_id: consultoriaId ?? undefined,
    p_meses: MESES_DE_METRICAS,
  })
  if (error) throw error
  return linhas.map((l) => ({
    mes: l.mes,
    prazoPrevistas: l.prazo_previstas,
    prazoCumpridas: l.prazo_cumpridas,
    antecedenciaMedia: ouNulo(l.antecedencia_media),
    urgencias: l.urgencias,
    metaPrevistas: l.meta_previstas,
    metaCumpridas: l.meta_cumpridas,
    criadas: l.criadas,
    naoPlanejadas: l.nao_planejadas,
    atrasadas: l.atrasadas,
    diasDeAtraso: l.dias_de_atraso,
    renovacoesVencendo: l.renovacoes_vencendo,
    renovacoesProtegidas: l.renovacoes_protegidas,
    cargaEntregas: l.carga_entregas,
    cargaPico: l.carga_pico,
    cargaCelulas: l.carga_celulas,
    orcamentosEnviados: l.orcamentos_enviados,
    diasAteEnvio: ouNulo(l.dias_ate_envio),
    orcamentosDecididos: l.orcamentos_decididos,
    orcamentosAprovados: l.orcamentos_aprovados,
    diasAteDecisao: ouNulo(l.dias_ate_decisao),
    ticketMedioAprovadoCentavos: ouNulo(l.ticket_medio_aprovado_centavos),
    orcamentosCriados: l.orcamentos_criados,
    orcamentosPelosCustos: l.orcamentos_pelos_custos,
    orcamentosPrecoDigitado: l.orcamentos_preco_digitado,
    concluidas: l.concluidas,
    concluidasComEvidencia: l.concluidas_com_evidencia,
    condicionantesAtivas: ouNulo(l.condicionantes_ativas),
    condicionantesComResponsavel: ouNulo(l.condicionantes_com_responsavel),
  }))
}
