// Indicadores de valor, etapas 2 e 3 (ADR-0027): tempo ativo por tarefa, linha de base, horas
// devolvidas (central) e resumo do mês (Gestão). Só totais da consultoria; nada por pessoa.

import { MESES_DE_METRICAS, type LinhaDeBase, type TipoDeTarefa } from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

/** Grava uma tarefa terminada. Nunca falha para quem usa: erro de rede ou do banco é engolido. */
export async function registrarTarefa(
  consultoriaId: string,
  tipo: TipoDeTarefa,
  quantidade: number,
  segundos: number,
): Promise<void> {
  if (quantidade < 1 || segundos < 1) return
  try {
    await obterSupabase().rpc('registrar_tarefa', {
      p_consultoria_id: consultoriaId,
      p_tipo: tipo,
      p_quantidade: Math.round(quantidade),
      p_segundos: Math.round(segundos),
    })
  } catch {
    // Medição é só sinal: sem aviso, sem nova tentativa.
  }
}

/**
 * Data da última resposta da linha de base: nula quando nunca respondeu; `undefined` quando não
 * deu para saber (aí o diálogo não aparece).
 */
export async function obterUltimaLinhaDeBase(
  consultoriaId: string,
): Promise<string | null | undefined> {
  const { data, error } = await obterSupabase().rpc('ultima_linha_de_base', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  if (!Array.isArray(data)) return undefined
  return data[0]?.respondido_em ?? null
}

export async function responderLinhaDeBase(
  consultoriaId: string,
  respostas: LinhaDeBase,
): Promise<void> {
  const { error } = await obterSupabase().rpc('responder_linha_de_base', {
    p_consultoria_id: consultoriaId,
    p_licencas_ativas: respostas.licencasAtivas,
    p_horas_semana_conferindo: respostas.horasSemanaConferindo,
    p_minutos_por_condicionante: respostas.minutosPorCondicionante,
    p_surpresas_por_mes: respostas.surpresasPorMes,
  })
  if (error) throw error
}

export interface ResumoDoMes {
  /** Primeiro dia do mês, aaaa-mm-01. */
  mes: string
  horasTotal: number
  reaisCentavos: number | null
  horasEstimadas: boolean
  juntandoDados: boolean
  prazoPrevistas: number
  prazoCumpridas: number
  renovacoesVencendo: number
  renovacoesProtegidas: number
}

/** O mês pedido e o anterior (mês pedido primeiro). Só a Gestão. */
export async function obterResumoDoMes(consultoriaId: string, mes: string): Promise<ResumoDoMes[]> {
  const { data, error } = await obterSupabase().rpc('resumo_do_mes', {
    p_consultoria_id: consultoriaId,
    p_mes: mes,
  })
  if (error) throw error
  // O tipo gerado não sabe que a resposta pode vir vazia.
  return ((data as typeof data | null) ?? []).map((l) => ({
    mes: l.mes,
    horasTotal: l.horas_total,
    reaisCentavos: (l.reais_centavos as number | null) ?? null,
    horasEstimadas: l.horas_estimadas,
    juntandoDados: l.juntando_dados,
    prazoPrevistas: l.prazo_previstas,
    prazoCumpridas: l.prazo_cumpridas,
    renovacoesVencendo: l.renovacoes_vencendo,
    renovacoesProtegidas: l.renovacoes_protegidas,
  }))
}

export interface HorasDoMes {
  mes: string
  consultoriasComDados: number
  consultoriasJuntando: number
  horasCadastro: number
  horasAcompanhamento: number
  horasTotal: number
  reaisCentavos: number | null
  estimado: boolean
}

/** Central: horas devolvidas por mês (mês atual primeiro), de uma consultoria ou do total. */
export async function obterHorasPoupadas(consultoriaId: string | null): Promise<HorasDoMes[]> {
  const { data, error } = await obterSupabase().rpc('central_horas_poupadas', {
    p_consultoria_id: consultoriaId ?? undefined,
    p_meses: MESES_DE_METRICAS,
  })
  if (error) throw error
  // O tipo gerado não sabe que a resposta pode vir vazia.
  return ((data as typeof data | null) ?? []).map((l) => ({
    mes: l.mes,
    consultoriasComDados: l.consultorias_com_dados,
    consultoriasJuntando: l.consultorias_juntando,
    horasCadastro: l.horas_cadastro,
    horasAcompanhamento: l.horas_acompanhamento,
    horasTotal: l.horas_total,
    reaisCentavos: (l.reais_centavos as number | null) ?? null,
    estimado: l.estimado,
  }))
}

const MOTIVOS_DO_ENVIO: Record<string, string> = {
  configuracao_ausente: 'O envio de e-mail não está configurado.',
  sem_email: 'Sua conta não tem e-mail.',
  falha_no_envio: 'O serviço de e-mail recusou o envio.',
  dois_fatores_necessarios: 'A sessão precisa dos dois fatores.',
  sem_permissao: 'Sem permissão.',
}

/** Central: o resumo do mês anterior desta consultoria, só para o e-mail de quem está logado. */
export async function enviarResumoDeTeste(consultoriaId: string): Promise<void> {
  const resposta = await obterSupabase().functions.invoke('enviar-resumo-do-mes', {
    body: { teste: true, consultoriaId },
  })
  const erro: unknown = resposta.error
  if (!erro) return
  if (erro instanceof FunctionsHttpError) {
    const corpo = (await (erro.context as Response).json().catch(() => ({}))) as { erro?: string }
    throw new Error(MOTIVOS_DO_ENVIO[corpo.erro ?? ''] ?? 'Não foi possível enviar o resumo.')
  }
  throw new Error('Sem conexão com o servidor.')
}
