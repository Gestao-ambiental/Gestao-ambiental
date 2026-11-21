// Normas para as consultorias (LEG-05; ADR-0050, itens 16 e 25): catálogo, detalhe da norma com as
// mudanças publicadas e os avisos de mudança que afetam a carteira (aviso_norma). Quem decide o que
// cada um vê é o banco: as RPCs exigem membro ativo da consultoria.

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

import {
  ehTipoDeCriterio,
  lerDiferenca,
  type CriterioDeNorma,
  type DiferencaDaMudanca,
} from './central-normas'
import { lista, objeto, texto, textoOuNulo } from './json'

export const TAMANHO_PAGINA_MUDANCAS = 25

/** Chaves do TanStack Query: a página da norma invalida a aba ao marcar uma mudança como vista. */
export const CHAVES_DE_NORMAS = {
  mudancas: 'mudancas-de-norma',
  naoVistas: 'normas-nao-vistas',
  afetados: 'afetados-pela-mudanca',
  detalhe: 'detalhe-da-norma',
} as const

export type TipoDeMudancaDeNorma = 'nova' | 'alterada' | 'revogada' | 'republicada'

/** Tipo da mudança em texto, para a aba Normas e o detalhe da norma. */
export const ROTULO_DA_MUDANCA: Record<TipoDeMudancaDeNorma, string> = {
  nova: 'Norma nova',
  alterada: 'Texto alterado',
  revogada: 'Revogada',
  republicada: 'Republicada',
}

/** Tipos de norma de private.norma, como se leem. */
export const ROTULO_TIPO_DE_NORMA: Record<string, string> = {
  lei: 'Lei',
  lei_complementar: 'Lei complementar',
  decreto: 'Decreto',
  resolucao: 'Resolução',
  instrucao_normativa: 'Instrução normativa',
  portaria: 'Portaria',
  deliberacao: 'Deliberação',
  medida_provisoria: 'Medida provisória',
}

export function rotuloDoTipoDeNorma(tipo: string): string {
  return ROTULO_TIPO_DE_NORMA[tipo] ?? tipo
}

export interface PaginaDeNormas<T> {
  itens: T[]
  total: number
}

export interface NormaNaBusca {
  id: string
  chave: string
  titulo: string
  esfera: string
  municipioIbge: string | null
  orgao: string
  tipo: string
  numero: string
  ano: number | null
  revogada: boolean
  ultimaVersaoEm: string | null
}

export interface VersaoDaNorma {
  id: string
  numero: number
  /** DATE da publicação (aaaa-mm-dd), quando a fonte publica. */
  publicadaEm: string | null
  publicadaEmTexto: string | null
  /** Instante da coleta (TIMESTAMPTZ). */
  coletadaEm: string | null
}

export interface ResumoDaNorma {
  resumo: string
  oQueMuda: string[]
  prazoDeAdequacao: string | null
}

export interface MudancaDaNorma {
  id: string
  tipo: TipoDeMudancaDeNorma
  detectadaEm: string | null
  /** Instante em que o operador revisou e publicou (TIMESTAMPTZ). */
  publicadaEm: string | null
  diferenca: DiferencaDaMudanca | null
  resumo: ResumoDaNorma | null
}

export interface CriterioDaNorma extends CriterioDeNorma {
  origem: string
}

export interface DetalheDaNorma {
  id: string
  chave: string
  titulo: string
  ementa: string | null
  esfera: string
  municipioIbge: string | null
  orgao: string
  tipo: string
  numero: string
  ano: number | null
  temas: string[]
  urlOficial: string | null
  revogada: boolean
  /** DATE da revogação, quando a fonte publica. */
  revogadaEm: string | null
  /** Id da norma que revogou, quando se sabe. */
  revogadaPor: string | null
  versoes: VersaoDaNorma[]
  mudancas: MudancaDaNorma[]
  criterios: CriterioDaNorma[]
}

