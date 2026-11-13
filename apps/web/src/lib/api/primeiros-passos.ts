// Primeiros passos do orçamento (ADR-0020): rascunho da configuração salvo a cada passo, convite
// dispensado por pessoa e publicação da base numa transação. Só a Gestão; o banco confere.

import {
  FORMAS_DE_RECEBIMENTO,
  type DadosDaConfiguracao,
  type PassoContas,
  type PassoEquipe,
  type PassoPrecos,
  type PassoTributos,
  type PendenciaDaConfiguracao,
  type PessoaDoRascunho,
} from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

import { horasDe, horasDeVendaParaOBanco, type HoraDeVenda } from './orcamentos'

export type DadosDoRascunho = DadosDaConfiguracao<HoraDeVenda>

export interface RascunhoDaConfiguracao {
  dados: DadosDoRascunho
  /** Passo em que a pessoa retoma (1 a 6). */
  etapa: number
  rowVersion: number
  /** Versão da base quando o rascunho começou (0 = sem base). */
  baseRowVersion: number
  pendencias: PendenciaDaConfiguracao[]
  /** Passos (1 a 5) já salvos ao menos uma vez. */
  passosSalvos: number[]
  atualizadoEm: string | null
  atualizadoPorNome: string | null
}

export interface EstadoDaConfiguracao {
  rascunho: RascunhoDaConfiguracao | null
  /** Esta pessoa escolheu "Ver orçamentos mesmo assim" nesta consultoria. */
  dispensado: boolean
  baseConfigurada: boolean
  /** Versão da base agora (0 = sem base). */
  baseRowVersion: number
}

/** O que cada passo salva. O passo 5 (proposta) vai pela RPC da identidade e só marca progresso. */
export type PassoSalvo =
  | { etapa: 1; dados: PassoEquipe }
  | { etapa: 2; dados: PassoContas }
  | { etapa: 3; dados: PassoPrecos<HoraDeVenda> }
  | { etapa: 4; dados: PassoTributos }
  | { etapa: 5 }

const PENDENCIAS: readonly PendenciaDaConfiguracao[] = [
  'equipe',
  'horas',
  'contas',
  'precos',
  'tributos',
  'taxas',
  'margens',
]

// ---------------------------------------------------------------------------
// Leitura defensiva
// ---------------------------------------------------------------------------

type Objeto = Record<string, Json | undefined>

function objeto(valor: Json | undefined): Objeto | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : null
}
function lista(valor: Json | undefined): Objeto[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item): Objeto[] => {
    const lido = objeto(item)
    return lido ? [lido] : []
  })
}
function textoOuNulo(valor: Json | undefined): string | null {
  return typeof valor === 'string' ? valor : null
}
/** Número ou nulo: o nulo do rascunho continua nulo (nunca vira zero). */
function numeroOuNulo(valor: Json | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}
function inteiro(valor: Json | undefined): number {
  return numeroOuNulo(valor) ?? 0
}

function equipeDe(p: Objeto): PassoEquipe {
  return {
    modo: p.modo === 'manual' ? 'manual' : 'equipe',
    horaTecnicaCentavos: numeroOuNulo(p.hora_tecnica_centavos),
    equipe: lista(p.equipe).map((e): PessoaDoRascunho => ({
      id: textoOuNulo(e.id) ?? '',
      membroId: textoOuNulo(e.membro_id) ?? '',
      socio: e.socio === true,
      profissao: textoOuNulo(e.profissao),
      forma: FORMAS_DE_RECEBIMENTO.find((f) => f === e.tipo_recebimento) ?? null,
      custoMensalCentavos: numeroOuNulo(e.custo_mensal_centavos),
      horasNoMes: numeroOuNulo(e.horas_disponiveis_mes),
      custoDiariaCentavos: numeroOuNulo(e.custo_diaria_centavos),
      horasPorDiaria: numeroOuNulo(e.horas_por_diaria),
      diasNoMes: numeroOuNulo(e.dias_no_mes),
      custoProjetoCentavos: numeroOuNulo(e.custo_projeto_centavos),
      horasDoProjeto: numeroOuNulo(e.horas_projeto),
    })),
  }
}

