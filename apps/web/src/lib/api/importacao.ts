// Importar planilha (ADR-0043). Escrita só pelas RPCs (só a Gestão; o banco recusa a Equipe);
// leitura pela RLS de Gestão. O arquivo nunca sobe: só os dados normalizados, sem CPF.

import {
  TAMANHO_DO_LOTE,
  type CampoDaImportacao,
  type DadosDaLinha,
  type EntidadeDaImportacao,
  type GrupoDaLinha,
  type MapeamentoDeColunas,
  type ProblemaDaLinha,
} from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_IMPORTACOES = 20
export const TAMANHO_PAGINA_LINHAS = 50

export type SituacaoDaImportacao = 'em_conferencia' | 'efetivada' | 'desfeita'
export type ResultadoDaLinha = 'criada' | 'pulada' | 'com_erro' | 'desfeita'
export type MotivoMantida = 'alterada_depois' | 'tem_dependentes' | 'renovacao_em_andamento'

export interface ResumoDaConferencia {
  rowVersion: number
  total: number
  prontas: number
  comAviso: number
  comErro: number
  puladas: number
  aCriar: { empreendimentos: number; unidades: number; licencas: number }
  limite: {
    quantidade: number
    limite: number | null
    precisaConfirmar: boolean
    adicionaisCentavos: number
  }
}

export interface ResultadoDaEfetivacao {
  rowVersion: number
  linhasCriadas: number
  linhasPuladas: number
  linhasComErro: number
  empreendimentosCriados: number
  unidadesCriadas: number
  licencasCriadas: number
  desfazerAte: string
}

export interface ResultadoDoDesfazer {
  rowVersion: number
  linhasDesfeitas: number
  linhasMantidas: number
  empreendimentosDesfeitos: number
  unidadesDesfeitas: number
  licencasDesfeitas: number
  mantidas: { numeroLinha: number; motivo: MotivoMantida }[]
}

export interface ImportacaoNaLista {
  id: string
  entidade: EntidadeDaImportacao
  nomeArquivo: string
  totalLinhas: number
  situacao: SituacaoDaImportacao
  criadoEm: string
  efetivadaEm: string | null
}

export interface Importacao extends ImportacaoNaLista {
  rowVersion: number
  resumo: ResumoDaConferencia | null
  resultado: ResultadoDaEfetivacao | null
  resultadoDesfazer: ResultadoDoDesfazer | null
}

export interface LinhaDaImportacao {
  numeroLinha: number
  dados: DadosDaLinha
  erros: ProblemaDaLinha[]
  avisos: ProblemaDaLinha[]
  grupo: GrupoDaLinha
  resultado: ResultadoDaLinha | null
  motivoMantida: MotivoMantida | null
  empreendimentoId: string | null
  instrumentoId: string | null
}

// ---------------------------------------------------------------------------
// Leitura do JSON que o banco devolve (snake_case) para o formato da tela
// ---------------------------------------------------------------------------

type Objeto = Record<string, unknown>

function objeto(valor: unknown): Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Objeto)
    : {}
}

function inteiro(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null
}

export function lerResumo(json: unknown): ResumoDaConferencia {
  const r = objeto(json)
  const aCriar = objeto(r.a_criar)
  const limite = objeto(r.limite)
  return {
    rowVersion: inteiro(r.row_version),
    total: inteiro(r.total),
    prontas: inteiro(r.prontas),
    comAviso: inteiro(r.com_aviso),
    comErro: inteiro(r.com_erro),
    puladas: inteiro(r.puladas),
    aCriar: {
      empreendimentos: inteiro(aCriar.empreendimentos),
      unidades: inteiro(aCriar.unidades),
      licencas: inteiro(aCriar.licencas),
    },
    limite: {
      quantidade: inteiro(limite.quantidade),
      limite: typeof limite.limite === 'number' ? limite.limite : null,
      precisaConfirmar: limite.precisa_confirmar === true,
      adicionaisCentavos: inteiro(limite.adicionais_centavos),
    },
  }
}