export interface MudancaNaCarteira {
  mudancaId: string
  normaId: string
  normaTitulo: string
  tipo: TipoDeMudancaDeNorma
  publicadaEm: string
  resumo: string | null
  empreendimentos: number
  licencas: number
  clientes: number
  naoVista: boolean
}

/** Por que o empreendimento (ou a licença) foi afetado: o critério da norma e o valor que casou. */
export interface MotivoDoAviso {
  criterio: string
  valor: string
}

export interface AfetadoPelaMudanca {
  empreendimentoId: string
  empreendimentoNome: string
  clienteNome: string | null
  instrumentoId: string | null
  licenca: string | null
  motivo: MotivoDoAviso
  vistoEm: string | null
}

function tipoDeMudanca(valor: unknown): TipoDeMudancaDeNorma {
  return valor === 'nova' || valor === 'revogada' || valor === 'republicada' ? valor : 'alterada'
}

function inteiro(valor: Json | undefined): number {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor)))
    return Number(valor)
  return 0
}

function inteiroOuNulo(valor: Json | undefined): number | null {
  return valor === null || valor === undefined ? null : inteiro(valor)
}

function textos(valor: Json | undefined): string[] {
  if (typeof valor === 'string') {
    return valor
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha !== '')
  }
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => (typeof item === 'string' && item.trim() !== '' ? [item] : []))
}

function lerResumo(valor: Json | undefined): ResumoDaNorma | null {
  const lido = objeto(valor)
  if (!lido) return null
  const resumo = texto(lido.resumo).trim()
  const oQueMuda = textos(lido.o_que_muda)
  if (resumo === '' && oQueMuda.length === 0) return null
  const prazo = textoOuNulo(lido.prazo_de_adequacao)?.trim() ?? ''
  return { resumo, oQueMuda, prazoDeAdequacao: prazo === '' ? null : prazo }
}

export function lerMotivo(valor: Json | undefined): MotivoDoAviso {
  const lido = objeto(valor) ?? {}
  const bruto = lido.valor
  return {
    criterio: texto(lido.criterio),
    valor: typeof bruto === 'number' ? String(bruto) : texto(bruto),
  }
}

/** Catálogo de normas (título ou número), paginado. */
export async function buscarNormas(
  termo: string,
  pagina = 0,
  limite = 20,
): Promise<PaginaDeNormas<NormaNaBusca>> {
  const { data, error } = await obterSupabase().rpc('buscar_normas', {
    p_termo: termo.trim(),
    p_limite: limite,
    p_deslocamento: pagina * limite,
  })
  if (error) throw error
  const linhas = (data as typeof data | null) ?? []
  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      chave: linha.chave,
      titulo: linha.titulo,
      esfera: linha.esfera,
      municipioIbge: linha.municipio_ibge,
      orgao: linha.orgao,
      tipo: linha.tipo,
      numero: linha.numero,
      ano: linha.ano,
      revogada: linha.situacao_na_fonte === 'revogada',
      ultimaVersaoEm: linha.ultima_versao_em,
    })),
    total: linhas[0]?.total ?? 0,
  }
}