function contasDe(p: Objeto): PassoContas {
  return {
    custosFixosMensaisCentavos: numeroOuNulo(p.custos_fixos_mensais_centavos),
    horasFaturaveisMes: numeroOuNulo(p.horas_faturaveis_mes),
    contas: lista(p.contas).map((c) => ({
      descricao: textoOuNulo(c.descricao) ?? '',
      valorCentavos: numeroOuNulo(c.valor_centavos),
    })),
  }
}

function precosDe(p: Objeto): PassoPrecos<HoraDeVenda> {
  return {
    horasVenda: horasDe(p.horas_venda),
    valorVisitaCentavos: numeroOuNulo(p.valor_visita_centavos),
    custoKmCentavos: numeroOuNulo(p.custo_km_centavos),
  }
}

function tributosDe(p: Objeto): PassoTributos {
  return {
    tributosPb: numeroOuNulo(p.tributos_pb),
    taxasPb: numeroOuNulo(p.taxas_pb),
    taxaPorCobrancaCentavos: numeroOuNulo(p.taxa_por_cobranca_centavos),
    taxaPorAssinaturaCentavos: numeroOuNulo(p.taxa_por_assinatura_centavos),
    margemDesejadaPb: numeroOuNulo(p.margem_desejada_pb),
    margemMinimaPb: numeroOuNulo(p.margem_minima_pb),
    margensConfirmadas: p.margens_confirmadas === true,
  }
}

function dadosDe(valor: Json | undefined): DadosDoRascunho {
  const d = objeto(valor) ?? {}
  const p1 = objeto(d.passo_1)
  const p2 = objeto(d.passo_2)
  const p3 = objeto(d.passo_3)
  const p4 = objeto(d.passo_4)
  return {
    ...(p1 ? { equipe: equipeDe(p1) } : {}),
    ...(p2 ? { contas: contasDe(p2) } : {}),
    ...(p3 ? { precos: precosDe(p3) } : {}),
    ...(p4 ? { tributos: tributosDe(p4) } : {}),
  }
}

function rascunhoDe(valor: Json | undefined): RascunhoDaConfiguracao | null {
  const r = objeto(valor)
  if (!r) return null
  const etapa = inteiro(r.etapa)
  return {
    dados: dadosDe(r.dados),
    etapa: etapa >= 1 && etapa <= 6 ? etapa : 1,
    rowVersion: inteiro(r.row_version),
    baseRowVersion: inteiro(r.base_row_version),
    pendencias: Array.isArray(r.pendencias)
      ? PENDENCIAS.filter((p) => (r.pendencias as Json[]).includes(p))
      : [],
    passosSalvos: [1, 2, 3, 4, 5].filter(
      (n) => objeto(objeto(r.dados)?.[`passo_${String(n)}`]) !== null,
    ),
    atualizadoEm: textoOuNulo(r.atualizado_em),
    atualizadoPorNome: textoOuNulo(r.atualizado_por_nome),
  }
}

// ---------------------------------------------------------------------------
// Escrita: a forma de cada passo, igual à que o banco valida
// ---------------------------------------------------------------------------

