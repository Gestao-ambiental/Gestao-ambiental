// Outros vencimentos (ADR-0046): alvará, ART, CTF IBAMA, outorga, AVCB, certidão. Leitura pela RLS
// (qualquer membro); escrita só pelas RPCs, da Gestão. Renovar cria um vencimento novo ligado ao
// anterior: o anterior continua guardado, com o PDF, e deixa de gerar prazo.

import { idsRenovados, type DataCivil } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Tipos de vencimento (Configurações › Vencimentos)
// ---------------------------------------------------------------------------

export interface TipoDeVencimento {
  id: string
  nome: string
  antecedenciaDias: number
  exigePdf: boolean
  ativo: boolean
}

export interface DadosDoTipoDeVencimento {
  nome: string
  antecedenciaDias: number
  exigePdf: boolean
}

/** Tipos da consultoria (ativos e desativados), por nome. */
export async function listarTiposDeVencimento(consultoriaId: string): Promise<TipoDeVencimento[]> {
  const { data, error } = await obterSupabase()
    .from('tipo_vencimento')
    .select('id, nome, antecedencia_dias, exige_pdf, ativo')
    .eq('consultoria_id', consultoriaId)
    .order('nome_normalizado')
    .range(0, 199)
  if (error) throw error
  return data.map((t) => ({
    id: t.id,
    nome: t.nome,
    antecedenciaDias: t.antecedencia_dias,
    exigePdf: t.exige_pdf,
    ativo: t.ativo,
  }))
}

/** Nome repetido de um tipo ativo devolve o existente (o banco decide). */
export async function criarTipoDeVencimento(
  consultoriaId: string,
  dados: DadosDoTipoDeVencimento,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_tipo_vencimento', {
    p_consultoria_id: consultoriaId,
    p_nome: dados.nome,
    p_antecedencia_dias: dados.antecedenciaDias,
    p_exige_pdf: dados.exigePdf,
  })
  if (error) throw error
  return data
}

