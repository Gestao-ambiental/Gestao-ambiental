// Exigências do órgão (ADR-0045). Leitura pela RLS (listar_exigencias e listar_respostas_da_exigencia
// são security invoker); escrita só pelas RPCs. A Gestão registra, edita, prorroga, atribui e exclui;
// a Equipe responde e anexa quando é a responsável. Quem decide é o banco.
//
// Os ids (exigência, resposta e versão do PDF) vêm da tela, gerados uma vez por diálogo: repetir
// depois de erro de rede devolve o mesmo registro, sem duplicar.

import type { DataCivil, SituacaoGravadaDaExigencia, UnidadePrazo } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import type { Pagina } from '@/lib/api/renovacoes'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_EXIGENCIAS = 25

export type FiltroSituacaoExigencia = 'abertas' | 'respondidas' | 'todas'

export interface Exigencia {
  id: string
  empreendimentoId: string
  empreendimentoNome: string
  unidadeId: string
  unidadeNome: string
  instrumentoId: string | null
  /** Sigla e número da licença ligada. */
  licenca: string | null
  licencaNumeroProcesso: string | null
  licencaRowVersion: number | null
  numeroProcesso: string | null
  numeroOficio: string | null
  orgao: string | null
  assunto: string
  notas: string | null
  recebidoEm: DataCivil
  recebidoEmTexto: string | null
  prazoDias: number | null
  prazoContagem: UnidadePrazo | null
  prazoOficialOriginal: DataCivil
  prazoOficial: DataCivil
  prazoOficialTexto: string | null
  metaInterna: DataCivil
  responsavelId: string | null
  responsavelNome: string | null
  situacao: SituacaoGravadaDaExigencia
  primeiraRespostaEm: DataCivil | null
  /** Linhas do histórico (respostas, anexos e prorrogações). */
  respostas: number
  oficio: { caminho: string; nome: string } | null
  criadoEm: string
  criadoPorNome: string | null
  rowVersion: number
  /** Hoje no fuso da consultoria (calculado no banco). */
  hoje: DataCivil
  /** prazoOficial − hoje. */
  dias: number
}

export type TipoDeResposta = 'resposta' | 'anexo' | 'prorrogacao'

export interface RespostaDaExigencia {
  id: string
  tipo: TipoDeResposta
  protocoloNumero: string | null
  protocoladoEm: DataCivil | null
  protocoladoEmTexto: string | null
  prazoAnterior: DataCivil | null
  prazoNovo: DataCivil | null
  prazoNovoTexto: string | null
  metaInternaAnterior: DataCivil | null
  metaInternaNova: DataCivil | null
  motivo: string | null
  descricao: string | null
  documento: { caminho: string; nome: string } | null
  registradoPor: string
  registradoPorNome: string | null
  registradoEm: string
}

export interface LicencaParaExigencia {
  id: string
  unidadeId: string
  rotulo: string
  orgao: string | null
  numeroProcesso: string | null
}

export type PrazoInformado =
  { modo: 'dias'; dias: number; contagem: UnidadePrazo } | { modo: 'data'; texto: string }

export interface DadosDaExigencia {
  unidadeId: string
  instrumentoId: string | null
  assunto: string
  numeroOficio: string
  orgao: string
  numeroProcesso: string
  notas: string
  recebidoEm: DataCivil
  /** O texto como foi digitado (o banco guarda o original da data). */
  recebidoEmTexto: string
  prazo: PrazoInformado
  prazoOficial: DataCivil
  metaInterna: DataCivil
  responsavelId: string | null
}

const SITUACOES: Record<FiltroSituacaoExigencia, string | null> = {
  abertas: 'abertas',
  respondidas: 'respondidas',
  todas: null,
}

// O gerador de tipos marca toda coluna de função como não nula; estas podem vir nulas.
interface LinhaDeExigencia {
  id: string
  empreendimento_id: string
  empreendimento_nome: string
  unidade_id: string
  unidade_nome: string
  instrumento_id: string | null
  licenca: string | null
  licenca_numero_processo: string | null
  licenca_row_version: number | null
  numero_processo: string | null
  numero_oficio: string | null
  orgao: string | null
  assunto: string
  notas: string | null
  recebido_em: string
  recebido_em_texto: string | null
  prazo_dias: number | null
  prazo_contagem: UnidadePrazo | null
  prazo_oficial_original: string
  prazo_oficial: string
  prazo_oficial_texto: string | null
  meta_interna: string
  responsavel_id: string | null
  responsavel_nome: string | null
  situacao: string
  primeira_resposta_em: string | null
  respostas: number
  oficio_caminho: string | null
  oficio_nome: string | null
  criado_em: string
  criado_por_nome: string | null
  row_version: number
  hoje: string
  dias: number
  total: number
}