/** Detalhe da norma; nulo quando não existe (ou quem pede não é membro de consultoria). */
export async function detalheDaNorma(id: string): Promise<DetalheDaNorma | null> {
  const { data, error } = await obterSupabase().rpc('detalhe_da_norma', { p_norma_id: id })
  if (error) throw error
  const lido = objeto(data)
  if (!lido) return null
  return {
    id: texto(lido.id) || id,
    chave: texto(lido.chave),
    titulo: texto(lido.titulo),
    ementa: textoOuNulo(lido.ementa),
    esfera: texto(lido.esfera),
    municipioIbge: textoOuNulo(lido.municipio_ibge),
    orgao: texto(lido.orgao),
    tipo: texto(lido.tipo),
    numero: texto(lido.numero),
    ano: inteiroOuNulo(lido.ano),
    temas: textos(lido.temas),
    urlOficial: textoOuNulo(lido.url_oficial),
    revogada: lido.situacao_na_fonte === 'revogada',
    revogadaEm: textoOuNulo(lido.revogada_em),
    revogadaPor: textoOuNulo(lido.revogada_por),
    versoes: lista(lido.versoes).map((v) => ({
      id: texto(v.id),
      numero: inteiro(v.numero),
      publicadaEm: textoOuNulo(v.publicada_em),
      publicadaEmTexto: textoOuNulo(v.publicada_em_texto),
      coletadaEm: textoOuNulo(v.coletada_em),
    })),
    mudancas: lista(lido.mudancas).map((m) => ({
      id: texto(m.id),
      tipo: tipoDeMudanca(m.tipo),
      detectadaEm: textoOuNulo(m.detectada_em),
      publicadaEm: textoOuNulo(m.publicada_em),
      diferenca: lerDiferenca(m.diferenca),
      resumo: lerResumo(m.resumo),
    })),
    criterios: lista(lido.criterios).flatMap((item): CriterioDaNorma[] => {
      const tipo = item.tipo
      const valor = texto(item.valor).trim()
      return ehTipoDeCriterio(tipo) && valor !== ''
        ? [{ tipo, valor, origem: texto(item.origem) }]
        : []
    }),
  }
}

/** Mudanças publicadas que afetam a carteira da consultoria, mais recentes primeiro. */
export async function listarMudancasDaConsultoria(
  consultoriaId: string,
  pagina = 0,
  soNaoVistas = false,
): Promise<PaginaDeNormas<MudancaNaCarteira>> {
  const { data, error } = await obterSupabase().rpc('listar_mudancas_de_norma_da_consultoria', {
    p_consultoria_id: consultoriaId,
    p_so_nao_vistas: soNaoVistas,
    p_limite: TAMANHO_PAGINA_MUDANCAS,
    p_deslocamento: pagina * TAMANHO_PAGINA_MUDANCAS,
  })
  if (error) throw error
  const linhas = (data as typeof data | null) ?? []
  return {
    itens: linhas.map((linha) => ({
      mudancaId: linha.mudanca_id,
      normaId: linha.norma_id,
      normaTitulo: linha.norma_titulo,
      tipo: tipoDeMudanca(linha.tipo_mudanca),
      publicadaEm: linha.publicada_em,
      resumo: linha.resumo,
      empreendimentos: linha.empreendimentos,
      licencas: linha.licencas,
      clientes: linha.clientes,
      naoVista: linha.nao_vista,
    })),
    total: linhas[0]?.total ?? 0,
  }
}

/** Quantas mudanças que afetam a carteira ninguém da consultoria viu ainda. */
export async function contarMudancasNaoVistas(consultoriaId: string): Promise<number> {
  const { data, error } = await obterSupabase().rpc('contar_mudancas_de_norma_nao_vistas', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** Empreendimentos e licenças da consultoria afetados pela mudança, com o motivo. */
export async function afetadosPelaMudanca(
  consultoriaId: string,
  mudancaId: string,
): Promise<AfetadoPelaMudanca[]> {
  const { data, error } = await obterSupabase().rpc('afetados_pela_mudanca', {
    p_consultoria_id: consultoriaId,
    p_mudanca_id: mudancaId,
  })
  if (error) throw error
  const linhas = (data as typeof data | null) ?? []
  return linhas.map((linha) => ({
    empreendimentoId: linha.empreendimento_id,
    empreendimentoNome: linha.empreendimento_nome,
    clienteNome: linha.cliente_nome,
    instrumentoId: linha.instrumento_id,
    licenca: linha.licenca,
    motivo: lerMotivo(linha.motivo),
    vistoEm: linha.visto_em,
  }))
}

/** Marca como vistos os avisos da mudança nesta consultoria; devolve quantos mudaram. */
export async function marcarMudancaVista(
  consultoriaId: string,
  mudancaId: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('marcar_mudanca_de_norma_vista', {
    p_consultoria_id: consultoriaId,
    p_mudanca_id: mudancaId,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}
