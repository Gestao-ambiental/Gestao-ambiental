// Fila de revisão das mudanças de norma na central (LEG-04; ADR-0050, itens 14 a 16). O operador vê
// a diferença, pede o resumo por IA (Edge Function resumir-mudanca, que só lê texto público da
// norma), corrige resumo e critérios e publica ou descarta com motivo. Quem recusa é o banco.

import { FunctionsHttpError } from '@supabase/supabase-js'

import type { Json } from '@/lib/database.types'
import { mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { lista, objeto, texto, textoOuNulo, type Objeto } from './json'
import type { PaginaDaCentral } from './central'

export const TAMANHO_PAGINA_NORMAS = 25

export type TipoDeMudanca = 'nova' | 'alterada' | 'revogada' | 'republicada'
export type SituacaoDaMudanca = 'detectada' | 'resumida' | 'publicada' | 'descartada'

export const ROTULO_TIPO_DE_MUDANCA: Record<TipoDeMudanca, string> = {
  nova: 'Nova',
  alterada: 'Alterada',
  revogada: 'Revogada',
  republicada: 'Republicada',
}

export const ROTULO_SITUACAO_DA_MUDANCA: Record<SituacaoDaMudanca, string> = {
  detectada: 'Detectada',
  resumida: 'Resumida',
  publicada: 'Publicada',
  descartada: 'Descartada',
}

export const SITUACOES_DA_MUDANCA: readonly SituacaoDaMudanca[] = [
  'detectada',
  'resumida',
  'publicada',
  'descartada',
]

/** Tipos de critério de aplicabilidade, os mesmos de private.norma_criterio. */
export type TipoDeCriterio =
  'atividade' | 'prefixo_atividade' | 'tipo_licenca' | 'municipio' | 'competencia' | 'tema'

export const TIPOS_DE_CRITERIO: readonly TipoDeCriterio[] = [
  'atividade',
  'prefixo_atividade',
  'tipo_licenca',
  'municipio',
  'competencia',
  'tema',
]

export const ROTULO_TIPO_DE_CRITERIO: Record<TipoDeCriterio, string> = {
  atividade: 'Atividade',
  prefixo_atividade: 'Prefixo de atividade',
  tipo_licenca: 'Tipo de licença',
  municipio: 'Município (IBGE)',
  competencia: 'Competência',
  tema: 'Tema',
}

/** Valores fechados de alguns tipos (o banco confere todos pelo mesmo check). */
export const VALORES_DO_CRITERIO: Partial<Record<TipoDeCriterio, readonly string[]>> = {
  tipo_licenca: ['LAP', 'LAI', 'LAO', 'AuA', 'LAC', 'renovacao'],
  competencia: ['estadual', 'municipal'],
}

export interface CriterioDeNorma {
  tipo: TipoDeCriterio
  valor: string
}

export interface MudancaNaFila {
  id: string
  normaId: string
  normaTitulo: string
  tipo: TipoDeMudanca
  situacao: SituacaoDaMudanca
  detectadaEm: string
  temResumo: boolean
}

export interface ResumoDaMudanca {
  resumo: string
  oQueMuda: string[]
  /** O que veio do banco, para publicar sem perder campos que a tela não edita. */
  original: Objeto
}

export interface DispositivoDaNorma {
  caminho: string
  rotulo: string
  texto: string
}

export interface DispositivoAlteradoDaNorma {
  caminho: string
  rotulo: string
  antes: string
  depois: string
}

export type DiferencaDaMudanca =
  | {
      estruturada: true
      incluidos: DispositivoDaNorma[]
      alterados: DispositivoAlteradoDaNorma[]
      revogados: DispositivoDaNorma[]
    }
  | { estruturada: false; mudou: boolean }

export interface VersaoNaRevisao {
  publicadaEm: string | null
  trecho: string
}

export interface ChamadaDeIaDaMudanca {
  id: string
  situacao: string
  modelo: string | null
  custoMicros: number
  criadoEm: string | null
}

export interface DetalheDaMudanca {
  id: string
  tipo: TipoDeMudanca
  situacao: SituacaoDaMudanca
  detectadaEm: string | null
  motivoDescarte: string | null
  norma: { titulo: string; tipo: string; orgao: string; esfera: string }
  urlOficial: string | null
  diferenca: DiferencaDaMudanca | null
  resumo: ResumoDaMudanca | null
  criteriosSugeridos: CriterioDeNorma[]
  versaoAnterior: VersaoNaRevisao | null
  versaoNova: VersaoNaRevisao | null
  chamadas: ChamadaDeIaDaMudanca[]
}

export interface UsoDeIaDaPlataforma {
  resumosHoje: number
  custoMesMicros: number
  limiteDia: number
  limiteMesMicros: number
}

function tipoDeMudanca(valor: unknown): TipoDeMudanca {
  return valor === 'nova' || valor === 'revogada' || valor === 'republicada' ? valor : 'alterada'
}

function situacaoDaMudanca(valor: unknown): SituacaoDaMudanca {
  return SITUACOES_DA_MUDANCA.find((s) => s === valor) ?? 'detectada'
}

function numero(valor: Json | undefined): number {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor)))
    return Number(valor)
  return 0
}