function vazioViraNulo(texto: string | null): string | null {
  return texto === '' ? null : texto
}

function paraExigencia(l: LinhaDeExigencia): Exigencia {
  return {
    id: l.id,
    empreendimentoId: l.empreendimento_id,
    empreendimentoNome: l.empreendimento_nome,
    unidadeId: l.unidade_id,
    unidadeNome: l.unidade_nome,
    instrumentoId: l.instrumento_id,
    licenca: vazioViraNulo(l.licenca),
    licencaNumeroProcesso: l.licenca_numero_processo,
    licencaRowVersion: l.licenca_row_version,
    numeroProcesso: l.numero_processo,
    numeroOficio: l.numero_oficio,
    orgao: l.orgao,
    assunto: l.assunto,
    notas: l.notas,
    recebidoEm: l.recebido_em as DataCivil,
    recebidoEmTexto: l.recebido_em_texto,
    prazoDias: l.prazo_dias,
    prazoContagem: l.prazo_contagem,
    prazoOficialOriginal: l.prazo_oficial_original as DataCivil,
    prazoOficial: l.prazo_oficial as DataCivil,
    prazoOficialTexto: l.prazo_oficial_texto,
    metaInterna: l.meta_interna as DataCivil,
    responsavelId: l.responsavel_id,
    responsavelNome: l.responsavel_nome,
    situacao: l.situacao === 'respondida' ? 'respondida' : 'aberta',
    primeiraRespostaEm: l.primeira_resposta_em as DataCivil | null,
    respostas: l.respostas,
    oficio: l.oficio_caminho ? { caminho: l.oficio_caminho, nome: l.oficio_nome ?? '' } : null,
    criadoEm: l.criado_em,
    criadoPorNome: l.criado_por_nome,
    rowVersion: l.row_version,
    hoje: l.hoje as DataCivil,
    dias: l.dias,
  }
}

/** Exigências não excluídas: abertas primeiro pelo prazo, depois respondidas. Paginada. */
export async function listarExigencias(
  consultoriaId: string,
  o: {
    empreendimentoId?: string
    situacao?: FiltroSituacaoExigencia
    pagina?: number
    limite?: number
  } = {},
): Promise<Pagina<Exigencia>> {
  const limite = o.limite ?? TAMANHO_PAGINA_EXIGENCIAS
  const { data, error } = await obterSupabase().rpc('listar_exigencias', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: aceitaNulo(o.empreendimentoId ?? null),
    p_situacao: aceitaNulo(SITUACOES[o.situacao ?? 'todas']),
    p_limite: limite,
    p_deslocamento: (o.pagina ?? 0) * limite,
  })
  if (error) throw error
  const linhas = (data as unknown as LinhaDeExigencia[] | null) ?? []
  return { itens: linhas.map(paraExigencia), total: linhas[0]?.total ?? 0 }
}

/** `null` quando não existe, foi excluída ou é de outra consultoria (a RLS não distingue). */
export async function obterExigencia(
  consultoriaId: string,
  exigenciaId: string,
): Promise<Exigencia | null> {
  const { data, error } = await obterSupabase().rpc('listar_exigencias', {
    p_consultoria_id: consultoriaId,
    p_exigencia_id: exigenciaId,
    p_limite: 1,
  })
  if (error) throw error
  const [linha] = (data as unknown as LinhaDeExigencia[] | null) ?? []
  return linha ? paraExigencia(linha) : null
}

interface LinhaDeResposta {
  id: string
  tipo: string
  protocolo_numero: string | null
  protocolado_em: string | null
  protocolado_em_texto: string | null
  prazo_anterior: string | null
  prazo_novo: string | null
  prazo_novo_texto: string | null
  meta_interna_anterior: string | null
  meta_interna_nova: string | null
  motivo: string | null
  descricao: string | null
  documento_caminho: string | null
  documento_nome: string | null
  registrado_por: string
  registrado_por_nome: string | null
  registrado_em: string
}

function tipoDaResposta(tipo: string): TipoDeResposta {
  return tipo === 'anexo' || tipo === 'prorrogacao' ? tipo : 'resposta'
}