function passoParaOBanco(passo: PassoSalvo): Json {
  switch (passo.etapa) {
    case 1:
      return {
        modo: passo.dados.modo,
        hora_tecnica_centavos: passo.dados.horaTecnicaCentavos,
        equipe: passo.dados.equipe.map((p) => ({
          id: p.id,
          membro_id: p.membroId,
          socio: p.socio,
          profissao: p.profissao,
          tipo_recebimento: p.forma,
          custo_mensal_centavos: p.custoMensalCentavos,
          horas_disponiveis_mes: p.horasNoMes,
          custo_diaria_centavos: p.custoDiariaCentavos,
          horas_por_diaria: p.horasPorDiaria,
          dias_no_mes: p.diasNoMes,
          custo_projeto_centavos: p.custoProjetoCentavos,
          horas_projeto: p.horasDoProjeto,
        })),
      }
    case 2:
      return {
        custos_fixos_mensais_centavos: passo.dados.custosFixosMensaisCentavos,
        horas_faturaveis_mes: passo.dados.horasFaturaveisMes,
        contas: passo.dados.contas.map((c) => ({
          descricao: c.descricao,
          valor_centavos: c.valorCentavos,
        })),
      }
    case 3:
      return {
        horas_venda: horasDeVendaParaOBanco(passo.dados.horasVenda),
        valor_visita_centavos: passo.dados.valorVisitaCentavos,
        custo_km_centavos: passo.dados.custoKmCentavos,
      }
    case 4:
      return {
        tributos_pb: passo.dados.tributosPb,
        taxas_pb: passo.dados.taxasPb,
        taxa_por_cobranca_centavos: passo.dados.taxaPorCobrancaCentavos,
        taxa_por_assinatura_centavos: passo.dados.taxaPorAssinaturaCentavos,
        margem_desejada_pb: passo.dados.margemDesejadaPb,
        margem_minima_pb: passo.dados.margemMinimaPb,
        margens_confirmadas: passo.dados.margensConfirmadas,
      }
    case 5:
      return {}
  }
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

export async function obterConfiguracao(cid: string): Promise<EstadoDaConfiguracao> {
  const { data, error } = await obterSupabase().rpc('obter_rascunho_configuracao_orcamento', {
    p_consultoria_id: cid,
  })
  if (error) throw error
  const e = objeto(data)
  if (!e) throw new Error('resposta_invalida')
  return {
    rascunho: rascunhoDe(e.rascunho),
    dispensado: e.dispensado === true,
    baseConfigurada: e.base_configurada === true,
    baseRowVersion: inteiro(e.base_row_version),
  }
}

export interface PedidoDeSalvarPasso {
  /** Versão do rascunho; 0 cria. */
  rowVersion: number
  passo: PassoSalvo
  /** Onde retomar: o próximo passo, ou o próprio em "continuar depois". */
  proximaEtapa: number
  /** Versão da base de onde a tela copiou os valores (conferida só na criação). */
  baseRowVersion: number
  /** Repetir a mesma operação (ex.: depois de uma falha de rede) não grava duas vezes. */
  operacao: string
}

export async function salvarPasso(
  cid: string,
  pedido: PedidoDeSalvarPasso,
): Promise<RascunhoDaConfiguracao> {
  const { data, error } = await obterSupabase().rpc('salvar_passo_configuracao_orcamento', {
    p_consultoria_id: cid,
    p_row_version: pedido.rowVersion,
    p_etapa: pedido.passo.etapa,
    p_dados: passoParaOBanco(pedido.passo),
    p_proxima_etapa: pedido.proximaEtapa,
    p_base_row_version: pedido.baseRowVersion,
    p_operacao: pedido.operacao,
  })
  if (error) throw error
  const r = rascunhoDe(data)
  if (!r) throw new Error('resposta_invalida')
  return r
}

export async function descartarConfiguracao(cid: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('descartar_rascunho_configuracao_orcamento', {
    p_consultoria_id: cid,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

export async function dispensarConfiguracao(cid: string): Promise<void> {
  const { error } = await obterSupabase().rpc('dispensar_convite_configuracao_orcamento', {
    p_consultoria_id: cid,
  })
  if (error) throw error
}

/** Publica o rascunho como a base dos cálculos. Devolve a versão nova da base. */
export async function publicarConfiguracao(cid: string, rowVersion: number): Promise<number> {
  const { data, error } = await obterSupabase().rpc('publicar_configuracao_orcamento', {
    p_consultoria_id: cid,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}