export function lerResultadoDaEfetivacao(json: unknown): ResultadoDaEfetivacao {
  const r = objeto(json)
  return {
    rowVersion: inteiro(r.row_version),
    linhasCriadas: inteiro(r.linhas_criadas),
    linhasPuladas: inteiro(r.linhas_puladas),
    linhasComErro: inteiro(r.linhas_com_erro),
    empreendimentosCriados: inteiro(r.empreendimentos_criados),
    unidadesCriadas: inteiro(r.unidades_criadas),
    licencasCriadas: inteiro(r.licencas_criadas),
    desfazerAte: textoOuNulo(r.desfazer_ate) ?? '',
  }
}

const MOTIVOS: readonly MotivoMantida[] = [
  'alterada_depois',
  'tem_dependentes',
  'renovacao_em_andamento',
]

function motivo(valor: unknown): MotivoMantida | null {
  return MOTIVOS.find((m) => m === valor) ?? null
}

export function lerResultadoDoDesfazer(json: unknown): ResultadoDoDesfazer {
  const r = objeto(json)
  const mantidas = Array.isArray(r.mantidas) ? r.mantidas : []
  return {
    rowVersion: inteiro(r.row_version),
    linhasDesfeitas: inteiro(r.linhas_desfeitas),
    linhasMantidas: inteiro(r.linhas_mantidas),
    empreendimentosDesfeitos: inteiro(r.empreendimentos_desfeitos),
    unidadesDesfeitas: inteiro(r.unidades_desfeitas),
    licencasDesfeitas: inteiro(r.licencas_desfeitas),
    mantidas: mantidas.flatMap((m) => {
      const item = objeto(m)
      const qual = motivo(item.motivo)
      return qual ? [{ numeroLinha: inteiro(item.numero_linha), motivo: qual }] : []
    }),
  }
}

function lerProblemas(json: unknown): ProblemaDaLinha[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((p) => {
    const item = objeto(p)
    return typeof item.codigo === 'string'
      ? [
          {
            codigo: item.codigo as ProblemaDaLinha['codigo'],
            campo: textoOuNulo(item.campo) as ProblemaDaLinha['campo'],
          },
        ]
      : []
  })
}

function lerDados(json: unknown): DadosDaLinha {
  const d = objeto(json)
  const t = (chave: string) => textoOuNulo(d[chave])
  return {
    empreendimento: t('empreendimento'),
    cliente: t('cliente'),
    cnpj: t('cnpj'),
    unidade: t('unidade'),
    endereco: t('endereco'),
    tipo: t('tipo'),
    numero: t('numero'),
    orgao: t('orgao'),
    emitido_em: t('emitido_em') as DadosDaLinha['emitido_em'],
    emitido_em_texto: t('emitido_em_texto'),
    validade: t('validade') as DadosDaLinha['validade'],
    validade_texto: t('validade_texto'),
    descartados: (Array.isArray(d.descartados) ? d.descartados : []).filter(
      (c): c is DadosDaLinha['descartados'][number] => typeof c === 'string',
    ),
  }
}

function entidade(valor: string): EntidadeDaImportacao {
  return valor === 'licenca' ? 'licenca' : 'empreendimento'
}

function situacao(valor: string): SituacaoDaImportacao {
  return valor === 'efetivada' || valor === 'desfeita' ? valor : 'em_conferencia'
}

function grupo(valor: string | null): GrupoDaLinha {
  return valor === 'erro' || valor === 'aviso' ? valor : 'pronta'
}

function resultadoDaLinha(valor: string | null): ResultadoDaLinha | null {
  return valor === 'criada' || valor === 'pulada' || valor === 'com_erro' || valor === 'desfeita'
    ? valor
    : null
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

/** Cria a importação e guarda o mapeamento como o último usado. Idempotente pelo id. */
export async function criarImportacao(e: {
  id: string
  consultoriaId: string
  entidade: EntidadeDaImportacao
  nomeArquivo: string
  totalLinhas: number
  mapeamento: MapeamentoDeColunas
}): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_importacao', {
    p_id: e.id,
    p_consultoria_id: e.consultoriaId,
    p_entidade: e.entidade,
    p_nome_arquivo: e.nomeArquivo,
    p_total_linhas: e.totalLinhas,
    p_mapeamento: e.mapeamento as Json,
  })
  if (error) throw error
  return data
}

