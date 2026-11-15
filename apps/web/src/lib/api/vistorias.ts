// Vistoria móvel (Campo), ADR-0033. Escrita só por RPC, idempotente pelo id que a tela gera
// (crypto.randomUUID()) antes de enviar. Leitura de itens e fotos por select direto, com RLS.
// A foto vai direto ao Storage como objeto novo em consultoria_id/vistoria/<uuid>.<ext>; a RPC lê
// mime e tamanho de storage.objects. Erros sobem como vieram: a tela traduz com lib/erros.

import type {
  DataCivil,
  LocalDaFoto,
  ResultadoDoItem,
  SituacaoDaVistoria,
} from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_VISTORIAS = 30

// O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
function anulavel<T>(valor: T): T | null {
  return valor
}

function hora(valor: string | null): string | null {
  return valor ? valor.slice(0, 5) : null
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface VistoriaDaLista {
  id: string
  ocorrenciaId: string
  titulo: string
  situacao: SituacaoDaVistoria
  dataPlanejada: DataCivil
  /** "HH:MM" */
  horaPlanejada: string | null
  duracaoMinutos: number | null
  responsavelId: string
  responsavelNome: string | null
  condicionanteCodigo: string | null
  empreendimentoNome: string
  unidadeNome: string
  licenca: string | null
  totalItens: number
  itensRegistrados: number
  enviadaEm: string | null
}

export interface PaginaDeVistorias {
  itens: VistoriaDaLista[]
  /** Total de vistorias do filtro (todas as páginas). */
  total: number
  /** Hoje no fuso da consultoria, calculado no banco; nulo quando a página veio vazia. */
  hoje: DataCivil | null
  /** Deslocamento da próxima página, ou nulo quando acabou. */
  proxima: number | null
}

/** Ordenada pelo banco por data e hora planejadas. */
export async function listarVistorias(filtro: {
  ocorrenciaId: string | null
  somenteMinhas: boolean
  deslocamento: number
  limite?: number
}): Promise<PaginaDeVistorias> {
  const limite = filtro.limite ?? TAMANHO_PAGINA_VISTORIAS
  const { data, error } = await obterSupabase().rpc('listar_vistorias', {
    p_ocorrencia_id: aceitaNulo(filtro.ocorrenciaId),
    p_somente_minhas: filtro.somenteMinhas,
    p_limite: limite,
    p_deslocamento: filtro.deslocamento,
  })
  if (error) throw error
  // A RPC sem linhas pode chegar nula.
  const linhas = (data as typeof data | null) ?? []
  const primeira = linhas[0]
  const total = primeira ? primeira.total : 0
  const lidas = filtro.deslocamento + linhas.length
  return {
    itens: linhas.map((v) => ({
      id: v.id,
      ocorrenciaId: v.ocorrencia_id,
      titulo: v.titulo,
      situacao: v.situacao,
      dataPlanejada: v.data_planejada as DataCivil,
      horaPlanejada: hora(anulavel(v.hora_planejada)),
      duracaoMinutos: anulavel(v.duracao_minutos),
      responsavelId: v.responsavel_id,
      responsavelNome: anulavel(v.responsavel_nome),
      condicionanteCodigo: anulavel(v.condicionante_codigo),
      empreendimentoNome: v.empreendimento_nome,
      unidadeNome: v.unidade_nome,
      licenca: anulavel(v.licenca),
      totalItens: v.total_itens,
      itensRegistrados: v.itens_registrados,
      enviadaEm: anulavel(v.enviada_em),
    })),
    total,
    hoje: primeira ? (primeira.hoje as DataCivil) : null,
    proxima: linhas.length > 0 && lidas < total ? lidas : null,
  }
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface Vistoria {
  id: string
  consultoriaId: string
  ocorrenciaId: string
  ocorrenciaSituacao: 'aberta' | 'em_conferencia' | 'concluida'
  ciclo: number
  condicionanteCodigo: string | null
  condicionanteTitulo: string | null
  titulo: string
  objetivo: string | null
  situacao: SituacaoDaVistoria
  dataPlanejada: DataCivil
  /** "HH:MM" */
  horaPlanejada: string | null
  duracaoMinutos: number | null
  responsavelId: string
  responsavelNome: string | null
  empreendimentoId: string
  empreendimentoNome: string
  unidadeNome: string
  unidadeEndereco: string | null
  licenca: string | null
  prazoAtual: DataCivil
  metaInterna: DataCivil | null
  /** Hoje no fuso da consultoria, calculado no banco. */
  hoje: DataCivil
  observacao: string | null
  iniciadaEm: string | null
  enviadaEm: string | null
  enviadaPorNome: string | null
  conferenteNome: string | null
  conferenciaIndependente: boolean
  /** Responsável ou Gestão, ocorrência aberta e vistoria planejada, em andamento ou devolvida. */
  podeRegistrar: boolean
  /** Só com a vistoria enviada e quem chama podendo decidir. */
  podeConferir: boolean
  ultimaDecisao: {
    decisao: 'aprovada' | 'devolvida'
    motivo: string | null
    em: string
    conferenteNome: string | null
  } | null
  rowVersion: number
}

export async function obterVistoria(id: string): Promise<Vistoria | null> {
  const { data, error } = await obterSupabase().rpc('obter_vistoria', { p_id: id })
  if (error) throw error
  const v = ((data as typeof data | null) ?? [])[0]
  if (!v) return null
  const decisao = anulavel(v.ultima_decisao)
  return {
    id: v.id,
    consultoriaId: v.consultoria_id,
    ocorrenciaId: v.ocorrencia_id,
    ocorrenciaSituacao: v.ocorrencia_situacao,
    ciclo: v.ciclo,
    condicionanteCodigo: anulavel(v.condicionante_codigo),
    condicionanteTitulo: anulavel(v.condicionante_titulo),
    titulo: v.titulo,
    objetivo: anulavel(v.objetivo),
    situacao: v.situacao,
    dataPlanejada: v.data_planejada as DataCivil,
    horaPlanejada: hora(anulavel(v.hora_planejada)),
    duracaoMinutos: anulavel(v.duracao_minutos),
    responsavelId: v.responsavel_id,
    responsavelNome: anulavel(v.responsavel_nome),
    empreendimentoId: v.empreendimento_id,
    empreendimentoNome: v.empreendimento_nome,
    unidadeNome: v.unidade_nome,
    unidadeEndereco: anulavel(v.unidade_endereco),
    licenca: anulavel(v.licenca),
    prazoAtual: v.prazo_oficial_atual as DataCivil,
    metaInterna: anulavel(v.meta_interna) as DataCivil | null,
    hoje: v.hoje as DataCivil,
    observacao: anulavel(v.observacao),
    iniciadaEm: anulavel(v.iniciada_em),
    enviadaEm: anulavel(v.enviada_em),
    enviadaPorNome: anulavel(v.enviada_por_nome),
    conferenteNome: anulavel(v.conferente_nome),
    conferenciaIndependente: v.conferencia_independente,
    podeRegistrar: v.pode_registrar,
    podeConferir: v.pode_conferir,
    ultimaDecisao: decisao
      ? {
          decisao,
          motivo: anulavel(v.ultima_decisao_motivo),
          em: v.ultima_decisao_em,
          conferenteNome: anulavel(v.ultima_decisao_conferente_nome),
        }
      : null,
    rowVersion: v.row_version,
  }
}

export interface ItemDaVistoriaGravado {
  id: string
  posicao: number
  titulo: string
  descricao: string | null
  resultado: ResultadoDoItem
  comentario: string | null
}

export async function listarItensDaVistoria(vistoriaId: string): Promise<ItemDaVistoriaGravado[]> {
  const { data, error } = await obterSupabase()
    .from('vistoria_item')
    .select('id, posicao, titulo, descricao, resultado, comentario')
    .eq('vistoria_id', vistoriaId)
    .order('posicao')
    .range(0, 99)
  if (error) throw error
  return data.map((i) => ({
    id: i.id,
    posicao: i.posicao,
    titulo: i.titulo,
    descricao: i.descricao,
    resultado: i.resultado,
    comentario: i.comentario,
  }))
}

export interface FotoDaVistoria {
  id: string
  itemId: string
  caminho: string
  legenda: string | null
  capturadaEm: string
}

/** Fotos vigentes (a exclusão é lógica). */
export async function listarFotosDaVistoria(vistoriaId: string): Promise<FotoDaVistoria[]> {
  const { data, error } = await obterSupabase()
    .from('vistoria_foto')
    .select('id, item_id, caminho, legenda, capturada_em')
    .eq('vistoria_id', vistoriaId)
    .is('excluida_em', null)
    .order('capturada_em')
    .range(0, 499)
  if (error) throw error
  return data.map((f) => ({
    id: f.id,
    itemId: f.item_id,
    caminho: f.caminho,
    legenda: f.legenda,
    capturadaEm: f.capturada_em,
  }))
}

/** URLs assinadas (5 min) das miniaturas, por caminho. */
export async function urlsDasFotos(caminhos: readonly string[]): Promise<Record<string, string>> {
  if (caminhos.length === 0) return {}
  const { data, error } = await obterSupabase()
    .storage.from('arquivos')
    .createSignedUrls([...caminhos], 300)
  if (error) throw error
  const urls: Record<string, string> = {}
  for (const linha of data) {
    if (linha.path && linha.signedUrl) urls[linha.path] = linha.signedUrl
  }
  return urls
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export interface DadosDoAgendamento {
  titulo: string
  objetivo: string | null
  responsavelId: string
  data: DataCivil
  /** "HH:MM" */
  hora: string | null
  duracaoMinutos: number | null
  itens: readonly { titulo: string; descricao: string | null }[]
}

export async function criarVistoria(
  id: string,
  ocorrenciaId: string,
  dados: DadosDoAgendamento,
): Promise<void> {
  const { error } = await obterSupabase().rpc('criar_vistoria', {
    p_id: id,
    p_ocorrencia_id: ocorrenciaId,
    p_titulo: dados.titulo,
    p_objetivo: aceitaNulo(dados.objetivo),
    p_responsavel_id: dados.responsavelId,
    p_data: dados.data,
    p_hora: aceitaNulo(dados.hora),
    p_duracao_minutos: aceitaNulo(dados.duracaoMinutos),
    p_itens: dados.itens.map((item) => ({ titulo: item.titulo, descricao: item.descricao })),
  })
  if (error) throw error
}

/** Devolve a nova row_version. Repetir com a vistoria já iniciada não muda nada. */
export async function iniciarVistoria(id: string): Promise<number> {
  const { data, error } = await obterSupabase().rpc('iniciar_vistoria', { p_id: id })
  if (error) throw error
  return data
}

export async function registrarItemDaVistoria(
  itemId: string,
  resultado: ResultadoDoItem,
  comentario: string | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('registrar_item_da_vistoria', {
    p_item_id: itemId,
    p_resultado: resultado,
    p_comentario: aceitaNulo(comentario),
  })
  if (error) throw error
}

export async function salvarObservacaoDaVistoria(
  id: string,
  observacao: string | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('salvar_observacao_da_vistoria', {
    p_id: id,
    p_observacao: aceitaNulo(observacao),
  })
  if (error) throw error
}

export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png'] as const
const EXTENSAO_DA_FOTO: Record<(typeof TIPOS_DE_FOTO)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
export const TAMANHO_MAXIMO_DA_FOTO = 25 * 1024 * 1024

export type ProblemaDaFoto = 'tipo' | 'vazia' | 'grande_demais'

export function conferirArquivoDaFoto(arquivo: File): ProblemaDaFoto | null {
  if (!(TIPOS_DE_FOTO as readonly string[]).includes(arquivo.type)) return 'tipo'
  if (arquivo.size === 0) return 'vazia'
  return arquivo.size > TAMANHO_MAXIMO_DA_FOTO ? 'grande_demais' : null
}

/** O objeto já está no Storage (tentativa anterior chegou lá): segue para a RPC. */
function objetoJaExiste(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const { statusCode, message } = erro as { statusCode?: unknown; message?: unknown }
  return (
    statusCode === '409' ||
    statusCode === 409 ||
    (typeof message === 'string' && /already exists|duplicate/i.test(message))
  )
}

export interface NovaFoto {
  consultoriaId: string
  /** Gerado uma vez por foto escolhida: repetir não duplica nem o objeto nem a linha. */
  fotoId: string
  itemId: string
  arquivo: File
  legenda: string | null
  /** Instante do aparelho na escolha da foto (ISO). */
  capturadaEm: string
  local: LocalDaFoto
}

export function caminhoDaFoto(consultoriaId: string, fotoId: string, tipo: string): string {
  const extensao = EXTENSAO_DA_FOTO[tipo as (typeof TIPOS_DE_FOTO)[number]]
  return `${consultoriaId}/vistoria/${fotoId}.${extensao}`
}

export async function adicionarFotoDaVistoria(foto: NovaFoto): Promise<void> {
  const supabase = obterSupabase()
  const caminho = caminhoDaFoto(foto.consultoriaId, foto.fotoId, foto.arquivo.type)
  const hash = await sha256(foto.arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, foto.arquivo, { contentType: foto.arquivo.type, upsert: false })
  if (envio.error && !objetoJaExiste(envio.error)) throw envio.error
  const { error } = await supabase.rpc('adicionar_foto_da_vistoria', {
    p_foto_id: foto.fotoId,
    p_item_id: foto.itemId,
    p_caminho: caminho,
    p_nome_original: foto.arquivo.name,
    p_sha256: hash,
    p_legenda: aceitaNulo(foto.legenda),
    p_capturada_em: foto.capturadaEm,
    p_latitude: aceitaNulo(foto.local.latitude),
    p_longitude: aceitaNulo(foto.local.longitude),
    p_precisao_m: aceitaNulo(foto.local.precisaoM),
    p_local_origem: foto.local.origem,
    p_local_manual: aceitaNulo(foto.local.localManual),
  })
  if (error) throw error
}

/** Devolve a nova row_version. Só iniciar, enviar, conferir e cancelar mudam a versão. */
export async function enviarVistoria(id: string, rowVersion: number): Promise<number> {
  const { data, error } = await obterSupabase().rpc('enviar_vistoria', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

export async function conferirVistoria(
  id: string,
  decisao: 'aprovada' | 'devolvida',
  motivo: string | null,
  rowVersion: number,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('conferir_vistoria', {
    p_id: id,
    p_decisao: decisao,
    p_motivo: aceitaNulo(motivo),
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}
