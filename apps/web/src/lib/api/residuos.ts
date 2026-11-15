// Acesso a dados de resíduos, fase 1 (MTR e CDF sem integração com o IMA; migration
// 20261114210000_residuos_mtr_cdf). Protótipo para revisão.
//
// Escrita só por RPC, idempotente pelo id que a tela gera (crypto.randomUUID()) antes de enviar:
// repetir o envio devolve o mesmo registro. Edição e exclusão conferem row_version (erro
// `conflito_de_versao`). Leitura pela RLS de membro ativo. Erros sobem como vieram: a tela traduz
// com lib/erros (mensagemDoErro). Prazos e pendências são calculados no banco, espelhando
// packages/domain/src/residuos.ts; o domínio também serve para a tela (rótulos, formatação,
// leitura da quantidade digitada).
//
// PDF: a tela confere com conferirPdf (lib/api/licencas) e chama enviarPdfResiduo DEPOIS de
// registrar o MTR/CDF (o PDF precisa do id). O arquivo vai para o Storage como objeto novo em
// consultoria_id/<mtr|cdf>/<uuid>.pdf e vira versão imutável do documento pela RPC.

import {
  ehSituacaoMtr,
  ehTipoObrigacaoResiduo,
  ehUnidadeResiduo,
  type DataCivil,
  type SituacaoMtr,
  type TipoObrigacaoResiduo,
  type UnidadeResiduo,
} from '@gestao-ambiental/domain'

import { lista, texto, textoOuNulo, type Objeto } from '@/lib/api/json'
import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_RESIDUOS = 50

// ---------------------------------------------------------------------------
// Leitura defensiva
// ---------------------------------------------------------------------------

function numero(valor: Json | undefined): number {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '') return Number(valor)
  return 0
}

function numeroOuNulo(valor: Json | undefined): number | null {
  if (valor === null || valor === undefined) return null
  return numero(valor)
}

function unidade(valor: Json | undefined): UnidadeResiduo {
  return ehUnidadeResiduo(valor) ? valor : 'un'
}

function unidadeOuNula(valor: Json | undefined): UnidadeResiduo | null {
  return ehUnidadeResiduo(valor) ? valor : null
}

function situacao(valor: Json | undefined): SituacaoMtr {
  return ehSituacaoMtr(valor) ? valor : 'salvo'
}

function pdf(caminho: string | null, nome: string | null): ArquivoPdf | null {
  return caminho ? { caminho, nome: nome ?? '' } : null
}

// ---------------------------------------------------------------------------
// MTR
// ---------------------------------------------------------------------------

export interface ArquivoPdf {
  /** Caminho no bucket "arquivos"; para abrir, use urlDoPdfResiduo. */
  caminho: string
  /** Nome original do arquivo enviado. */
  nome: string
}

export interface ItemDoMtr {
  id: string
  posicao: number
  residuoCodigo: string
  residuoDescricao: string
  classe: string | null
  quantidade: number
  unidade: UnidadeResiduo
}

export interface CdfResumido {
  id: string
  numero: string
  emitidoEm: DataCivil
}

export interface Mtr {
  id: string
  empreendimentoId: string
  empreendimentoNome: string
  numero: string
  emitidoEm: DataCivil
  situacao: SituacaoMtr
  transportadorNome: string
  transportadorCnpj: string | null
  destinadorNome: string
  destinadorCnpj: string | null
  observacao: string | null
  pdf: ArquivoPdf | null
  itens: ItemDoMtr[]
  /** CDFs (não excluídos) que cobrem o MTR. */
  cdfs: CdfResumido[]
  temCdf: boolean
  rowVersion: number
  criadoEm: string
}

export interface FiltrosDeMtr {
  /** Sem empreendimento: todos da consultoria. */
  empreendimentoId?: string | null
  /** Emissão de (inclusive). */
  de?: DataCivil | null
  /** Emissão até (inclusive). */
  ate?: DataCivil | null
  situacao?: SituacaoMtr | null
  /** Só MTRs não cancelados que nenhum CDF cobre. */
  semCdf?: boolean
  /** Número, transportador ou destinador (sem acento e caixa). */
  busca?: string
}

function lerItemDoMtr(item: Objeto): ItemDoMtr {
  return {
    id: texto(item.id),
    posicao: numero(item.posicao),
    residuoCodigo: texto(item.residuo_codigo),
    residuoDescricao: texto(item.residuo_descricao),
    classe: textoOuNulo(item.classe),
    quantidade: numero(item.quantidade),
    unidade: unidade(item.unidade),
  }
}