/** Um lote (até 200 linhas). Devolve quantas linhas a importação já recebeu. */
export async function enviarLinhasDaImportacao(
  importacaoId: string,
  linhas: readonly { numeroLinha: number; dados: DadosDaLinha }[],
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('enviar_linhas_da_importacao', {
    p_importacao_id: importacaoId,
    p_linhas: linhas.map((l) => ({
      numero_linha: l.numeroLinha,
      dados: l.dados,
    })) as unknown as Json,
  })
  if (error) throw error
  return data
}

/** Todas as linhas, em lotes de TAMANHO_DO_LOTE, um depois do outro. */
export async function enviarTodasAsLinhas(
  importacaoId: string,
  linhas: readonly { numeroLinha: number; dados: DadosDaLinha }[],
  aoProgredir?: (enviadas: number) => void,
): Promise<void> {
  for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_DO_LOTE) {
    const lote = linhas.slice(inicio, inicio + TAMANHO_DO_LOTE)
    await enviarLinhasDaImportacao(importacaoId, lote)
    aoProgredir?.(inicio + lote.length)
  }
}

export async function conferirImportacao(importacaoId: string): Promise<ResumoDaConferencia> {
  const { data, error } = await obterSupabase().rpc('conferir_importacao', {
    p_importacao_id: importacaoId,
  })
  if (error) throw error
  return lerResumo(data)
}

export async function efetivarImportacao(
  importacaoId: string,
  rowVersion: number,
  confirmarAdicional: boolean,
): Promise<ResultadoDaEfetivacao> {
  const { data, error } = await obterSupabase().rpc('efetivar_importacao', {
    p_importacao_id: importacaoId,
    p_row_version: rowVersion,
    p_confirmar_adicional: confirmarAdicional,
  })
  if (error) throw error
  return lerResultadoDaEfetivacao(data)
}

