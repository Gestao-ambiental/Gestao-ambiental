// Acesso a dados do épico 4 (cadastro de licença). Escrita só por RPC; leitura pela RLS de membro
// ativo. O PDF vai direto para o Storage (política por consultoria) e vira versão pela RPC, que
// confere caminho, MIME e tamanho no próprio Storage.

import type { DataCivil, LicencaResumo, Recorrencia, UnidadeCiclo } from '@gestao-ambiental/domain'

import type { Database } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

type Enums = Database['public']['Enums']
export type Marco = Enums['marco_instrumento']
export type Natureza = Enums['natureza_condicionante']
export type Revisao = Enums['revisao_condicionante']

export const TAMANHO_MAXIMO_PDF = 25 * 1024 * 1024

/**
 * O gerador de tipos do Supabase marca todo argumento de RPC como não nulo, mas o banco aceita
 * nulo (campo ainda vazio no rascunho, "sem responsável"). Só aqui a tipagem é contornada.
 */
function aceitaNulo<T>(valor: T | null): T {
  return valor as unknown as T
}
export const TAMANHO_PAGINA_LICENCAS = 50

// ---------------------------------------------------------------------------
// Tipos de instrumento
// ---------------------------------------------------------------------------

export interface TipoInstrumento {
  id: string
  sigla: string
  nome: string
}

export async function listarTipos(consultoriaId: string): Promise<TipoInstrumento[]> {
  const { data, error } = await obterSupabase()
    .from('tipo_instrumento')
    .select('id, sigla, nome')
    .eq('consultoria_id', consultoriaId)
    .order('sigla')
    .range(0, 199)
  if (error) throw error
  return data
}

export async function criarTipo(
  consultoriaId: string,
  sigla: string,
  nome: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_tipo_instrumento', {
    p_consultoria_id: consultoriaId,
    p_sigla: sigla,
    p_nome: nome,
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Rascunho e PDF
// ---------------------------------------------------------------------------

export async function criarInstrumento(id: string, unidadeId: string): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_instrumento', {
    p_id: id,
    p_unidade_id: unidadeId,
  })
  if (error) throw error
  return data
}

export type ProblemaDoPdf = 'nao_pdf' | 'grande_demais' | 'vazio'

/** Confere extensão/MIME, a assinatura "%PDF-" no começo do arquivo e o tamanho (até 25 MiB). */
export async function conferirPdf(arquivo: File): Promise<ProblemaDoPdf | null> {
  if (arquivo.size === 0) return 'vazio'
  if (arquivo.size > TAMANHO_MAXIMO_PDF) return 'grande_demais'
  const inicio = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer())
  const assinatura = String.fromCharCode(...inicio)
  return assinatura === '%PDF-' ? null : 'nao_pdf'
}

async function sha256(arquivo: File): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Envia o PDF como objeto novo (nunca sobrescreve) em consultoria_id/instrumento/<uuid>.pdf e o
 * registra como versão vigente do documento da licença.
 */
export async function enviarPdf(
  instrumentoId: string,
  consultoriaId: string,
  arquivo: File,
): Promise<void> {
  const supabase = obterSupabase()
  const versaoId = crypto.randomUUID()
  const caminho = `${consultoriaId}/instrumento/${versaoId}.pdf`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false })
  if (envio.error) throw envio.error
  const { error } = await supabase.rpc('registrar_pdf_instrumento', {
    p_instrumento_id: instrumentoId,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
  })
  if (error) throw error
}