export async function editarTipoDeVencimento(
  tipoId: string,
  dados: DadosDoTipoDeVencimento & { ativo: boolean },
): Promise<void> {
  const { error } = await obterSupabase().rpc('editar_tipo_vencimento', {
    p_tipo_id: tipoId,
    p_nome: dados.nome,
    p_antecedencia_dias: dados.antecedenciaDias,
    p_exige_pdf: dados.exigePdf,
    p_ativo: dados.ativo,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Vencimentos do empreendimento
// ---------------------------------------------------------------------------

export interface Vencimento {
  id: string
  rowVersion: number
  tipoId: string
  tipoNome: string
  unidadeId: string | null
  unidadeNome: string | null
  instrumentoId: string | null
  /** Licença ligada, como "LAO 1234/2024". */
  licenca: string | null
  numero: string | null
  orgao: string | null
  notas: string | null
  emitidoEm: DataCivil | null
  emitidoTexto: string | null
  validoAte: DataCivil
  validadeTexto: string | null
  antecedenciaDias: number
  responsavelTecnicoId: string | null
  responsavelTecnicoNome: string | null
  anteriorId: string | null
  /** Já existe um vencimento novo ligado a este (renovação). */
  renovado: boolean
  pdf: { caminho: string; nome: string } | null
}

export interface DadosDoVencimento {
  tipoId: string
  unidadeId: string | null
  instrumentoId: string | null
  numero: string
  orgao: string
  notas: string
  emitidoEm: DataCivil | null
  emitidoTexto: string
  validoAte: DataCivil
  validadeTexto: string
  antecedenciaDias: number
  responsavelTecnicoId: string | null
}

/** PDF escolhido na tela; `versaoId` vem da tela, para repetir sem duplicar. */
export interface PdfNovo {
  versaoId: string
  arquivo: File
}

interface LinhaDeVencimento {
  id: string
  row_version: number
  tipo_vencimento_id: string
  unidade_id: string | null
  instrumento_id: string | null
  numero: string | null
  orgao: string | null
  notas: string | null
  emitido_em: string | null
  emitido_texto: string | null
  valido_ate: string
  validade_texto: string | null
  antecedencia_dias: number
  responsavel_tecnico_id: string | null
  anterior_id: string | null
  tipo: { nome: string } | null
  unidade: { nome: string } | null
  instrumento: { numero: string | null; tipo: { sigla: string } | null } | null
  responsavel_tecnico: { nome: string } | null
  documento: { versao: { caminho: string; nome_original: string } | null } | null
}

const COLUNAS = `id, row_version, tipo_vencimento_id, unidade_id, instrumento_id, numero, orgao, notas, emitido_em, emitido_texto,
  valido_ate, validade_texto, antecedencia_dias, responsavel_tecnico_id, anterior_id,
  tipo:tipo_vencimento!vencimento_tipo_fk(nome), unidade:unidade!vencimento_unidade_fk(nome),
  instrumento:instrumento!vencimento_instrumento_fk(numero, tipo:tipo_instrumento!instrumento_tipo_fk(sigla)),
  responsavel_tecnico:membro!vencimento_responsavel_tecnico_fk(nome),
  documento:documento!vencimento_documento_fk(versao:documento_versao!documento_versao_vigente_fk(caminho, nome_original))`

/** "LAO 1234/2024", só a sigla ou só o número; nulo quando não há nenhum dos dois. */
function rotuloDaLicenca(instrumento: LinhaDeVencimento['instrumento']): string | null {
  if (!instrumento) return null
  const texto = [instrumento.tipo?.sigla, instrumento.numero].filter(Boolean).join(' ')
  return texto || null
}

/** Vencimentos do empreendimento (não excluídos), da validade mais distante para a mais próxima. */
export async function listarVencimentosDoEmpreendimento(
  empreendimentoId: string,
): Promise<Vencimento[]> {
  const { data, error } = await obterSupabase()
    .from('vencimento')
    .select(COLUNAS)
    .eq('empreendimento_id', empreendimentoId)
    .is('excluido_em', null)
    .order('valido_ate', { ascending: false })
    .range(0, 199)
  if (error) throw error
  const linhas = data as unknown as LinhaDeVencimento[]
  const renovados = idsRenovados(linhas.map((l) => ({ id: l.id, anteriorId: l.anterior_id })))
  return linhas.map((l) => ({
    id: l.id,
    rowVersion: l.row_version,
    tipoId: l.tipo_vencimento_id,
    tipoNome: l.tipo?.nome ?? '',
    unidadeId: l.unidade_id,
    unidadeNome: l.unidade?.nome ?? null,
    instrumentoId: l.instrumento_id,
    licenca: rotuloDaLicenca(l.instrumento),
    numero: l.numero,
    orgao: l.orgao,
    notas: l.notas,
    emitidoEm: l.emitido_em as DataCivil | null,
    emitidoTexto: l.emitido_texto,
    validoAte: l.valido_ate as DataCivil,
    validadeTexto: l.validade_texto,
    antecedenciaDias: l.antecedencia_dias,
    responsavelTecnicoId: l.responsavel_tecnico_id,
    responsavelTecnicoNome: l.responsavel_tecnico?.nome ?? null,
    anteriorId: l.anterior_id,
    renovado: renovados.has(l.id),
    pdf: l.documento?.versao
      ? { caminho: l.documento.versao.caminho, nome: l.documento.versao.nome_original }
      : null,
  }))
}

export interface LicencaParaVencimento {
  id: string
  rotulo: string
}

/** Licenças do empreendimento, para ligar ao vencimento (opcional). */
export async function listarLicencasParaVencimento(
  empreendimentoId: string,
): Promise<LicencaParaVencimento[]> {
  const { data, error } = await obterSupabase()
    .from('instrumento')
    .select('id, numero, tipo:tipo_instrumento!instrumento_tipo_fk(sigla)')
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em', { ascending: false })
    .range(0, 199)
  if (error) throw error
  return data.map((l) => ({
    id: l.id,
    rotulo: rotuloDaLicenca({ numero: l.numero, tipo: l.tipo }) ?? 'Licença sem número',
  }))
}

interface PdfEnviado {
  p_versao_id: string
  p_caminho: string
  p_nome_original: string
  p_sha256: string
}

/**
 * Envia o PDF como objeto novo (nunca sobrescreve) em consultoria_id/vencimento/<uuid>.pdf. Objeto
 * já enviado numa tentativa anterior segue para o registro.
 */
async function enviarPdfDoVencimento(consultoriaId: string, pdf: PdfNovo): Promise<PdfEnviado> {
  const caminho = `${consultoriaId}/vencimento/${pdf.versaoId}.pdf`
  const hash = await sha256(pdf.arquivo)
  const envio = await obterSupabase()
    .storage.from('arquivos')
    .upload(caminho, pdf.arquivo, { contentType: 'application/pdf', upsert: false })
  if (envio.error && !envio.error.message.toLowerCase().includes('exists')) throw envio.error
  return {
    p_versao_id: pdf.versaoId,
    p_caminho: caminho,
    p_nome_original: pdf.arquivo.name,
    p_sha256: hash,
  }
}

const SEM_PDF = {
  p_versao_id: aceitaNulo<string>(null),
  p_caminho: aceitaNulo<string>(null),
  p_nome_original: aceitaNulo<string>(null),
  p_sha256: aceitaNulo<string>(null),
}

/** Texto vazio vai como nulo (o banco também faz isso, mas o argumento fica claro). */
function textoOuNulo(texto: string): string {
  return aceitaNulo(texto.trim() === '' ? null : texto.trim())
}

function argumentosComuns(dados: Omit<DadosDoVencimento, 'tipoId' | 'unidadeId'>) {
  return {
    p_valido_ate: dados.validoAte,
    p_instrumento_id: aceitaNulo(dados.instrumentoId),
    p_numero: textoOuNulo(dados.numero),
    p_orgao: textoOuNulo(dados.orgao),
    p_notas: textoOuNulo(dados.notas),
    p_emitido_em: aceitaNulo<string>(dados.emitidoEm),
    p_emitido_texto: textoOuNulo(dados.emitidoTexto),
    p_validade_texto: textoOuNulo(dados.validadeTexto),
    p_antecedencia_dias: dados.antecedenciaDias,
    p_responsavel_tecnico_id: aceitaNulo(dados.responsavelTecnicoId),
  }
}

/** Cadastro idempotente por `id` (gerado na tela): repetir depois de erro de rede não duplica. */
export async function cadastrarVencimento(
  consultoriaId: string,
  id: string,
  empreendimentoId: string,
  dados: DadosDoVencimento,
  pdf: PdfNovo | null,
): Promise<string> {
  const arquivo = pdf ? await enviarPdfDoVencimento(consultoriaId, pdf) : SEM_PDF
  const { data, error } = await obterSupabase().rpc('cadastrar_vencimento', {
    p_id: id,
    p_empreendimento_id: empreendimentoId,
    p_tipo_vencimento_id: dados.tipoId,
    p_unidade_id: aceitaNulo(dados.unidadeId),
    ...argumentosComuns(dados),
    ...arquivo,
  })
  if (error) throw error
  return data
}

/** Renovação: o novo herda empreendimento, unidade e tipo do anterior (o banco garante). */
export async function renovarVencimento(
  consultoriaId: string,
  id: string,
  anterior: Pick<Vencimento, 'id' | 'rowVersion'>,
  dados: Omit<DadosDoVencimento, 'tipoId' | 'unidadeId'>,
  pdf: PdfNovo | null,
): Promise<string> {
  const arquivo = pdf ? await enviarPdfDoVencimento(consultoriaId, pdf) : SEM_PDF
  const { data, error } = await obterSupabase().rpc('renovar_vencimento', {
    p_id: id,
    p_anterior_id: anterior.id,
    p_row_version_anterior: anterior.rowVersion,
    ...argumentosComuns(dados),
    ...arquivo,
  })
  if (error) throw error
  return data
}

/** Substitui todos os campos; devolve o row_version novo. */
export async function editarVencimento(
  vencimento: Pick<Vencimento, 'id' | 'rowVersion'>,
  dados: DadosDoVencimento,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_vencimento', {
    p_vencimento_id: vencimento.id,
    p_row_version: vencimento.rowVersion,
    p_tipo_vencimento_id: dados.tipoId,
    p_unidade_id: aceitaNulo(dados.unidadeId),
    ...argumentosComuns(dados),
  })
  if (error) throw error
  return data
}

/** Nova versão do PDF (o objeto antigo fica guardado). */
export async function trocarPdfDoVencimento(
  consultoriaId: string,
  vencimento: Pick<Vencimento, 'id'>,
  pdf: PdfNovo,
): Promise<string> {
  const arquivo = await enviarPdfDoVencimento(consultoriaId, pdf)
  const { data, error } = await obterSupabase().rpc('trocar_pdf_vencimento', {
    p_vencimento_id: vencimento.id,
    ...arquivo,
  })
  if (error) throw error
  return data
}

/** Exclusão lógica; o anterior (se houver) volta a ser o vigente. */
export async function excluirVencimento(
  vencimento: Pick<Vencimento, 'id' | 'rowVersion'>,
): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_vencimento', {
    p_vencimento_id: vencimento.id,
    p_row_version: vencimento.rowVersion,
  })
  if (error) throw error
}