function lerCdfResumido(item: Objeto): CdfResumido {
  return {
    id: texto(item.id),
    numero: texto(item.numero),
    emitidoEm: texto(item.emitido_em) as DataCivil,
  }
}

/** MTRs paginados (50 por página), mais recentes primeiro, com itens e CDFs. */
export async function listarMtrs(
  consultoriaId: string,
  filtros: FiltrosDeMtr = {},
  pagina = 0,
): Promise<{ itens: Mtr[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_mtrs', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: filtros.empreendimentoId ?? undefined,
    p_de: filtros.de ?? undefined,
    p_ate: filtros.ate ?? undefined,
    p_situacao: filtros.situacao ?? undefined,
    p_sem_cdf: filtros.semCdf ?? false,
    p_busca: filtros.busca ?? '',
    p_limite: TAMANHO_PAGINA_RESIDUOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_RESIDUOS,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => {
      // O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
      const transportadorCnpj: string | null = linha.transportador_cnpj
      const destinadorCnpj: string | null = linha.destinador_cnpj
      const observacao: string | null = linha.observacao
      const caminho: string | null = linha.pdf_caminho
      const nome: string | null = linha.pdf_nome
      return {
        id: linha.id,
        empreendimentoId: linha.empreendimento_id,
        empreendimentoNome: linha.empreendimento_nome,
        numero: linha.numero,
        emitidoEm: linha.emitido_em as DataCivil,
        situacao: situacao(linha.situacao),
        transportadorNome: linha.transportador_nome,
        transportadorCnpj,
        destinadorNome: linha.destinador_nome,
        destinadorCnpj,
        observacao,
        pdf: pdf(caminho, nome),
        itens: lista(linha.itens).map(lerItemDoMtr),
        cdfs: lista(linha.cdfs).map(lerCdfResumido),
        temCdf: linha.tem_cdf,
        rowVersion: linha.row_version,
        criadoEm: linha.criado_em,
      }
    }),
    total: data[0]?.total ?? 0,
  }
}

export interface EntradaDoItemDoMtr {
  /** Item já gravado: mande o id para mantê-lo (itens ligados a CDF não podem sair). Novo: omita
   *  ou gere com crypto.randomUUID(). */
  id?: string
  residuoCodigo: string
  residuoDescricao: string
  classe?: string | null
  /** Maior que zero, até 4 casas (use lerQuantidade do domínio para o texto digitado). */
  quantidade: number
  unidade: UnidadeResiduo
}

export interface DadosDoMtr {
  numero: string
  emitidoEm: DataCivil
  situacao: SituacaoMtr
  transportadorNome: string
  transportadorCnpj?: string | null
  destinadorNome: string
  destinadorCnpj?: string | null
  observacao?: string | null
  /** De 1 a 100 itens, na ordem de exibição. */
  itens: EntradaDoItemDoMtr[]
}

function itensParaJson(itens: EntradaDoItemDoMtr[]): Json {
  return itens.map((item) => ({
    ...(item.id ? { id: item.id } : {}),
    residuo_codigo: item.residuoCodigo,
    residuo_descricao: item.residuoDescricao,
    classe: item.classe ?? null,
    quantidade: item.quantidade,
    unidade: item.unidade,
  }))
}

/**
 * Registra o MTR com os itens (uma transação). `id` vem da tela; repetir devolve o mesmo id sem
 * mudar nada. Erros: sem_permissao, numero_documento_obrigatorio, emissao_obrigatoria,
 * emissao_futura, situacao_invalida, transportador_obrigatorio, destinador_obrigatorio,
 * numero_existente, cnpj_invalido, itens_obrigatorios, itens_demais, residuo_obrigatorio,
 * unidade_de_residuo_invalida, quantidade_invalida, item_existente, mtr_existente.
 */
export async function registrarMtr(
  id: string,
  empreendimentoId: string,
  dados: DadosDoMtr,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('registrar_mtr', {
    p_id: id,
    p_empreendimento_id: empreendimentoId,
    p_numero: dados.numero,
    p_emitido_em: dados.emitidoEm,
    p_situacao: dados.situacao,
    p_transportador_nome: dados.transportadorNome,
    p_transportador_cnpj: aceitaNulo(dados.transportadorCnpj ?? null),
    p_destinador_nome: dados.destinadorNome,
    p_destinador_cnpj: aceitaNulo(dados.destinadorCnpj ?? null),
    p_itens: itensParaJson(dados.itens),
    p_observacao: aceitaNulo(dados.observacao ?? null),
  })
  if (error) throw error
  return data
}

