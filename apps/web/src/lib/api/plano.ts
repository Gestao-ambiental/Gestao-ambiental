// Plano e cobrança (ADR-0026). Leitura da situação comercial (RPC situacao_comercial: as entradas
// da regra do domínio, calculada aqui com situacaoComercial, e o resultado do banco), histórico de
// cobranças, confirmação de adicional e a cobrança SIMULADA do protótipo (sem Asaas real).
// O documento de quem paga (CNPJ ou CPF) nem chega aqui: a tela só valida e descarta.

import {
  ehCicloDoPlano,
  ehCodigoPlano,
  ehFormaDePagamento,
  ehSituacaoComercial,
  situacaoComercial,
  type AssinaturaParaSituacao,
  type CatalogoComercial,
  type CicloDoPlano,
  type CodigoPlano,
  type DataCivil,
  type FormaDePagamento,
  type SituacaoComercial,
  type SituacaoComercialCodigo,
} from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_COBRANCAS = 20

export interface DadosComerciais {
  hoje: DataCivil
  /** Resultado da regra do domínio (o banco aplica a mesma regra nas triggers). */
  situacao: SituacaoComercial
  /** Situação calculada pelo banco (paridade; o que vale para a escrita). */
  situacaoNoBanco: SituacaoComercialCodigo | null
  assinatura: (AssinaturaParaSituacao & { forma: FormaDePagamento | null }) | null
  proximoVencimento: DataCivil | null
  interna: boolean
  diasDeTeste: number
  uso: { pessoas: number; convitesPendentes: number; empreendimentos: number }
  /** Cobrança em aberto já vencida (ou vencendo hoje): só a Gestão recebe. */
  cobrancaAberta: { id: string; valorCentavos: number; vencimento: DataCivil } | null
}

function data(valor: unknown): DataCivil | null {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? (valor as DataCivil)
    : null
}

function datas(valor: Json): DataCivil[] {
  return Array.isArray(valor) ? valor.map(data).filter((d): d is DataCivil => d !== null) : []
}

interface LinhaDaSituacao {
  hoje: string
  criada_em: string
  fim_do_beta: string
  dias_de_teste: number
  interna: boolean
  plano: string | null
  ciclo: string | null
  forma: string | null
  plano_agendado: string | null
  ciclo_agendado: string | null
  mudanca_em: string | null
  valida_ate: string | null
  proximo_vencimento: string | null
  vencimentos_em_aberto: Json
  pessoas: number
  convites_pendentes: number
  empreendimentos: number
  situacao: string | null
  cobranca_aberta_id: string | null
  cobranca_aberta_valor_centavos: number | null
  cobranca_aberta_vencimento: string | null
}

/**
 * Monta as entradas do domínio a partir da linha da RPC e calcula a situação com o catálogo lido do
 * banco (sem ele, as constantes do domínio).
 */
export function dadosComerciaisDaLinha(
  linha: LinhaDaSituacao,
  catalogo?: CatalogoComercial,
): DadosComerciais | null {
  const hoje = data(linha.hoje)
  const criadaEm = data(linha.criada_em)
  const fimDoBeta = data(linha.fim_do_beta)
  if (!hoje || !criadaEm || !fimDoBeta) return null
  const assinatura =
    ehCodigoPlano(linha.plano) && ehCicloDoPlano(linha.ciclo)
      ? {
          plano: linha.plano,
          ciclo: linha.ciclo,
          planoAgendado: ehCodigoPlano(linha.plano_agendado) ? linha.plano_agendado : null,
          cicloAgendado: ehCicloDoPlano(linha.ciclo_agendado) ? linha.ciclo_agendado : null,
          mudancaEm: data(linha.mudanca_em),
          validaAte: data(linha.valida_ate),
          forma: ehFormaDePagamento(linha.forma) ? linha.forma : null,
        }
      : null
  const vencimentosEmAberto = datas(linha.vencimentos_em_aberto)
  const vencimentoAberto = data(linha.cobranca_aberta_vencimento)
  return {
    hoje,
    situacao: situacaoComercial(
      {
        hoje,
        criadaEm,
        fimDoBeta,
        diasDeTeste: linha.dias_de_teste,
        interna: linha.interna,
        assinatura,
        vencimentosEmAberto,
      },
      catalogo,
    ),
    situacaoNoBanco: ehSituacaoComercial(linha.situacao) ? linha.situacao : null,
    assinatura,
    proximoVencimento: data(linha.proximo_vencimento),
    interna: linha.interna,
    diasDeTeste: linha.dias_de_teste,
    uso: {
      pessoas: linha.pessoas,
      convitesPendentes: linha.convites_pendentes,
      empreendimentos: linha.empreendimentos,
    },
    cobrancaAberta:
      vencimentoAberto && linha.cobranca_aberta_id && linha.cobranca_aberta_valor_centavos !== null
        ? {
            id: linha.cobranca_aberta_id,
            valorCentavos: linha.cobranca_aberta_valor_centavos,
            vencimento: vencimentoAberto,
          }
        : null,
  }
}

