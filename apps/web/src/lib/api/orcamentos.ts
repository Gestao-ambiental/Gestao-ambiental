// Orçamentos, fatia 1 (onda 5; ORC-02, ORC-03, ORC-04). Leitura por funções do banco; escrita só
// por RPC. Nesta fatia tudo é da Gestão: a RLS devolve zero linhas para a Equipe.

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_ORCAMENTOS = 50

export type SituacaoOrcamento = 'rascunho' | 'enviada' | 'negociacao' | 'aprovada' | 'recusada'
export type TratamentoDespesa = 'incluida' | 'cliente_direto' | 'reembolsavel'

export const ROTULO_DO_TRATAMENTO: Record<TratamentoDespesa, string> = {
  incluida: 'Incluída no preço',
  cliente_direto: 'Paga pelo cliente, direto',
  reembolsavel: 'Reembolso com comprovante',
}

export const ROTULO_DA_SITUACAO: Record<SituacaoOrcamento, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  negociacao: 'Em negociação',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
}

// ---------------------------------------------------------------------------
// Leitura defensiva do JSON das funções
// ---------------------------------------------------------------------------

type Objeto = Record<string, Json | undefined>

function objeto(valor: Json | undefined): Objeto | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : null
}
function texto(valor: Json | undefined): string {
  return typeof valor === 'string' ? valor : ''
}
function textoOuNulo(valor: Json | undefined): string | null {
  return typeof valor === 'string' ? valor : null
}
function numeroOuNulo(valor: Json | undefined): number | null {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor)))
    return Number(valor)
  return null
}
function numero(valor: Json | undefined): number {
  return numeroOuNulo(valor) ?? 0
}
function lista(valor: Json | undefined): Objeto[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item): Objeto[] => {
    const lido = objeto(item)
    return lido ? [lido] : []
  })
}
function textos(valor: Json | undefined): string[] {
  return Array.isArray(valor) ? valor.filter((item) => typeof item === 'string') : []
}
function tratamento(valor: Json | undefined): TratamentoDespesa {
  return valor === 'incluida' || valor === 'reembolsavel' ? valor : 'cliente_direto'
}
function situacao(valor: Json | undefined): SituacaoOrcamento {
  return valor === 'enviada' ||
    valor === 'negociacao' ||
    valor === 'aprovada' ||
    valor === 'recusada'
    ? valor
    : 'rascunho'
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface OrcamentoNaLista {
  id: string
  ano: number
  sequencia: number
  revisao: number
  situacao: SituacaoOrcamento
  empreendimentoNome: string
  objeto: string
  totalCentavos: number
  atualizadoEm: string
}

export async function listarOrcamentos(
  consultoriaId: string,
  busca: string,
  pagina: number,
): Promise<{ itens: OrcamentoNaLista[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_orcamentos', {
    p_consultoria_id: consultoriaId,
    p_busca: busca,
    p_limite: TAMANHO_PAGINA_ORCAMENTOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_ORCAMENTOS,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      ano: linha.ano,
      sequencia: linha.sequencia,
      revisao: linha.revisao,
      situacao: linha.situacao,
      empreendimentoNome: linha.empreendimento_nome,
      objeto: linha.objeto,
      totalCentavos: linha.total_centavos,
      atualizadoEm: linha.atualizado_em,
    })),
    total: data[0]?.total ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface ItemDoOrcamento {
  id: string
  descricao: string
  /** Duração estimada em minutos inteiros. */
  minutos: number
  /** Verdadeiro: o banco calcula o preço pelo custo e pela margem desejada a cada salvamento. */
  precoAutomatico: boolean
  precoCentavos: number
  custoDiretoExtraCentavos: number
}

export interface DespesaDoOrcamento {
  id: string
  descricao: string
  /** `null` = a cotar (nunca zero). */
  estimativaCentavos: number | null
  tratamento: TratamentoDespesa
}

export interface ParcelaDoOrcamento {
  id: string
  /** Marco que dispara a parcela (ex.: "Assinatura do contrato"). */
  descricao: string
  /** Dias corridos após o marco. */
  dias: number
  percentualPb: number
}

/** Base de custos copiada para o orçamento. `null` = rateio pendente. */
export interface BaseDoOrcamento {
  horaTecnicaCentavos: number
  custoFixoHoraCentavos: number
  margemDesejadaPb: number
  margemMinimaPb: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
}

export interface Orcamento {
  id: string
  ano: number
  sequencia: number
  revisao: number
  situacao: SituacaoOrcamento
  empreendimentoId: string
  empreendimentoNome: string
  objeto: string
  destinatario: string
  prazos: string
  validadeDias: number
  premissas: string[]
  exclusoes: string[]
  base: BaseDoOrcamento | null
  atualizadoEm: string
  rowVersion: number
  itens: ItemDoOrcamento[]
  despesas: DespesaDoOrcamento[]
  parcelas: ParcelaDoOrcamento[]
}