/**
 * Edita o MTR e substitui a lista de itens. Devolve a nova row_version. Erros além dos de
 * registrarMtr: conflito_de_versao, registro_excluido, item_ligado_a_cdf.
 */
export async function editarMtr(
  id: string,
  rowVersion: number,
  dados: DadosDoMtr,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_mtr', {
    p_id: id,
    p_row_version: rowVersion,
    p_numero: dados.numero,
    p_emitido_em: dados.emitidoEm,
    p_situacao: dados.situacao,
    p_transportador_nome: dados.transportadorNome,
    p_transportador_cnpj: aceitaNulo(dados.transportadorCnpj ?? null),
    p_destinador_nome: dados.destinadorNome,
    p_destinador_cnpj: aceitaNulo(dados.destinadorCnpj ?? null),
    p_itens: itensParaJson(dados.itens),
    p_observacao: aceitaNulo(dados.observacao ?? null),
  })
  if (error) throw error
  return data
}

/** Exclusão lógica. Erros: conflito_de_versao, registro_excluido, mtr_com_cdf. */
export async function excluirMtr(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_mtr', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// CDF
// ---------------------------------------------------------------------------

export interface ItemCobertoPeloCdf {
  mtrItemId: string
  residuoCodigo: string
  residuoDescricao: string
  quantidadeMtr: number
  unidadeMtr: UnidadeResiduo
  /** O que o CDF informa para o item; nulo se não informa. */
  quantidade: number | null
  unidade: UnidadeResiduo | null
}

export interface MtrCobertoPeloCdf {
  mtrId: string
  numero: string
  emitidoEm: DataCivil
  situacao: SituacaoMtr
  itens: ItemCobertoPeloCdf[]
}

export interface Cdf {
  id: string
  empreendimentoId: string
  empreendimentoNome: string
  numero: string
  emitidoEm: DataCivil
  destinadorNome: string
  destinadorCnpj: string | null
  periodoInicio: DataCivil
  periodoFim: DataCivil
  observacao: string | null
  pdf: ArquivoPdf | null
  mtrs: MtrCobertoPeloCdf[]
  rowVersion: number
  criadoEm: string
}

export interface FiltrosDeCdf {
  empreendimentoId?: string | null
  de?: DataCivil | null
  ate?: DataCivil | null
  /** Número ou destinador. */
  busca?: string
}

function lerMtrCoberto(item: Objeto): MtrCobertoPeloCdf {
  return {
    mtrId: texto(item.mtr_id),
    numero: texto(item.numero),
    emitidoEm: texto(item.emitido_em) as DataCivil,
    situacao: situacao(item.situacao),
    itens: lista(item.itens).map((i) => ({
      mtrItemId: texto(i.mtr_item_id),
      residuoCodigo: texto(i.residuo_codigo),
      residuoDescricao: texto(i.residuo_descricao),
      quantidadeMtr: numero(i.quantidade_mtr),
      unidadeMtr: unidade(i.unidade_mtr),
      quantidade: numeroOuNulo(i.quantidade),
      unidade: unidadeOuNula(i.unidade),
    })),
  }
}

/** CDFs paginados (50 por página), mais recentes primeiro, com os MTRs e itens cobertos. */
export async function listarCdfs(
  consultoriaId: string,
  filtros: FiltrosDeCdf = {},
  pagina = 0,
): Promise<{ itens: Cdf[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_cdfs', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: filtros.empreendimentoId ?? undefined,
    p_de: filtros.de ?? undefined,
    p_ate: filtros.ate ?? undefined,
    p_busca: filtros.busca ?? '',
    p_limite: TAMANHO_PAGINA_RESIDUOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_RESIDUOS,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => {
      const destinadorCnpj: string | null = linha.destinador_cnpj
      const observacao: string | null = linha.observacao
      const caminho: string | null = linha.pdf_caminho
      const nome: string | null = linha.pdf_nome
      return {
        id: linha.id,
        empreendimentoId: linha.empreendimento_id,
        empreendimentoNome: linha.empreendimento_nome,
        numero: linha.numero,
        emitidoEm: linha.emitido_em as DataCivil,
        destinadorNome: linha.destinador_nome,
        destinadorCnpj,
        periodoInicio: linha.periodo_inicio as DataCivil,
        periodoFim: linha.periodo_fim as DataCivil,
        observacao,
        pdf: pdf(caminho, nome),
        mtrs: lista(linha.mtrs).map(lerMtrCoberto),
        rowVersion: linha.row_version,
        criadoEm: linha.criado_em,
      }
    }),
    total: data[0]?.total ?? 0,
  }
}

