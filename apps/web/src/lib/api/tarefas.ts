// Aprovação do orçamento com tarefas (ADR-0029; migration 20261114220000_aprovacao_com_tarefas).
// Escrita só por RPC: aprovar_orcamento grava situação, aceite e tarefas numa transação; as
// tarefas mudam de situação pelo responsável ou pela Gestão e são editadas pela Gestão, sempre
// com row_version. Leitura por listar_tarefas_servico (qualquer membro ativo, sem valores).

import {
  ehSituacaoDaTarefa,
  minutosDasHoras,
  numeroDoOrcamento,
  type DataCivil,
  type MetodoDeAceite,
  type SituacaoDaTarefa,
  type TarefaDoRoteiro,
} from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { obterSupabase } from '@/lib/supabase'

export const CHAVE_TAREFAS = 'tarefas-servico'

export interface TarefaDeServico {
  id: string
  orcamentoId: string
  /** Serviço de origem; nulo quando acrescentada à mão ou o serviço saiu numa revisão. */
  orcamentoItemId: string | null
  /** "ORC-2026-013" ou "ORC-2026-013 rev. 2". */
  orcamentoNumero: string
  empreendimentoNome: string
  titulo: string
  responsavelId: string | null
  responsavelNome: string | null
  /** Nulo = não estimada. */
  minutosEstimados: number | null
  prazoInterno: DataCivil | null
  /** prazo − hoje (no fuso da consultoria); nulo sem prazo. */
  dias: number | null
  situacao: SituacaoDaTarefa
  /** O item de origem saiu numa revisão aprovada depois. */
  foraDaRevisao: boolean
  rowVersion: number
}

export interface FiltrosDeTarefas {
  orcamentoId?: string | null
  responsavelId?: string | null
  semResponsavel?: boolean
  abertas?: boolean
  de?: DataCivil | null
  ate?: DataCivil | null
}

export async function listarTarefasDeServico(
  consultoriaId: string,
  filtros: FiltrosDeTarefas = {},
): Promise<TarefaDeServico[]> {
  const { data, error } = await obterSupabase().rpc('listar_tarefas_servico', {
    p_consultoria_id: consultoriaId,
    ...(filtros.orcamentoId ? { p_orcamento_id: filtros.orcamentoId } : {}),
    ...(filtros.responsavelId ? { p_responsavel_id: filtros.responsavelId } : {}),
    ...(filtros.semResponsavel ? { p_sem_responsavel: true } : {}),
    ...(filtros.abertas ? { p_abertas: true } : {}),
    ...(filtros.de ? { p_de: filtros.de } : {}),
    ...(filtros.ate ? { p_ate: filtros.ate } : {}),
  })
  if (error) throw error
  // Nulo só em servidores falsos (testes e demonstração); o banco sempre devolve uma lista.
  return ((data as typeof data | null) ?? []).map((t) => ({
    id: t.id,
    orcamentoId: t.orcamento_id,
    orcamentoItemId: (t.orcamento_item_id as string | null) ?? null,
    orcamentoNumero:
      numeroDoOrcamento(t.orcamento_ano, t.orcamento_sequencia) +
      (t.orcamento_revisao > 1 ? ` rev. ${String(t.orcamento_revisao)}` : ''),
    empreendimentoNome: t.empreendimento_nome,
    titulo: t.titulo,
    responsavelId: (t.responsavel_id as string | null) ?? null,
    responsavelNome: (t.responsavel_nome as string | null) ?? null,
    minutosEstimados: (t.minutos_estimados as number | null) ?? null,
    prazoInterno: ((t.prazo_interno as string | null) ?? null) as DataCivil | null,
    dias: (t.dias as number | null) ?? null,
    situacao: ehSituacaoDaTarefa(t.situacao) ? t.situacao : 'a_fazer',
    foraDaRevisao: t.fora_da_revisao,
    rowVersion: t.row_version,
  }))
}

export interface AceiteParaAprovar {
  aprovadoPor: string
  dataAceite: DataCivil
  referencia: string
  metodo: MetodoDeAceite | null
}