/** Nulo quando não existe ou a pessoa não tem acesso (a RLS não diz qual dos dois). */
export async function obterOrcamento(id: string): Promise<Orcamento | null> {
  const { data, error } = await obterSupabase().rpc('obter_orcamento', { p_id: id })
  if (error) throw error
  const o = objeto(data)
  if (!o) return null
  const b = objeto(o.base)
  return {
    id: texto(o.id),
    ano: numero(o.ano),
    sequencia: numero(o.sequencia),
    revisao: numero(o.revisao),
    situacao: situacao(o.situacao),
    empreendimentoId: texto(o.empreendimento_id),
    empreendimentoNome: texto(o.empreendimento_nome),
    objeto: texto(o.objeto),
    destinatario: textoOuNulo(o.destinatario) ?? '',
    prazos: textoOuNulo(o.prazos) ?? '',
    validadeDias: numero(o.validade_dias),
    premissas: textos(o.premissas),
    exclusoes: textos(o.exclusoes),
    base: b
      ? {
          horaTecnicaCentavos: numero(b.hora_tecnica_centavos),
          custoFixoHoraCentavos: numero(b.custo_fixo_hora_centavos),
          margemDesejadaPb: numero(b.margem_desejada_pb),
          margemMinimaPb: numero(b.margem_minima_pb),
          tributosPb: numero(b.tributos_pb),
          taxasPb: numero(b.taxas_pb),
          taxaPorCobrancaCentavos: numero(b.taxa_por_cobranca_centavos),
          taxaPorAssinaturaCentavos: numero(b.taxa_por_assinatura_centavos),
        }
      : null,
    atualizadoEm: texto(o.atualizado_em),
    rowVersion: numero(o.row_version),
    itens: lista(o.itens).map((i) => ({
      id: texto(i.id),
      descricao: texto(i.descricao),
      minutos: numero(i.minutos),
      precoAutomatico: i.preco_automatico === true,
      precoCentavos: numero(i.preco_centavos),
      custoDiretoExtraCentavos: numero(i.custo_direto_extra_centavos),
    })),
    despesas: lista(o.despesas).map((d) => ({
      id: texto(d.id),
      descricao: texto(d.descricao),
      estimativaCentavos: numeroOuNulo(d.estimativa_centavos),
      tratamento: tratamento(d.tratamento),
    })),
    parcelas: lista(o.parcelas).map((p) => ({
      id: texto(p.id),
      descricao: texto(p.descricao),
      dias: numero(p.dias),
      percentualPb: numero(p.percentual_pb),
    })),
  }
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/** Cria o rascunho com o id gerado na tela: repetir não duplica. */
export async function criarOrcamento(
  id: string,
  consultoriaId: string,
  empreendimentoId: string,
  objetoDoOrcamento: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_orcamento', {
    p_id: id,
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
    p_objeto: objetoDoOrcamento,
  })
  if (error) throw error
  return data
}

export interface DadosDoRascunho {
  objeto: string
  destinatario: string
  prazos: string
  validadeDias: number
  premissas: string[]
  exclusoes: string[]
  itens: ItemDoOrcamento[]
  despesas: DespesaDoOrcamento[]
  parcelas: ParcelaDoOrcamento[]
}

/** Salva o rascunho inteiro. Devolve a nova versão (controle otimista). */
export async function salvarOrcamento(
  id: string,
  rowVersion: number,
  dados: DadosDoRascunho,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
    p_dados: {
      objeto: dados.objeto,
      destinatario: dados.destinatario,
      prazos: dados.prazos,
      validade_dias: dados.validadeDias,
      premissas: dados.premissas,
      exclusoes: dados.exclusoes,
      itens: dados.itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        minutos: i.minutos,
        preco_automatico: i.precoAutomatico,
        preco_centavos: i.precoCentavos,
        custo_direto_extra_centavos: i.custoDiretoExtraCentavos,
      })),
      despesas: dados.despesas.map((d) => ({
        id: d.id,
        descricao: d.descricao,
        estimativa_centavos: d.estimativaCentavos,
        tratamento: d.tratamento,
      })),
      parcelas: dados.parcelas.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        dias: p.dias,
        percentual_pb: p.percentualPb,
      })),
    },
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Base de custos
// ---------------------------------------------------------------------------

export interface BaseDeCustosDaConsultoria {
  horaTecnicaCentavos: number
  custosFixosMensaisCentavos: number
  horasFaturaveisMes: number
  margemDesejadaPb: number
  margemMinimaPb: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
}

/** Nulo quando ainda não foi configurada. */
export async function obterBaseDeCustos(
  consultoriaId: string,
): Promise<BaseDeCustosDaConsultoria | null> {
  const { data, error } = await obterSupabase().rpc('obter_base_de_custos', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const b = objeto(data)
  if (!b) return null
  return {
    horaTecnicaCentavos: numero(b.hora_tecnica_centavos),
    custosFixosMensaisCentavos: numero(b.custos_fixos_mensais_centavos),
    horasFaturaveisMes: numero(b.horas_faturaveis_mes),
    margemDesejadaPb: numero(b.margem_desejada_pb),
    margemMinimaPb: numero(b.margem_minima_pb),
    tributosPb: numero(b.tributos_pb),
    taxasPb: numero(b.taxas_pb),
    taxaPorCobrancaCentavos: numero(b.taxa_por_cobranca_centavos),
    taxaPorAssinaturaCentavos: numero(b.taxa_por_assinatura_centavos),
  }
}

export async function salvarBaseDeCustos(
  consultoriaId: string,
  base: BaseDeCustosDaConsultoria,
): Promise<void> {
  const { error } = await obterSupabase().rpc('salvar_base_de_custos', {
    p_consultoria_id: consultoriaId,
    p_hora_tecnica_centavos: base.horaTecnicaCentavos,
    p_custos_fixos_mensais_centavos: base.custosFixosMensaisCentavos,
    p_horas_faturaveis_mes: base.horasFaturaveisMes,
    p_margem_desejada_pb: base.margemDesejadaPb,
    p_margem_minima_pb: base.margemMinimaPb,
    p_tributos_pb: base.tributosPb,
    p_taxas_pb: base.taxasPb,
    p_taxa_por_cobranca_centavos: base.taxaPorCobrancaCentavos,
    p_taxa_por_assinatura_centavos: base.taxaPorAssinaturaCentavos,
  })
  if (error) throw error
}