export interface EntradaDoMtrCoberto {
  /** MTR (não excluído) do mesmo empreendimento do CDF. Cobre todos os itens dele. */
  mtrId: string
  /** Só os itens em que o CDF informa a quantidade recebida. */
  itens?: { mtrItemId: string; quantidade: number | null; unidade: UnidadeResiduo | null }[]
}

export interface DadosDoCdf {
  numero: string
  emitidoEm: DataCivil
  destinadorNome: string
  destinadorCnpj?: string | null
  periodoInicio: DataCivil
  periodoFim: DataCivil
  observacao?: string | null
  /** Pode ser vazio (CDF sem MTR registrado no Grama). */
  mtrs: EntradaDoMtrCoberto[]
}

function mtrsParaJson(mtrs: EntradaDoMtrCoberto[]): Json {
  return mtrs.map((mtr) => ({
    mtr_id: mtr.mtrId,
    itens: (mtr.itens ?? []).map((item) => ({
      mtr_item_id: item.mtrItemId,
      quantidade: item.quantidade,
      unidade: item.unidade,
    })),
  }))
}

/**
 * Registra o CDF com os MTRs cobertos (uma transação). Idempotente pelo id. Erros: sem_permissao,
 * numero_documento_obrigatorio, emissao_obrigatoria, emissao_futura, destinador_obrigatorio,
 * periodo_invalido, cnpj_invalido, mtr_invalido, mtrs_demais, item_do_mtr_invalido,
 * quantidade_sem_unidade, unidade_de_residuo_invalida, quantidade_invalida, cdf_existente.
 */
export async function registrarCdf(
  id: string,
  empreendimentoId: string,
  dados: DadosDoCdf,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('registrar_cdf', {
    p_id: id,
    p_empreendimento_id: empreendimentoId,
    p_numero: dados.numero,
    p_emitido_em: dados.emitidoEm,
    p_destinador_nome: dados.destinadorNome,
    p_destinador_cnpj: aceitaNulo(dados.destinadorCnpj ?? null),
    p_periodo_inicio: dados.periodoInicio,
    p_periodo_fim: dados.periodoFim,
    p_mtrs: mtrsParaJson(dados.mtrs),
    p_observacao: aceitaNulo(dados.observacao ?? null),
  })
  if (error) throw error
  return data
}

/** Edita o CDF e substitui os MTRs cobertos. Devolve a nova row_version. */
export async function editarCdf(
  id: string,
  rowVersion: number,
  dados: DadosDoCdf,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_cdf', {
    p_id: id,
    p_row_version: rowVersion,
    p_numero: dados.numero,
    p_emitido_em: dados.emitidoEm,
    p_destinador_nome: dados.destinadorNome,
    p_destinador_cnpj: aceitaNulo(dados.destinadorCnpj ?? null),
    p_periodo_inicio: dados.periodoInicio,
    p_periodo_fim: dados.periodoFim,
    p_mtrs: mtrsParaJson(dados.mtrs),
    p_observacao: aceitaNulo(dados.observacao ?? null),
  })
  if (error) throw error
  return data
}

/** Exclusão lógica. Os MTRs que ele cobria voltam a contar como "sem CDF". */
export async function excluirCdf(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_cdf', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// PDF do MTR ou do CDF
// ---------------------------------------------------------------------------

export type EntidadeDoPdfDeResiduo = 'mtr' | 'cdf'

/**
 * Envia o PDF (já conferido com conferirPdf de lib/api/licencas) como objeto novo e o registra
 * como versão vigente do documento do MTR ou do CDF. Devolve o id da versão. Erros:
 * sem_permissao, registro_excluido, caminho_invalido, arquivo_nao_encontrado, arquivo_nao_pdf,
 * arquivo_grande_demais, versao_existente (e os do Storage).
 */
export async function enviarPdfResiduo(
  entidade: EntidadeDoPdfDeResiduo,
  registroId: string,
  consultoriaId: string,
  arquivo: File,
): Promise<string> {
  const supabase = obterSupabase()
  const versaoId = crypto.randomUUID()
  const caminho = `${consultoriaId}/${entidade}/${versaoId}.pdf`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false })
  if (envio.error) throw envio.error
  const { data, error } = await supabase.rpc('anexar_pdf_residuo', {
    p_entidade: entidade,
    p_registro_id: registroId,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
  })
  if (error) throw error
  return data
}

