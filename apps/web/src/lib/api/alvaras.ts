// Alvará simples (ALV-01 e ALV-02). Leitura pela RLS; escrita só pelas RPCs, da Gestão. Renovar é
// registrar um alvará novo ligado ao anterior: o anterior continua guardado, com o PDF.

import { idsRenovados, type DataCivil } from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { sha256 } from '@/lib/api/ocorrencias'
import { obterSupabase } from '@/lib/supabase'

export interface Alvara {
  id: string
  rowVersion: number
  unidadeId: string
  unidadeNome: string
  numero: string | null
  orgao: string | null
  notas: string | null
  validade: DataCivil
  anteriorId: string | null
  /** Já existe um alvará novo ligado a este (renovação). */
  renovado: boolean
  pdf: { caminho: string; nome: string } | null
}

interface LinhaDeAlvara {
  id: string
  row_version: number
  unidade_id: string
  numero: string | null
  orgao: string | null
  notas: string | null
  validade: string
  anterior_id: string | null
  unidade: { nome: string } | null
  documento: { versao: { caminho: string; nome_original: string } | null } | null
}

const COLUNAS = `id, row_version, unidade_id, numero, orgao, notas, validade, anterior_id,
  unidade:unidade!alvara_unidade_fk(nome),
  documento:documento!alvara_documento_fk(versao:documento_versao!documento_versao_vigente_fk(caminho, nome_original))`

/** Alvarás do empreendimento (não excluídos), do mais novo para o mais antigo. */
export async function listarAlvarasDoEmpreendimento(empreendimentoId: string): Promise<Alvara[]> {
  const { data, error } = await obterSupabase()
    .from('alvara')
    .select(COLUNAS)
    .eq('empreendimento_id', empreendimentoId)
    .is('excluido_em', null)
    .order('validade', { ascending: false })
    .range(0, 199)
  if (error) throw error
  const linhas = data as unknown as LinhaDeAlvara[]
  const renovados = idsRenovados(linhas.map((l) => ({ id: l.id, anteriorId: l.anterior_id })))
  return linhas.map((l) => ({
    id: l.id,
    rowVersion: l.row_version,
    unidadeId: l.unidade_id,
    unidadeNome: l.unidade?.nome ?? '',
    numero: l.numero,
    orgao: l.orgao,
    notas: l.notas,
    validade: l.validade as DataCivil,
    anteriorId: l.anterior_id,
    renovado: renovados.has(l.id),
    pdf: l.documento?.versao
      ? { caminho: l.documento.versao.caminho, nome: l.documento.versao.nome_original }
      : null,
  }))
}

export interface DadosDoAlvara {
  validade: DataCivil
  numero: string
  orgao: string
  notas: string
}

/**
 * Envia o PDF como objeto novo em consultoria_id/alvara/<uuid>.pdf e registra o alvará (novo ou
 * renovação). `versaoId` vem da tela: repetir depois de erro de rede devolve o mesmo alvará.
 */
export async function registrarAlvara(
  consultoriaId: string,
  versaoId: string,
  unidadeId: string,
  dados: DadosDoAlvara,
  arquivo: File,
  anteriorId: string | null,
): Promise<string> {
  const supabase = obterSupabase()
  const caminho = `${consultoriaId}/alvara/${versaoId}.pdf`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false })
  // Objeto já enviado numa tentativa anterior: segue para o registro.
  if (envio.error && !envio.error.message.toLowerCase().includes('exists')) throw envio.error
  const { data, error } = await supabase.rpc('registrar_alvara', {
    p_unidade_id: unidadeId,
    p_validade: dados.validade,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
    p_numero: dados.numero,
    p_orgao: dados.orgao,
    p_notas: dados.notas,
    p_anterior_id: aceitaNulo(anteriorId),
  })
  if (error) throw error
  return data
}

export async function editarAlvara(
  alvara: Pick<Alvara, 'id' | 'rowVersion'>,
  dados: DadosDoAlvara,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('editar_alvara', {
    p_alvara_id: alvara.id,
    p_row_version: alvara.rowVersion,
    p_validade: dados.validade,
    p_numero: dados.numero,
    p_orgao: dados.orgao,
    p_notas: dados.notas,
  })
  if (error) throw error
  return data
}

export async function excluirAlvara(alvara: Pick<Alvara, 'id' | 'rowVersion'>): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_alvara', {
    p_alvara_id: alvara.id,
    p_row_version: alvara.rowVersion,
  })
  if (error) throw error
}