/** Aprova com aceite e, se pedido, as tarefas do roteiro. Devolve o row_version do orçamento. */
export async function aprovarOrcamento(
  orcamentoId: string,
  rowVersion: number,
  aceite: AceiteParaAprovar,
  gerarTarefas: boolean,
  roteiro: readonly TarefaDoRoteiro[],
): Promise<number> {
  const tarefas = gerarTarefas
    ? roteiro.map((t) => ({
        item_id: t.itemId,
        titulo: t.titulo.trim(),
        responsavel_id: t.responsavelId,
        minutos: minutosDasHoras(t.horas) ?? null,
        prazo_interno: t.prazoInterno === '' ? null : t.prazoInterno,
      }))
    : []
  const { data, error } = await obterSupabase().rpc('aprovar_orcamento', {
    p_id: orcamentoId,
    p_row_version: rowVersion,
    p_aprovado_por: aceite.aprovadoPor.trim(),
    p_data_aceite: aceite.dataAceite,
    p_referencia: aceite.referencia.trim(),
    p_metodo: aceitaNulo(aceite.metodo),
    p_gerar_tarefas: gerarTarefas,
    p_tarefas: tarefas,
  })
  if (error) throw error
  return data
}

export async function mudarSituacaoDaTarefa(
  id: string,
  rowVersion: number,
  para: SituacaoDaTarefa,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('mudar_situacao_tarefa_servico', {
    p_id: id,
    p_row_version: rowVersion,
    p_para: para,
  })
  if (error) throw error
  return data
}

export interface TarefaParaGravar {
  titulo: string
  responsavelId: string | null
  minutos: number | null
  prazoInterno: DataCivil | null
}

export async function editarTarefa(
  id: string,
  rowVersion: number,
  tarefa: TarefaParaGravar,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_tarefa_servico', {
    p_id: id,
    p_row_version: rowVersion,
    p_titulo: tarefa.titulo.trim(),
    p_responsavel_id: aceitaNulo(tarefa.responsavelId),
    p_minutos: aceitaNulo(tarefa.minutos),
    p_prazo_interno: aceitaNulo(tarefa.prazoInterno),
  })
  if (error) throw error
  return data
}

/** Idempotente pelo id gerado na tela. */
export async function adicionarTarefa(
  orcamentoId: string,
  id: string,
  tarefa: TarefaParaGravar,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('adicionar_tarefa_servico', {
    p_orcamento_id: orcamentoId,
    p_id: id,
    p_titulo: tarefa.titulo.trim(),
    p_responsavel_id: aceitaNulo(tarefa.responsavelId),
    p_minutos: aceitaNulo(tarefa.minutos),
    p_prazo_interno: aceitaNulo(tarefa.prazoInterno),
  })
  if (error) throw error
  return data
}

export interface AceiteRegistrado {
  revisao: number
  aprovadoPor: string
  dataAceite: DataCivil
  referencia: string
  metodo: MetodoDeAceite | null
  conteudoSha256: string
  registradoPorNome: string | null
  registradoEm: string
}

/** Aceites do orçamento, do mais recente ao mais antigo (só a Gestão lê). */
export async function listarAceites(orcamentoId: string): Promise<AceiteRegistrado[]> {
  const { data, error } = await obterSupabase().rpc('listar_aceites_do_orcamento', {
    p_orcamento_id: orcamentoId,
  })
  if (error) throw error
  // Nulo só em servidores falsos (testes e demonstração); o banco sempre devolve uma lista.
  return ((data as typeof data | null) ?? []).map((a) => ({
    revisao: a.revisao,
    aprovadoPor: a.aprovado_por,
    dataAceite: a.data_aceite as DataCivil,
    referencia: a.referencia,
    metodo: ((a.metodo as string | null) ?? null) as MetodoDeAceite | null,
    conteudoSha256: a.conteudo_sha256,
    registradoPorNome: (a.registrado_por_nome as string | null) ?? null,
    registradoEm: a.registrado_em,
  }))
}
