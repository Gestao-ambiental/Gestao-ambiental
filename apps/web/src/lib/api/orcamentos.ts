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
function contasDe(valor: Json | undefined): ContaDoMes[] {
  return lista(valor).map((c) => ({
    descricao: texto(c.descricao),
    valorCentavos: numero(c.valor_centavos),
  }))
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
  /** Nulo enquanto o preço está pendente (sem base, sem itens ou despesa incluída a cotar). */
  totalCentavos: number | null
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
      // Nulo com preço pendente (o tipo gerado não sabe: a coluna vem de um case).
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
  /** Parte do item no preço total, calculada pelo banco a cada salvamento (zero se pendente). */
  precoCentavos: number
  custoDiretoExtraCentavos: number
}

/** O que a tela envia de cada item: o preço sai do banco, nunca da tela. */
export type ItemParaSalvar = Omit<ItemDoOrcamento, 'precoCentavos'>

/** Conta do mês da consultoria (energia, água, internet…). */
export interface ContaDoMes {
  descricao: string
  valorCentavos: number
}

export interface VisitasDoOrcamento {
  quantidade: number
  /** Km de ida e volta de cada visita. */
  kmPorVisita: number
  /** Pedágio, estacionamento, alimentação… por visita. */
  outrosPorVisitaCentavos: number
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
  valorVisitaCentavos: number
  custoKmCentavos: number
  /** Contas do mês e parte administrativa da equipe: servem à prévia do rateio por conta. */
  custosFixosMensaisCentavos: number
  custosFixosEquipeCentavos: number
  contas: ContaDoMes[]
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
  /** Margem escolhida no fim do orçamento; nula = margem desejada da base. */
  margemPb: number | null
  visitas: VisitasDoOrcamento
  /** Parte das visitas no preço total, calculada pelo banco. */
  precoVisitasCentavos: number
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
  const v = objeto(o.visitas)
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
    margemPb: numeroOuNulo(o.margem_pb),
    visitas: {
      quantidade: numero(v?.quantidade),
      kmPorVisita: numero(v?.km_por_visita),
      outrosPorVisitaCentavos: numero(v?.outros_por_visita_centavos),
    },
    precoVisitasCentavos: numero(o.preco_visitas_centavos),
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
          valorVisitaCentavos: numero(b.valor_visita_centavos),
          custoKmCentavos: numero(b.custo_km_centavos),
          custosFixosMensaisCentavos: numero(b.custos_fixos_mensais_centavos),
          custosFixosEquipeCentavos: numero(b.custos_fixos_equipe_centavos),
          contas: contasDe(b.custos_fixos_detalhe),
        }
      : null,
    atualizadoEm: texto(o.atualizado_em),
    rowVersion: numero(o.row_version),
    itens: lista(o.itens).map((i) => ({
      id: texto(i.id),
      descricao: texto(i.descricao),
      minutos: numero(i.minutos),
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
  /** Nula: usa a margem desejada da base. */
  margemPb: number | null
  visitas: VisitasDoOrcamento
  itens: ItemParaSalvar[]
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
      margem_pb: dados.margemPb,
      visitas: {
        quantidade: dados.visitas.quantidade,
        km_por_visita: dados.visitas.kmPorVisita,
        outros_por_visita_centavos: dados.visitas.outrosPorVisitaCentavos,
      },
      itens: dados.itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        minutos: i.minutos,
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

/** Pessoa ou perfil da composição da hora técnica (P9 e P10). Dado restrito: só a Gestão. */
export interface PessoaDaBase {
  id: string
  descricao: string
  /** Sócio com pró-labore: só identifica a remuneração dos sócios. */
  socio: boolean
  /** Remuneração ou pró-labore + encargos + benefícios do mês. */
  custoMensalCentavos: number
  horasDisponiveisMes: number
  aproveitamentoPb: number
  parteTecnicaPb: number
}

export interface BaseDeCustosDaConsultoria {
  /** Com equipe, é derivada pelo banco; o valor enviado é ignorado. */
  horaTecnicaCentavos: number
  /** Custos fixos digitados (com equipe: sem a remuneração de quem está nela). */
  custosFixosMensaisCentavos: number
  /** Derivado: parte administrativa da remuneração da equipe, que entra no rateio. */
  custosFixosEquipeCentavos: number
  /** Com equipe, são derivadas pelo banco; o valor enviado é ignorado. */
  horasFaturaveisMes: number
  margemDesejadaPb: number
  margemMinimaPb: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
  /** Vazio: hora técnica e horas faturáveis digitadas. */
  equipe: PessoaDaBase[]
  /** Contas do mês. Com contas, o custo fixo mensal é a soma delas (o banco confere). */
  contas: ContaDoMes[]
  valorVisitaCentavos: number
  custoKmCentavos: number
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
    custosFixosEquipeCentavos: numero(b.custos_fixos_equipe_centavos),
    horasFaturaveisMes: numero(b.horas_faturaveis_mes),
    margemDesejadaPb: numero(b.margem_desejada_pb),
    margemMinimaPb: numero(b.margem_minima_pb),
    tributosPb: numero(b.tributos_pb),
    taxasPb: numero(b.taxas_pb),
    taxaPorCobrancaCentavos: numero(b.taxa_por_cobranca_centavos),
    taxaPorAssinaturaCentavos: numero(b.taxa_por_assinatura_centavos),
    equipe: lista(b.equipe).map((p) => ({
      id: texto(p.id),
      descricao: texto(p.descricao),
      socio: p.socio === true,
      custoMensalCentavos: numero(p.custo_mensal_centavos),
      horasDisponiveisMes: numero(p.horas_disponiveis_mes),
      aproveitamentoPb: numero(p.aproveitamento_pb),
      parteTecnicaPb: numero(p.parte_tecnica_pb),
    })),
    contas: contasDe(b.custos_fixos_detalhe),
    valorVisitaCentavos: numero(b.valor_visita_centavos),
    custoKmCentavos: numero(b.custo_km_centavos),
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
    p_equipe: base.equipe.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      socio: p.socio,
      custo_mensal_centavos: p.custoMensalCentavos,
      horas_disponiveis_mes: p.horasDisponiveisMes,
      aproveitamento_pb: p.aproveitamentoPb,
      parte_tecnica_pb: p.parteTecnicaPb,
    })),
    p_custos_fixos: base.contas.map((c) => ({
      descricao: c.descricao,
      valor_centavos: c.valorCentavos,
    })),
    p_valor_visita_centavos: base.valorVisitaCentavos,
    p_custo_km_centavos: base.custoKmCentavos,
  })
  if (error) throw error
}