export function ehTipoDeCriterio(valor: unknown): valor is TipoDeCriterio {
  return TIPOS_DE_CRITERIO.some((t) => t === valor)
}

/** Critérios como o banco ou a IA devolvem ([{tipo, valor}]); o que não tem essa forma fica de fora. */
export function lerCriterios(valor: Json | undefined): CriterioDeNorma[] {
  return lista(valor).flatMap((item): CriterioDeNorma[] => {
    const tipo = item.tipo
    const lido = texto(item.valor).trim()
    return ehTipoDeCriterio(tipo) && lido !== '' ? [{ tipo, valor: lido }] : []
  })
}

function lerOQueMuda(valor: Json | undefined): string[] {
  if (typeof valor === 'string') {
    return valor
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha !== '')
  }
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => (typeof item === 'string' && item.trim() !== '' ? [item] : []))
}

function lerResumo(valor: Json | undefined): ResumoDaMudanca | null {
  const lido = objeto(valor)
  if (!lido) return null
  return { resumo: texto(lido.resumo), oQueMuda: lerOQueMuda(lido.o_que_muda), original: lido }
}

function lerDispositivos(valor: Json | undefined): DispositivoDaNorma[] {
  return lista(valor).map((item) => ({
    caminho: texto(item.caminho),
    rotulo: texto(item.rotulo),
    texto: texto(item.texto),
  }))
}

/** Diferença como compararVersoes (domínio) grava; objeto vazio vira nulo. */
export function lerDiferenca(valor: Json | undefined): DiferencaDaMudanca | null {
  const lido = objeto(valor)
  if (!lido) return null
  if (lido.estruturada === true) {
    return {
      estruturada: true,
      incluidos: lerDispositivos(lido.incluidos),
      alterados: lista(lido.alterados).map((item) => ({
        caminho: texto(item.caminho),
        rotulo: texto(item.rotulo),
        antes: texto(item.antes),
        depois: texto(item.depois),
      })),
      revogados: lerDispositivos(lido.revogados),
    }
  }
  if (lido.estruturada === false) return { estruturada: false, mudou: lido.mudou !== false }
  return null
}

function lerVersao(valor: Json | undefined): VersaoNaRevisao | null {
  const lido = objeto(valor)
  if (!lido) return null
  return {
    publicadaEm: textoOuNulo(lido.publicada_em),
    trecho: texto(lido.trecho ?? lido.texto),
  }
}

export async function listarMudancasDeNorma(
  pagina: number,
  situacao: SituacaoDaMudanca | null = null,
): Promise<PaginaDaCentral<MudancaNaFila>> {
  const { data, error } = await obterSupabase().rpc('central_listar_mudancas_de_norma', {
    p_limite: TAMANHO_PAGINA_NORMAS,
    p_deslocamento: pagina * TAMANHO_PAGINA_NORMAS,
    ...(situacao ? { p_situacao: situacao } : {}),
  })
  if (error) throw error
  const linhas = (data as typeof data | null) ?? []
  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      normaId: linha.norma_id,
      normaTitulo: linha.norma_titulo,
      tipo: tipoDeMudanca(linha.tipo),
      situacao: situacaoDaMudanca(linha.situacao),
      detectadaEm: linha.detectada_em,
      temResumo: linha.tem_resumo,
    })),
    total: linhas[0]?.total ?? 0,
  }
}

export async function detalheDaMudancaDeNorma(id: string): Promise<DetalheDaMudanca | null> {
  const { data, error } = await obterSupabase().rpc('central_detalhe_da_mudanca_de_norma', {
    p_id: id,
  })
  if (error) throw error
  const lido = objeto(data)
  if (!lido) return null
  const norma = objeto(lido.norma) ?? {}
  return {
    id: texto(lido.id) || id,
    tipo: tipoDeMudanca(lido.tipo),
    situacao: situacaoDaMudanca(lido.situacao),
    detectadaEm: textoOuNulo(lido.detectada_em),
    motivoDescarte: textoOuNulo(lido.motivo_descarte),
    norma: {
      titulo: texto(norma.titulo),
      tipo: texto(norma.tipo),
      orgao: texto(norma.orgao),
      esfera: texto(norma.esfera),
    },
    urlOficial: textoOuNulo(lido.url_oficial) ?? textoOuNulo(norma.url_oficial),
    diferenca: lerDiferenca(lido.diferenca),
    resumo: lerResumo(lido.resumo),
    criteriosSugeridos: lerCriterios(lido.criterios_sugeridos),
    versaoAnterior: lerVersao(lido.versao_anterior),
    versaoNova: lerVersao(lido.versao_nova),
    chamadas: lista(lido.chamadas_ia ?? lido.chamadas).map((item) => ({
      id: texto(item.id),
      situacao: texto(item.situacao),
      modelo: textoOuNulo(item.modelo),
      custoMicros: numero(item.custo_micros),
      criadoEm: textoOuNulo(item.criado_em),
    })),
  }
}