/** URL assinada de 5 minutos para abrir o PDF (a política de Storage confere o vínculo). */
export async function urlDoPdfResiduo(caminho: string): Promise<string> {
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrl(caminho, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Conferência CDF x MTR
// ---------------------------------------------------------------------------

export type TipoDePendenciaDeResiduo =
  'mtr_sem_cdf' | 'quantidade_diferente' | 'unidades_diferentes'

export interface PendenciaDaConferencia {
  tipo: TipoDePendenciaDeResiduo
  mtrId: string
  numero: string
  emitidoEm: DataCivil
  empreendimentoId: string
  empreendimentoNome: string
  /** mtr_sem_cdf: dias corridos desde a emissão. Nos outros tipos, nulo. */
  dias: number | null
  /** Tipos por item: o item do MTR. Em mtr_sem_cdf, nulos. */
  mtrItemId: string | null
  residuoCodigo: string | null
  residuoDescricao: string | null
  /** Unidade do item no MTR. */
  unidade: UnidadeResiduo | null
  quantidadeMtr: number | null
  /** quantidade_diferente: soma do que os CDFs informam, na unidade do item. */
  quantidadeCdf: number | null
  /** quantidade_diferente: quantidadeCdf − quantidadeMtr. */
  diferenca: number | null
  /** CDFs envolvidos (tipos por item). */
  cdfs: { id: string; numero: string }[]
  /** unidades_diferentes: unidades informadas nos CDFs. */
  unidadesCdf: UnidadeResiduo[]
}

/** Pendências calculadas agora (no fuso da consultoria), em ordem de emissão do MTR. */
export async function conferenciaDeResiduos(
  consultoriaId: string,
  empreendimentoId?: string | null,
): Promise<PendenciaDaConferencia[]> {
  const { data, error } = await obterSupabase().rpc('conferencia_residuos', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId ?? undefined,
  })
  if (error) throw error
  return data.map((linha) => {
    const tipo: TipoDePendenciaDeResiduo =
      linha.tipo === 'quantidade_diferente' || linha.tipo === 'unidades_diferentes'
        ? linha.tipo
        : 'mtr_sem_cdf'
    const dias: number | null = linha.dias
    const mtrItemId: string | null = linha.mtr_item_id
    const residuoCodigo: string | null = linha.residuo_codigo
    const residuoDescricao: string | null = linha.residuo_descricao
    const quantidadeMtr: number | null = linha.quantidade_mtr
    const quantidadeCdf: number | null = linha.quantidade_cdf
    const diferenca: number | null = linha.diferenca
    const unidadesCdf: UnidadeResiduo[] = Array.isArray(linha.unidades_cdf)
      ? linha.unidades_cdf.filter(ehUnidadeResiduo)
      : []
    return {
      tipo,
      mtrId: linha.mtr_id,
      numero: linha.numero,
      emitidoEm: linha.emitido_em as DataCivil,
      empreendimentoId: linha.empreendimento_id,
      empreendimentoNome: linha.empreendimento_nome,
      dias,
      mtrItemId,
      residuoCodigo,
      residuoDescricao,
      unidade: unidadeOuNula(linha.unidade),
      quantidadeMtr: numeroOuNulo(quantidadeMtr),
      quantidadeCdf: numeroOuNulo(quantidadeCdf),
      diferenca: numeroOuNulo(diferenca),
      cdfs: lista(linha.cdfs).map((c) => ({ id: texto(c.id), numero: texto(c.numero) })),
      unidadesCdf,
    }
  })
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export interface LinhaDoPainelDeResiduos {
  /** Primeiro dia do mês de emissão dos MTRs. */
  mes: DataCivil
  empreendimentoId: string
  empreendimentoNome: string
  residuoCodigo: string
  residuoDescricao: string
  destinadorNome: string
  /** Massa em t, volume em m³, unidades em un (kg e L já convertidos). */
  unidade: UnidadeResiduo
  quantidade: number
  /** MTRs que somam nesta linha. */
  mtrs: number
}

/**
 * Quantidade por mês, empreendimento, resíduo, destinador e unidade (MTR cancelado não entra).
 * Sem empreendimento: a consultoria inteira. A tela soma como quiser (por resíduo, destinador ou mês).
 */
export async function painelDeResiduos(
  consultoriaId: string,
  filtros: { empreendimentoId?: string | null; de?: DataCivil | null; ate?: DataCivil | null } = {},
): Promise<LinhaDoPainelDeResiduos[]> {
  const { data, error } = await obterSupabase().rpc('painel_residuos', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: filtros.empreendimentoId ?? undefined,
    p_de: filtros.de ?? undefined,
    p_ate: filtros.ate ?? undefined,
  })
  if (error) throw error
  return data.map((linha) => ({
    mes: linha.mes as DataCivil,
    empreendimentoId: linha.empreendimento_id,
    empreendimentoNome: linha.empreendimento_nome,
    residuoCodigo: linha.residuo_codigo,
    residuoDescricao: linha.residuo_descricao,
    destinadorNome: linha.destinador_nome,
    unidade: unidade(linha.unidade),
    quantidade: numero(linha.quantidade),
    mtrs: linha.mtrs,
  }))
}

// ---------------------------------------------------------------------------
// Obrigações e prazos
// ---------------------------------------------------------------------------

export interface ObrigacaoDeResiduo {
  tipo: TipoObrigacaoResiduo
  ativa: boolean
  observacao: string | null
  /** Nulo se nunca foi ligada. */
  obrigacaoId: string | null
  atualizadoEm: string | null
}

/** As 4 obrigações do empreendimento (DMR, DMRSU, Inventário, RAPP), ligadas ou não. */
export async function obrigacoesDoEmpreendimento(
  empreendimentoId: string,
): Promise<ObrigacaoDeResiduo[]> {
  const { data, error } = await obterSupabase().rpc('obrigacoes_residuo', {
    p_empreendimento_id: empreendimentoId,
  })
  if (error) throw error
  return data.flatMap((linha) => {
    if (!ehTipoObrigacaoResiduo(linha.tipo)) return []
    const observacao: string | null = linha.observacao
    const obrigacaoId: string | null = linha.obrigacao_id
    const atualizadoEm: string | null = linha.atualizado_em
    return [{ tipo: linha.tipo, ativa: linha.ativa, observacao, obrigacaoId, atualizadoEm }]
  })
}

/** Só a Gestão (erro sem_permissao para a Equipe). Erro: tipo_de_obrigacao_invalido. */
export async function definirObrigacaoResiduo(
  empreendimentoId: string,
  tipo: TipoObrigacaoResiduo,
  ativa: boolean,
  observacao?: string | null,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('definir_obrigacao_residuo', {
    p_empreendimento_id: empreendimentoId,
    p_tipo: tipo,
    p_ativa: ativa,
    p_observacao: aceitaNulo(observacao ?? null),
  })
  if (error) throw error
  return data
}

export interface PrazoDeObrigacaoNoCalendario {
  obrigacaoId: string
  empreendimentoId: string
  empreendimentoNome: string
  tipo: TipoObrigacaoResiduo
  /** "3º trimestre de 2026", "outubro de 2026", "entrega de 2027". */
  referencia: string
  /** Primeiro dia da janela de entrega (DMR, DMRSU, RAPP); nulo no Inventário. */
  inicio: DataCivil | null
  prazo: DataCivil
  /** prazo − hoje (fuso da consultoria): negativo = passou. */
  dias: number
  observacao: string | null
}

/**
 * Prazos das obrigações ligadas, para o calendário. Padrão: de hoje a um ano; janela máxima de
 * 3 anos. Sem empreendimento: a consultoria inteira.
 */
export async function prazosDasObrigacoesDeResiduo(
  consultoriaId: string,
  filtros: { de?: DataCivil | null; ate?: DataCivil | null; empreendimentoId?: string | null } = {},
): Promise<PrazoDeObrigacaoNoCalendario[]> {
  const { data, error } = await obterSupabase().rpc('prazos_obrigacoes_residuo', {
    p_consultoria_id: consultoriaId,
    p_de: filtros.de ?? undefined,
    p_ate: filtros.ate ?? undefined,
    p_empreendimento_id: filtros.empreendimentoId ?? undefined,
  })
  if (error) throw error
  return data.flatMap((linha) => {
    if (!ehTipoObrigacaoResiduo(linha.tipo)) return []
    const inicio: string | null = linha.inicio
    const observacao: string | null = linha.observacao
    return [
      {
        obrigacaoId: linha.obrigacao_id,
        empreendimentoId: linha.empreendimento_id,
        empreendimentoNome: linha.empreendimento_nome,
        tipo: linha.tipo,
        referencia: linha.referencia,
        inicio: inicio as DataCivil | null,
        prazo: linha.prazo as DataCivil,
        dias: linha.dias,
        observacao,
      },
    ]
  })
}