export async function desfazerImportacao(
  importacaoId: string,
  rowVersion: number,
): Promise<ResultadoDoDesfazer> {
  const { data, error } = await obterSupabase().rpc('desfazer_importacao', {
    p_importacao_id: importacaoId,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return lerResultadoDoDesfazer(data)
}

// ---------------------------------------------------------------------------
// Leituras (RLS: só a Gestão da consultoria)
// ---------------------------------------------------------------------------

const COLUNAS_NA_LISTA =
  'id, entidade, nome_arquivo, total_linhas, situacao, criado_em, efetivada_em'

export async function listarImportacoes(
  consultoriaId: string,
  pagina: number,
): Promise<{ itens: ImportacaoNaLista[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA_IMPORTACOES
  const { data, error, count } = await obterSupabase()
    .from('importacao')
    .select(COLUNAS_NA_LISTA, { count: 'exact' })
    .eq('consultoria_id', consultoriaId)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA_IMPORTACOES - 1)
  if (error) throw error
  return {
    itens: data.map((i) => ({
      id: i.id,
      entidade: entidade(i.entidade),
      nomeArquivo: i.nome_arquivo,
      totalLinhas: i.total_linhas,
      situacao: situacao(i.situacao),
      criadoEm: i.criado_em,
      efetivadaEm: i.efetivada_em,
    })),
    total: count ?? data.length,
  }
}

/** `null` quando não existe ou é de outra consultoria (a RLS devolve zero linhas). */
export async function obterImportacao(id: string): Promise<Importacao | null> {
  const { data, error } = await obterSupabase()
    .from('importacao')
    .select(`${COLUNAS_NA_LISTA}, row_version, resumo, resultado, resultado_desfazer`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    entidade: entidade(data.entidade),
    nomeArquivo: data.nome_arquivo,
    totalLinhas: data.total_linhas,
    situacao: situacao(data.situacao),
    criadoEm: data.criado_em,
    efetivadaEm: data.efetivada_em,
    rowVersion: data.row_version,
    resumo: data.resumo === null ? null : lerResumo(data.resumo),
    resultado: data.resultado === null ? null : lerResultadoDaEfetivacao(data.resultado),
    resultadoDesfazer:
      data.resultado_desfazer === null ? null : lerResultadoDoDesfazer(data.resultado_desfazer),
  }
}

const COLUNAS_DA_LINHA =
  'numero_linha, dados, erros, avisos, grupo, resultado, motivo_mantida, empreendimento_id, instrumento_id'

function lerLinha(l: {
  numero_linha: number
  dados: Json
  erros: Json
  avisos: Json
  grupo: string | null
  resultado: string | null
  motivo_mantida: string | null
  empreendimento_id: string | null
  instrumento_id: string | null
}): LinhaDaImportacao {
  return {
    numeroLinha: l.numero_linha,
    dados: lerDados(l.dados),
    erros: lerProblemas(l.erros),
    avisos: lerProblemas(l.avisos),
    grupo: grupo(l.grupo),
    resultado: resultadoDaLinha(l.resultado),
    motivoMantida: motivo(l.motivo_mantida),
    empreendimentoId: l.empreendimento_id,
    instrumentoId: l.instrumento_id,
  }
}

export async function listarLinhasDaImportacao(
  importacaoId: string,
  grupoDaLinha: GrupoDaLinha,
  pagina: number,
): Promise<{ itens: LinhaDaImportacao[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA_LINHAS
  const { data, error, count } = await obterSupabase()
    .from('importacao_linha')
    .select(COLUNAS_DA_LINHA, { count: 'exact' })
    .eq('importacao_id', importacaoId)
    .eq('grupo', grupoDaLinha)
    .order('numero_linha', { ascending: true })
    .range(inicio, inicio + TAMANHO_PAGINA_LINHAS - 1)
  if (error) throw error
  return { itens: data.map(lerLinha), total: count ?? data.length }
}

/** Linhas com erro (até o limite de linhas da importação), para "Baixar erros (.csv)". */
export async function listarLinhasComErro(importacaoId: string): Promise<LinhaDaImportacao[]> {
  const { data, error } = await obterSupabase()
    .from('importacao_linha')
    .select(COLUNAS_DA_LINHA)
    .eq('importacao_id', importacaoId)
    .eq('grupo', 'erro')
    .order('numero_linha', { ascending: true })
    .range(0, 999)
  if (error) throw error
  return data.map(lerLinha)
}

/** Linhas com um resultado (efetivada ou desfeita), para a tela do resultado. */
export async function listarLinhasPorResultado(
  importacaoId: string,
  resultado: ResultadoDaLinha,
  pagina: number,
): Promise<{ itens: LinhaDaImportacao[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA_LINHAS
  const { data, error, count } = await obterSupabase()
    .from('importacao_linha')
    .select(COLUNAS_DA_LINHA, { count: 'exact' })
    .eq('importacao_id', importacaoId)
    .eq('resultado', resultado)
    .order('numero_linha', { ascending: true })
    .range(inicio, inicio + TAMANHO_PAGINA_LINHAS - 1)
  if (error) throw error
  return { itens: data.map(lerLinha), total: count ?? data.length }
}

/** Último mapeamento de colunas que a consultoria usou nesta entidade. */
export async function obterMapeamentoLembrado(
  consultoriaId: string,
  entidadeDaImportacao: EntidadeDaImportacao,
): Promise<MapeamentoDeColunas | null> {
  const { data, error } = await obterSupabase()
    .from('importacao_mapeamento')
    .select('mapeamento')
    .eq('consultoria_id', consultoriaId)
    .eq('entidade', entidadeDaImportacao)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const mapa = objeto(data.mapeamento)
  const lembrado: MapeamentoDeColunas = {}
  for (const [campo, cabecalho] of Object.entries(mapa)) {
    if (typeof cabecalho === 'string') lembrado[campo as CampoDaImportacao] = cabecalho
  }
  return lembrado
}