/** Histórico só de acréscimo, do mais antigo para o mais novo. */
export async function listarRespostasDaExigencia(
  exigenciaId: string,
): Promise<RespostaDaExigencia[]> {
  const { data, error } = await obterSupabase().rpc('listar_respostas_da_exigencia', {
    p_exigencia_id: exigenciaId,
  })
  if (error) throw error
  const linhas = (data as unknown as LinhaDeResposta[] | null) ?? []
  return linhas.map((l) => ({
    id: l.id,
    tipo: tipoDaResposta(l.tipo),
    protocoloNumero: l.protocolo_numero,
    protocoladoEm: l.protocolado_em as DataCivil | null,
    protocoladoEmTexto: l.protocolado_em_texto,
    prazoAnterior: l.prazo_anterior as DataCivil | null,
    prazoNovo: l.prazo_novo as DataCivil | null,
    prazoNovoTexto: l.prazo_novo_texto,
    metaInternaAnterior: l.meta_interna_anterior as DataCivil | null,
    metaInternaNova: l.meta_interna_nova as DataCivil | null,
    motivo: l.motivo,
    descricao: l.descricao,
    documento: l.documento_caminho
      ? { caminho: l.documento_caminho, nome: l.documento_nome ?? '' }
      : null,
    registradoPor: l.registrado_por,
    registradoPorNome: l.registrado_por_nome,
    registradoEm: l.registrado_em,
  }))
}

interface LinhaDeLicenca {
  id: string
  unidade_id: string
  numero: string | null
  orgao: string | null
  numero_processo: string | null
  tipo: { sigla: string } | null
}

/** Licenças do empreendimento (todas as unidades), para ligar à exigência. */
export async function listarLicencasParaExigencia(
  empreendimentoId: string,
): Promise<LicencaParaExigencia[]> {
  const { data, error } = await obterSupabase()
    .from('instrumento')
    .select(
      'id, unidade_id, numero, orgao, numero_processo, tipo:tipo_instrumento!instrumento_tipo_fk(sigla)',
    )
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em', { ascending: false })
    .range(0, 199)
  if (error) throw error
  const linhas = (data as unknown as LinhaDeLicenca[] | null) ?? []
  return linhas.map((l) => ({
    id: l.id,
    unidadeId: l.unidade_id,
    rotulo: [l.tipo?.sigla, l.numero].filter(Boolean).join(' ') || 'Licença sem número',
    orgao: l.orgao,
    numeroProcesso: l.numero_processo,
  }))
}

interface PdfEnviado {
  p_versao_id: string
  p_caminho: string
  p_nome_original: string
  p_sha256: string
}

/**
 * Envia o PDF como objeto novo em consultoria_id/<entidade>/<versaoId>.pdf. Objeto que já existe
 * (tentativa anterior) segue para a RPC, que confere o caminho e a versão.
 */
async function enviarPdf(
  consultoriaId: string,
  entidade: 'exigencia' | 'exigencia_resposta',
  versaoId: string,
  arquivo: File,
): Promise<PdfEnviado> {
  const caminho = `${consultoriaId}/${entidade}/${versaoId}.pdf`
  const hash = await sha256(arquivo)
  const envio = await obterSupabase()
    .storage.from('arquivos')
    .upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false })
  if (envio.error && !envio.error.message.toLowerCase().includes('exists')) throw envio.error
  return {
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
  }
}

/** Registra a exigência (só Gestão). Devolve o id; repetir com o mesmo id não duplica. */
export async function registrarExigencia(
  consultoriaId: string,
  id: string,
  dados: DadosDaExigencia,
  arquivo: File | null,
  versaoId: string,
): Promise<string> {
  const pdf = arquivo ? await enviarPdf(consultoriaId, 'exigencia', versaoId, arquivo) : {}
  const emDias = dados.prazo.modo === 'dias' ? dados.prazo : null
  const { data, error } = await obterSupabase().rpc('registrar_exigencia', {
    p_id: id,
    p_unidade_id: dados.unidadeId,
    p_assunto: dados.assunto,
    p_recebido_em: dados.recebidoEm,
    p_prazo_oficial: dados.prazoOficial,
    p_meta_interna: dados.metaInterna,
    p_recebido_em_texto: dados.recebidoEmTexto,
    p_prazo_dias: aceitaNulo(emDias?.dias ?? null),
    p_prazo_contagem: aceitaNulo(emDias?.contagem ?? null),
    p_prazo_oficial_texto: aceitaNulo(dados.prazo.modo === 'data' ? dados.prazo.texto : null),
    p_instrumento_id: aceitaNulo(dados.instrumentoId),
    p_numero_oficio: dados.numeroOficio,
    p_orgao: dados.orgao,
    p_numero_processo: dados.numeroProcesso,
    p_notas: dados.notas,
    p_responsavel_id: aceitaNulo(dados.responsavelId),
    ...pdf,
  })
  if (error) throw error
  return data
}