/** Situação comercial da consultoria (qualquer membro). Nulo quando o banco não devolveu nada. */
export async function obterDadosComerciais(
  consultoriaId: string,
  catalogo?: () => Promise<CatalogoComercial>,
): Promise<DadosComerciais | null> {
  const { data: linhas, error } = await obterSupabase().rpc('situacao_comercial', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const linha = (Array.isArray(linhas) ? linhas[0] : null) as LinhaDaSituacao | null | undefined
  return linha ? dadosComerciaisDaLinha(linha, catalogo ? await catalogo() : undefined) : null
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export type SituacaoDaCobranca = 'pendente' | 'vencida' | 'paga' | 'estornada' | 'removida'

export const ROTULO_DA_COBRANCA: Record<SituacaoDaCobranca, string> = {
  pendente: 'A vencer',
  vencida: 'Vencida',
  paga: 'Paga',
  estornada: 'Estornada',
  removida: 'Cancelada',
}

export interface Cobranca {
  id: string
  tipo: 'plano' | 'adicionais'
  valorCentavos: number
  vencimento: string
  pagoEm: string | null
  situacao: SituacaoDaCobranca
  forma: string | null
  invoiceUrl: string | null
}

export interface PaginaDeCobrancas {
  itens: Cobranca[]
  total: number
}

function situacaoDaCobranca(valor: string): SituacaoDaCobranca {
  return valor === 'vencida' || valor === 'paga' || valor === 'estornada' || valor === 'removida'
    ? valor
    : 'pendente'
}

interface LinhaDaCobranca {
  id: string
  tipo: string
  valor_centavos: number
  vencimento: string
  pago_em: string | null
  situacao: string
  forma: string | null
  invoice_url: string | null
}

function paraCobranca(linha: LinhaDaCobranca): Cobranca {
  return {
    id: linha.id,
    tipo: linha.tipo === 'adicionais' ? 'adicionais' : 'plano',
    valorCentavos: linha.valor_centavos,
    vencimento: linha.vencimento,
    pagoEm: linha.pago_em,
    situacao: situacaoDaCobranca(linha.situacao),
    forma: linha.forma,
    invoiceUrl: linha.invoice_url?.startsWith('https://') ? linha.invoice_url : null,
  }
}

/** Histórico de cobranças (Gestão; a RLS devolve zero linhas para os outros). */
export async function listarCobrancas(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDeCobrancas> {
  const inicio = pagina * TAMANHO_PAGINA_COBRANCAS
  const {
    data: linhas,
    error,
    count,
  } = await obterSupabase()
    .from('cobranca')
    .select('id, tipo, valor_centavos, vencimento, pago_em, situacao, forma, invoice_url', {
      count: 'exact',
    })
    .eq('consultoria_id', consultoriaId)
    .order('vencimento', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA_COBRANCAS - 1)
  if (error) throw error
  const itens = linhas.map(paraCobranca)
  return { itens, total: count ?? itens.length }
}

/** Cobranças na central (operador com dois fatores). */
export async function listarCobrancasNaCentral(
  consultoriaId: string,
  pagina: number,
): Promise<PaginaDeCobrancas> {
  const { data: linhas, error } = await obterSupabase().rpc('central_cobrancas', {
    p_consultoria_id: consultoriaId,
    p_limite: TAMANHO_PAGINA_COBRANCAS,
    p_deslocamento: pagina * TAMANHO_PAGINA_COBRANCAS,
  })
  if (error) throw error
  const dados = linhas
  return { itens: dados.map(paraCobranca), total: dados[0]?.total ?? 0 }
}

// ---------------------------------------------------------------------------
// Adicional
// ---------------------------------------------------------------------------

export type RecursoDoAdicional = 'pessoas' | 'empreendimentos'

/** A Gestão confirmou passar do limite: o banco registra e devolve o valor mensal dos adicionais. */
export async function confirmarAdicional(
  consultoriaId: string,
  recurso: RecursoDoAdicional,
): Promise<{ quantidade: number; limite: number | null; adicionaisCentavos: number }> {
  const { data: linhas, error } = await obterSupabase().rpc('confirmar_adicional', {
    p_consultoria_id: consultoriaId,
    p_recurso: recurso,
  })
  if (error) throw error
  const linha = linhas[0]
  return {
    quantidade: linha?.quantidade ?? 0,
    limite: linha?.limite ?? null,
    adicionaisCentavos: linha?.adicionais_centavos ?? 0,
  }
}

/** A escrita passou do limite sem a confirmação da Gestão. */
export function ehAdicionalNaoConfirmado(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { message?: unknown }).message === 'adicional_nao_confirmado'
  )
}

// ---------------------------------------------------------------------------
// Cobrança simulada (protótipo): assinar, pagar e cancelar sem Asaas real
// ---------------------------------------------------------------------------

/**
 * Assina (sem plano ativo: grava a assinatura e a primeira cobrança pendente) ou troca de plano
 * (com plano ativo: vale a partir do próximo vencimento).
 */
export async function assinarPlanoSimulado(
  consultoriaId: string,
  plano: CodigoPlano,
  ciclo: CicloDoPlano,
  forma: FormaDePagamento,
): Promise<{ cobrancaId: string | null; mudancaEm: string | null }> {
  const { data: linhas, error } = await obterSupabase().rpc('assinar_plano_simulado', {
    p_consultoria_id: consultoriaId,
    p_plano: plano,
    p_ciclo: ciclo,
    p_forma: forma,
  })
  if (error) throw error
  const linha = linhas[0]
  return { cobrancaId: linha?.cobranca_id ?? null, mudancaEm: linha?.mudanca_em ?? null }
}

/** "Confirmar pagamento" do diálogo de pagamento simulado. */
export async function pagarCobrancaSimulada(cobrancaId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('pagar_cobranca_simulada', {
    p_cobranca_id: cobrancaId,
  })
  if (error) throw error
}

/** Cancela: o plano vale até o fim do período pago. */
export async function cancelarPlanoSimulado(consultoriaId: string): Promise<string> {
  const { data: validaAte, error } = await obterSupabase().rpc('cancelar_plano_simulado', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return validaAte
}

/** Central: deixa a cobrança vencida há `dias` dias (demonstração do atraso e do só leitura). */
export async function simularAtraso(consultoriaId: string, dias: number): Promise<void> {
  const { error } = await obterSupabase().rpc('central_simular_atraso', {
    p_consultoria_id: consultoriaId,
    p_dias: dias,
  })
  if (error) throw error
}

/** Central: paga as cobranças em aberto. */
export async function simularPagamento(consultoriaId: string): Promise<number> {
  const { data: total, error } = await obterSupabase().rpc('central_simular_pagamento', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return total
}

// ---------------------------------------------------------------------------
// Central: Financeiro e plano da consultoria
// ---------------------------------------------------------------------------

export interface ResumoFinanceiro {
  pagantes: number
  emTeste: number
  beta: number
  internas: number
  emAtraso: number
  bloqueadas: number
  cancelados: number
  testeEncerrado: number
  testeAcabando: number
  mrrCentavos: number
  ticketMedioCentavos: number
  mensais: number
  anuais: number
  receitaPorPlano: Record<CodigoPlano, number>
}

export async function obterResumoFinanceiro(): Promise<ResumoFinanceiro> {
  const { data: linhas, error } = await obterSupabase().rpc('central_resumo_financeiro')
  if (error) throw error
  const r = linhas[0]
  return {
    pagantes: r?.pagantes ?? 0,
    emTeste: r?.em_teste ?? 0,
    beta: r?.beta ?? 0,
    internas: r?.internas ?? 0,
    emAtraso: r?.em_atraso ?? 0,
    bloqueadas: r?.bloqueadas ?? 0,
    cancelados: r?.cancelados ?? 0,
    testeEncerrado: r?.teste_encerrado ?? 0,
    testeAcabando: r?.teste_acabando ?? 0,
    mrrCentavos: r?.mrr_centavos ?? 0,
    ticketMedioCentavos: r?.ticket_medio_centavos ?? 0,
    mensais: r?.mensais ?? 0,
    anuais: r?.anuais ?? 0,
    receitaPorPlano: {
      essencial: r?.receita_essencial_centavos ?? 0,
      equipe: r?.receita_equipe_centavos ?? 0,
      escala: r?.receita_escala_centavos ?? 0,
    },
  }
}

export const GRUPOS_FINANCEIROS = [
  'pagantes',
  'teste',
  'teste_acabando',
  'beta',
  'internas',
  'em_atraso',
  'cancelados',
  'teste_encerrado',
] as const
export type GrupoFinanceiro = (typeof GRUPOS_FINANCEIROS)[number]

export const ROTULO_DO_GRUPO: Record<GrupoFinanceiro, string> = {
  pagantes: 'Pagantes',
  teste: 'Em teste',
  teste_acabando: 'Teste acabando',
  beta: 'Beta',
  internas: 'Contas internas',
  em_atraso: 'Em atraso',
  cancelados: 'Cancelados',
  teste_encerrado: 'Teste encerrado',
}

export function grupoOuNulo(valor: string | null): GrupoFinanceiro | null {
  return GRUPOS_FINANCEIROS.find((g) => g === valor) ?? null
}

export interface LinhaFinanceira {
  id: string
  nome: string
  situacao: SituacaoComercialCodigo | null
  plano: CodigoPlano | null
  ciclo: CicloDoPlano | null
  testeAte: string | null
  emAtrasoDesde: string | null
  mensalCentavos: number
}

export async function listarFinanceiro(
  grupo: GrupoFinanceiro | null,
  pagina: number,
): Promise<{ itens: LinhaFinanceira[]; total: number }> {
  const { data: linhas, error } = await obterSupabase().rpc('central_financeiro_lista', {
    p_grupo: grupo ?? undefined,
    p_limite: 50,
    p_deslocamento: pagina * 50,
  })
  if (error) throw error
  const dados = linhas
  return {
    itens: dados.map((l) => ({
      id: l.id,
      nome: l.nome,
      situacao: ehSituacaoComercial(l.situacao) ? l.situacao : null,
      plano: ehCodigoPlano(l.plano) ? l.plano : null,
      ciclo: ehCicloDoPlano(l.ciclo) ? l.ciclo : null,
      testeAte: l.teste_ate,
      emAtrasoDesde: l.em_atraso_desde,
      mensalCentavos: l.mensal_centavos,
    })),
    total: dados[0]?.total ?? 0,
  }
}

export interface PlanoNaCentral {
  dados: DadosComerciais | null
  condicaoRowVersion: number
  situacaoAsaas: string | null
}

export async function obterPlanoNaCentral(
  consultoriaId: string,
  catalogo?: () => Promise<CatalogoComercial>,
): Promise<PlanoNaCentral> {
  const { data: linhas, error } = await obterSupabase().rpc('central_plano_da_consultoria', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const l = linhas[0]
  if (!l) return { dados: null, condicaoRowVersion: 0, situacaoAsaas: null }
  return {
    dados: dadosComerciaisDaLinha(
      {
        ...l,
        cobranca_aberta_id: null,
        cobranca_aberta_valor_centavos: null,
        cobranca_aberta_vencimento: null,
      },
      catalogo ? await catalogo() : undefined,
    ),
    condicaoRowVersion: l.condicao_row_version,
    situacaoAsaas: l.situacao_asaas,
  }
}

export async function ajustarDiasDeTeste(
  consultoriaId: string,
  dias: number,
  motivo: string,
  rowVersion: number,
): Promise<number> {
  const { data: versao, error } = await obterSupabase().rpc('central_ajustar_dias_de_teste', {
    p_consultoria_id: consultoriaId,
    p_dias: dias,
    p_motivo: motivo,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return versao
}

export async function marcarContaInterna(
  consultoriaId: string,
  interna: boolean,
  motivo: string,
  rowVersion: number,
): Promise<number> {
  const { data: versao, error } = await obterSupabase().rpc('central_marcar_conta_interna', {
    p_consultoria_id: consultoriaId,
    p_interna: interna,
    p_motivo: motivo,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return versao
}

export interface MudancaComercial {
  id: string
  tipo: 'dias_de_teste' | 'interna'
  valorAnterior: string
  valorNovo: string
  motivo: string
  alteradaEm: string
  alteradaPorNome: string
}

export async function listarHistoricoComercial(consultoriaId: string): Promise<MudancaComercial[]> {
  const { data: linhas, error } = await obterSupabase().rpc('central_historico_comercial', {
    p_consultoria_id: consultoriaId,
    p_limite: 50,
    p_deslocamento: 0,
  })
  if (error) throw error
  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo === 'interna' ? 'interna' : 'dias_de_teste',
    valorAnterior: l.valor_anterior,
    valorNovo: l.valor_novo,
    motivo: l.motivo,
    alteradaEm: l.alterada_em,
    alteradaPorNome: l.alterada_por_nome,
  }))
}