/** URL assinada de 5 minutos, emitida depois da política de Storage conferir o vínculo. */
export async function urlDoPdf(caminho: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrl(caminho, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Instrumento (rascunho)
// ---------------------------------------------------------------------------

export interface Instrumento {
  id: string
  situacao: 'rascunho' | 'ativo'
  rowVersion: number
  numero: string | null
  orgao: string | null
  tipoId: string | null
  tipoSigla: string | null
  unidadeId: string
  unidadeNome: string
  empreendimentoId: string
  empreendimentoNome: string
  emitidoEm: DataCivil | null
  assinadoEm: DataCivil | null
  publicadoEm: DataCivil | null
  recebidoEm: DataCivil | null
  marco: Marco | null
  validade: DataCivil | null
  antecedencia: number
  pdf: { caminho: string; nome: string } | null
}

export async function obterInstrumento(id: string): Promise<Instrumento | null> {
  const { data, error } = await obterSupabase()
    .from('instrumento')
    .select(
      `id, situacao, row_version, numero, orgao, tipo_id, unidade_id, empreendimento_id,
       emitido_em, assinado_em, publicado_em, recebido_em, marco, validade, antecedencia_renovacao_dias,
       tipo:tipo_instrumento!instrumento_tipo_fk(sigla),
       unidade:unidade!instrumento_unidade_fk(nome, empreendimento:empreendimento!unidade_empreendimento_fk(nome)),
       documento:documento!instrumento_documento_fk(versao:documento_versao!documento_versao_vigente_fk(caminho, nome_original))`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const versao = data.documento?.versao
  return {
    id: data.id,
    situacao: data.situacao,
    rowVersion: data.row_version,
    numero: data.numero,
    orgao: data.orgao,
    tipoId: data.tipo_id,
    tipoSigla: data.tipo?.sigla ?? null,
    unidadeId: data.unidade_id,
    unidadeNome: data.unidade.nome,
    empreendimentoId: data.empreendimento_id,
    empreendimentoNome: data.unidade.empreendimento.nome,
    emitidoEm: data.emitido_em as DataCivil | null,
    assinadoEm: data.assinado_em as DataCivil | null,
    publicadoEm: data.publicado_em as DataCivil | null,
    recebidoEm: data.recebido_em as DataCivil | null,
    marco: data.marco,
    validade: data.validade as DataCivil | null,
    antecedencia: data.antecedencia_renovacao_dias,
    pdf: versao ? { caminho: versao.caminho, nome: versao.nome_original } : null,
  }
}

export interface DadosIdentificacao {
  unidadeId: string
  tipoId: string | null
  numero: string
  orgao: string
  emitidoEm: DataCivil | null
  assinadoEm: DataCivil | null
  publicadoEm: DataCivil | null
  recebidoEm: DataCivil | null
  marco: Marco | null
  validade: DataCivil | null
}

/** Salva com controle otimista; devolve a nova row_version. */
export async function salvarIdentificacao(
  id: string,
  rowVersion: number,
  dados: DadosIdentificacao,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_identificacao', {
    p_id: id,
    p_row_version: rowVersion,
    p_unidade_id: dados.unidadeId,
    p_tipo_id: aceitaNulo(dados.tipoId),
    p_numero: dados.numero,
    p_orgao: dados.orgao,
    p_emitido_em: aceitaNulo(dados.emitidoEm),
    p_assinado_em: aceitaNulo(dados.assinadoEm),
    p_publicado_em: aceitaNulo(dados.publicadoEm),
    p_recebido_em: aceitaNulo(dados.recebidoEm),
    p_marco: aceitaNulo(dados.marco),
    p_validade: aceitaNulo(dados.validade),
  })
  if (error) throw error
  return data
}

/** Órgãos já usados pela consultoria, para sugerir no campo (texto livre). */
export async function listarOrgaos(consultoriaId: string): Promise<string[]> {
  const { data, error } = await obterSupabase()
    .from('instrumento')
    .select('orgao')
    .eq('consultoria_id', consultoriaId)
    .not('orgao', 'is', null)
    .range(0, 499)
  if (error) throw error
  return [
    ...new Set(data.map((linha) => linha.orgao).filter((o): o is string => Boolean(o))),
  ].sort()
}

// ---------------------------------------------------------------------------
// Condicionantes e prazos
// ---------------------------------------------------------------------------

export interface Condicionante {
  id: string
  paiId: string | null
  codigo: string
  posicao: number
  revisao: Revisao
  responsavelId: string | null
  titulo: string
  textoLiteral: string
  natureza: Natureza
  recorrencia: Recorrencia | null
  unidade: UnidadeCiclo | null
  intervalo: number | null
  dataReferencia: DataCivil | null
  primeiraData: DataCivil | null
  fonteRegra: string | null
  confirmadoEm: string | null
  confirmadoPor: string | null
  /** Proposta pela IA (épico 9) ou cadastrada à mão. */
  origem: 'manual' | 'ia'
  /** Página do PDF onde a IA achou o item. */
  fontePagina: number | null
  /** Periodicidade como a IA leu no texto: só apoio, o prazo é confirmado no passo 4. */
  periodicidadeIa: string | null
}

function periodicidadeDa(proposta: unknown): string | null {
  if (typeof proposta !== 'object' || proposta === null) return null
  const valor = (proposta as { periodicidade?: unknown }).periodicidade
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

export async function listarCondicionantes(instrumentoId: string): Promise<Condicionante[]> {
  const { data, error } = await obterSupabase()
    .from('condicionante')
    .select(
      `id, pai_id, codigo, posicao, revisao, responsavel_id, origem, fonte_pagina, proposta_ia,
       versao:condicionante_versao!condicionante_versao_vigente_fk(
         titulo, texto_literal, natureza, recorrencia, unidade_ciclo, intervalo_ciclo,
         data_referencia, primeira_data, fonte_regra, prazo_confirmado_em,
         confirmador:membro!condicionante_versao_confirmado_por_fk(nome)
       )`,
    )
    .eq('instrumento_id', instrumentoId)
    .order('posicao')
    .range(0, 499)
  if (error) throw error
  return data.flatMap((linha) => {
    const v = linha.versao
    if (!v) return []
    return [
      {
        id: linha.id,
        paiId: linha.pai_id,
        codigo: linha.codigo,
        posicao: linha.posicao,
        revisao: linha.revisao,
        responsavelId: linha.responsavel_id,
        titulo: v.titulo,
        textoLiteral: v.texto_literal,
        natureza: v.natureza,
        recorrencia: v.recorrencia,
        unidade: v.unidade_ciclo,
        intervalo: v.intervalo_ciclo,
        dataReferencia: v.data_referencia as DataCivil | null,
        primeiraData: v.primeira_data as DataCivil | null,
        fonteRegra: v.fonte_regra,
        confirmadoEm: v.prazo_confirmado_em,
        confirmadoPor: v.confirmador?.nome ?? null,
        origem: linha.origem === 'ia' ? 'ia' : 'manual',
        fontePagina: linha.fonte_pagina,
        periodicidadeIa: periodicidadeDa(linha.proposta_ia),
      },
    ]
  })
}

export interface DadosCondicionante {
  paiId: string | null
  codigo: string
  titulo: string
  textoLiteral: string
  natureza: Natureza
}

export async function salvarCondicionante(
  id: string,
  instrumentoId: string,
  dados: DadosCondicionante,
): Promise<void> {
  const { error } = await obterSupabase().rpc('salvar_condicionante', {
    p_id: id,
    p_instrumento_id: instrumentoId,
    p_pai_id: aceitaNulo(dados.paiId),
    p_codigo: dados.codigo,
    p_titulo: dados.titulo,
    p_texto_literal: dados.textoLiteral,
    p_natureza: dados.natureza,
  })
  if (error) throw error
}

export async function revisarCondicionante(id: string, revisao: 'aceita' | 'descartada') {
  const { error } = await obterSupabase().rpc('revisar_condicionante', {
    p_id: id,
    p_revisao: revisao,
  })
  if (error) throw error
}

export interface DadosPrazo {
  recorrencia: Recorrencia
  unidade: UnidadeCiclo | null
  intervalo: number | null
  dataReferencia: DataCivil | null
  primeiraData: DataCivil | null
  fonteRegra: string
}

export async function confirmarPrazo(condicionanteId: string, dados: DadosPrazo): Promise<void> {
  const { error } = await obterSupabase().rpc('confirmar_prazo', {
    p_condicionante_id: condicionanteId,
    p_recorrencia: dados.recorrencia,
    p_unidade: aceitaNulo(dados.unidade),
    p_intervalo: aceitaNulo(dados.intervalo),
    p_contagem: 'corridos',
    p_data_referencia: aceitaNulo(dados.dataReferencia),
    p_primeira_data: aceitaNulo(dados.primeiraData),
    p_fonte_regra: dados.fonteRegra,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Responsáveis e ativação
// ---------------------------------------------------------------------------

export interface MembroAtivo {
  id: string
  nome: string
}

export async function listarMembrosAtivos(consultoriaId: string): Promise<MembroAtivo[]> {
  const { data, error } = await obterSupabase()
    .from('membro')
    .select('id, nome')
    .eq('consultoria_id', consultoriaId)
    .eq('situacao', 'ativo')
    .order('nome')
    .range(0, 199)
  if (error) throw error
  return data
}

export async function definirResponsavel(condicionanteId: string, membroId: string | null) {
  const { error } = await obterSupabase().rpc('definir_responsavel', {
    p_condicionante_id: condicionanteId,
    p_membro_id: aceitaNulo(membroId),
  })
  if (error) throw error
}

export async function atribuirATodos(instrumentoId: string, membroId: string) {
  const { error } = await obterSupabase().rpc('atribuir_a_todos', {
    p_instrumento_id: instrumentoId,
    p_membro_id: membroId,
  })
  if (error) throw error
}

/** Ativa e devolve o total de ocorrências. Repetir com a mesma chave devolve o mesmo total. */
export async function ativarPlano(
  instrumentoId: string,
  rowVersion: number,
  chave: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('ativar_plano', {
    p_instrumento_id: instrumentoId,
    p_row_version: rowVersion,
    p_chave: chave,
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Licenças do empreendimento (tela do empreendimento, EMP-02)
// ---------------------------------------------------------------------------

export interface LicencaNaLista extends LicencaResumo {
  id: string
  numero: string | null
  orgao: string | null
  tipoNome: string | null
  unidadeId: string
  unidadeNome: string
  condicionantes: number
  criadoEm: string
}

function planoDa<T>(valor: T[] | T | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor
}

export async function listarLicencasDoEmpreendimento(
  empreendimentoId: string,
  pagina: number,
): Promise<{ itens: LicencaNaLista[]; total: number }> {
  const inicio = pagina * TAMANHO_PAGINA_LICENCAS
  const { data, error, count } = await obterSupabase()
    .from('instrumento')
    .select(
      `id, numero, orgao, situacao, validade, criado_em, antecedencia_renovacao_dias, unidade_id,
       tipo:tipo_instrumento!instrumento_tipo_fk(sigla, nome),
       unidade:unidade!instrumento_unidade_fk(nome),
       plano:plano_renovacao!plano_renovacao_instrumento_fk(antecedencia_dias, dias_limite_protocolo, protocolado_em),
       condicionante(count)`,
      { count: 'exact' },
    )
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA_LICENCAS - 1)
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      numero: linha.numero,
      orgao: linha.orgao,
      situacao: linha.situacao,
      validade: linha.validade as DataCivil | null,
      sigla: linha.tipo?.sigla ?? null,
      // Um plano por LAO (instrumento_id único): o PostgREST devolve objeto; os tipos dizem lista.
      antecedencia: planoDa(linha.plano)?.antecedencia_dias ?? linha.antecedencia_renovacao_dias,
      diasLimite: planoDa(linha.plano)?.dias_limite_protocolo ?? null,
      protocoladoEm: (planoDa(linha.plano)?.protocolado_em ?? null) as DataCivil | null,
      tipoNome: linha.tipo?.nome ?? null,
      unidadeId: linha.unidade_id,
      unidadeNome: linha.unidade.nome,
      condicionantes: linha.condicionante[0]?.count ?? 0,
      criadoEm: linha.criado_em,
    })),
    total: count ?? data.length,
  }
}