export interface DadosDaEdicao {
  assunto: string
  metaInterna: DataCivil
  numeroOficio: string
  orgao: string
  numeroProcesso: string
  notas: string
}

/** Edita os textos e a meta (só Gestão); devolve a nova row_version. */
export async function editarExigencia(
  e: Pick<Exigencia, 'id' | 'rowVersion'>,
  d: DadosDaEdicao,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_exigencia', {
    p_exigencia_id: e.id,
    p_row_version: e.rowVersion,
    p_assunto: d.assunto,
    p_meta_interna: d.metaInterna,
    p_numero_oficio: d.numeroOficio,
    p_orgao: d.orgao,
    p_numero_processo: d.numeroProcesso,
    p_notas: d.notas,
  })
  if (error) throw error
  return data
}

export interface DadosDaResposta {
  protocoladoEm: DataCivil
  protocoladoEmTexto: string
  protocoloNumero: string
  descricao: string
}

/** Registra a resposta protocolada (Gestão ou responsável). Devolve a row_version da exigência. */
export async function responderExigencia(
  consultoriaId: string,
  respostaId: string,
  exigenciaId: string,
  d: DadosDaResposta,
  arquivo: File | null,
  versaoId: string,
): Promise<number> {
  const pdf = arquivo ? await enviarPdf(consultoriaId, 'exigencia_resposta', versaoId, arquivo) : {}
  const { data, error } = await obterSupabase().rpc('responder_exigencia', {
    p_resposta_id: respostaId,
    p_exigencia_id: exigenciaId,
    p_protocolado_em: d.protocoladoEm,
    p_protocolado_em_texto: d.protocoladoEmTexto,
    p_protocolo_numero: d.protocoloNumero,
    p_descricao: d.descricao,
    ...pdf,
  })
  if (error) throw error
  return data
}

/** Anexa um PDF ao histórico (Gestão ou responsável). Não muda a exigência. */
export async function anexarAExigencia(
  consultoriaId: string,
  respostaId: string,
  exigenciaId: string,
  descricao: string,
  arquivo: File,
  versaoId: string,
): Promise<string> {
  const pdf = await enviarPdf(consultoriaId, 'exigencia_resposta', versaoId, arquivo)
  const { data, error } = await obterSupabase().rpc('anexar_a_exigencia', {
    p_resposta_id: respostaId,
    p_exigencia_id: exigenciaId,
    p_descricao: descricao,
    ...pdf,
  })
  if (error) throw error
  return data
}

export interface DadosDaProrrogacao {
  prazoNovo: DataCivil
  prazoNovoTexto: string
  metaInterna: DataCivil
  motivo: string
}

/** Prorroga o prazo (só Gestão). O prazo original nunca muda. Devolve a nova row_version. */
export async function prorrogarExigencia(
  consultoriaId: string,
  respostaId: string,
  e: Pick<Exigencia, 'id' | 'rowVersion'>,
  d: DadosDaProrrogacao,
  arquivo: File | null,
  versaoId: string,
): Promise<number> {
  const pdf = arquivo ? await enviarPdf(consultoriaId, 'exigencia_resposta', versaoId, arquivo) : {}
  const { data, error } = await obterSupabase().rpc('prorrogar_exigencia', {
    p_resposta_id: respostaId,
    p_exigencia_id: e.id,
    p_row_version: e.rowVersion,
    p_prazo_novo: d.prazoNovo,
    p_meta_interna: d.metaInterna,
    p_motivo: d.motivo,
    p_prazo_novo_texto: d.prazoNovoTexto,
    ...pdf,
  })
  if (error) throw error
  return data
}

export async function atribuirExigencia(
  exigenciaId: string,
  membroId: string,
  rowVersion: number,
): Promise<void> {
  const { error } = await obterSupabase().rpc('atribuir_exigencia', {
    p_exigencia_id: exigenciaId,
    p_membro_id: membroId,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/** Exclusão lógica (só Gestão, só sem histórico). */
export async function excluirExigencia(e: Pick<Exigencia, 'id' | 'rowVersion'>): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_exigencia', {
    p_exigencia_id: e.id,
    p_row_version: e.rowVersion,
  })
  if (error) throw error
}

/** Grava o número do processo na licença (só Gestão). Devolve a nova row_version da licença. */
export async function definirProcessoDaLicenca(
  instrumentoId: string,
  rowVersion: number,
  numeroProcesso: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('definir_processo_da_licenca', {
    p_instrumento_id: instrumentoId,
    p_row_version: rowVersion,
    p_numero_processo: numeroProcesso,
  })
  if (error) throw error
  return data
}