/**
 * Publica a mudança com o resumo revisado. Mantém os campos do resumo que a tela não edita e troca
 * "resumo" e "o que muda" pelo texto do operador; os critérios entram como 'ia_confirmada'.
 */
export async function publicarMudancaDeNorma(
  id: string,
  resumo: { resumo: string; oQueMuda: string[]; original?: Objeto | null },
  criterios: CriterioDeNorma[],
): Promise<void> {
  const pResumo: Record<string, Json | undefined> = {
    ...(resumo.original ?? {}),
    resumo: resumo.resumo.trim(),
    o_que_muda: resumo.oQueMuda.map((item) => item.trim()).filter((item) => item !== ''),
  }
  const { error } = await obterSupabase().rpc('central_publicar_mudanca_de_norma', {
    p_id: id,
    p_resumo: pResumo as Json,
    p_criterios: criterios.map((c) => ({ tipo: c.tipo, valor: c.valor.trim() })),
  })
  if (error) throw error
}

export async function descartarMudancaDeNorma(id: string, motivo: string): Promise<void> {
  const { error } = await obterSupabase().rpc('central_descartar_mudanca_de_norma', {
    p_id: id,
    p_motivo: motivo.trim(),
  })
  if (error) throw error
}

export async function usoDeIaDaPlataforma(): Promise<UsoDeIaDaPlataforma> {
  const { data, error } = await obterSupabase().rpc('central_uso_de_ia_da_plataforma')
  if (error) throw error
  const lido = objeto(data) ?? {}
  return {
    resumosHoje: numero(lido.resumos_hoje),
    custoMesMicros: numero(lido.custo_mes_micros),
    limiteDia: numero(lido.limite_dia),
    limiteMesMicros: numero(lido.limite_mes_micros),
  }
}

const MENSAGENS_DA_NORMA: Record<string, string> = {
  mudanca_inexistente: 'Esta mudança não existe mais.',
  mudanca_ja_publicada: 'Esta mudança já foi revisada. Recarregue para ver a situação.',
  mudanca_ja_revisada: 'Esta mudança já foi revisada. Recarregue para ver a situação.',
  cota_diaria_esgotada: 'A cota de resumos de hoje acabou. Tente amanhã.',
  cota_mensal_esgotada: 'A cota de custo de IA deste mês acabou.',
  muitas_simultaneas: 'Há resumos demais sendo gerados agora. Tente em alguns minutos.',
  criterio_invalido: 'Um dos critérios tem valor inválido. Confira tipo e valor.',
  resumo_obrigatorio: 'Informe o resumo',
  resumo_invalido: 'O resumo precisa ter de 1 a 1.200 caracteres.',
  ia_indisponivel: 'A IA não respondeu. Tente de novo em alguns minutos.',
  provedor_indisponivel: 'A IA não respondeu. Tente de novo em alguns minutos.',
  tempo_esgotado: 'A IA demorou demais para responder. Tente de novo.',
  provedor_recusou: 'O provedor de IA recusou o pedido. Tente de novo mais tarde.',
  resposta_invalida: 'A IA respondeu fora do formato. Tente de novo.',
  erro_interno: 'Não foi possível gerar o resumo. Tente de novo.',
  configuracao_ausente: 'O resumo por IA não está configurado.',
  sem_permissao: 'Você não tem permissão para esta ação.',
  dois_fatores_necessarios: 'Confirme o código do aplicativo autenticador para continuar.',
}

/** Mensagem de tela para os erros da fila de normas (banco ou Edge Function). */
export function mensagemDoErroDaNorma(erro: unknown): string {
  const mensagem =
    erro instanceof Error || (typeof erro === 'object' && erro !== null && 'message' in erro)
      ? (erro as { message?: unknown }).message
      : undefined
  if (typeof mensagem === 'string' && Object.hasOwn(MENSAGENS_DA_NORMA, mensagem))
    return MENSAGENS_DA_NORMA[mensagem] ?? mensagemDoErro(erro)
  return mensagemDoErro(erro)
}

/**
 * Pede o resumo por IA da mudança à Edge Function resumir-mudanca (o JWT do operador vai junto; a
 * função confere operador e cota). Erro vira Error com o código devolvido pela função.
 */
export async function gerarResumoDaMudanca(id: string): Promise<void> {
  const resposta = await obterSupabase().functions.invoke('resumir-mudanca', {
    body: { mudanca_id: id },
  })
  const erro: unknown = resposta.error
  if (!erro) return
  if (erro instanceof FunctionsHttpError) {
    const corpo = (await (erro.context as Response).json().catch(() => ({}))) as {
      erro?: string
    }
    throw new Error(corpo.erro ?? 'ia_indisponivel')
  }
  throw new Error('ia_indisponivel')
}
