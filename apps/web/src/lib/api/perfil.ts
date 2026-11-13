// Perfil do membro: profissão, cargo e foto (o seletor de responsável mostra quem é quem). Profissão
// e cargo são códigos das listas fixas do Grama (ADR-0021). Cargo e foto vivem
// no vínculo (membro). A foto vai direto para o Storage como objeto novo em
// consultoria_id/membro/<uuid>.<ext> e vira versão pela RPC, que confere caminho, MIME e tamanho.

import {
  cargoDoCodigo,
  profissaoDoCodigo,
  rotuloDoCargo,
  type CodigoCargo,
  type CodigoProfissao,
  type PapelMembro,
} from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

import { sha256 } from './ocorrencias'

export const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024
export const TIPOS_DE_FOTO = ['image/png', 'image/jpeg'] as const
const EXTENSOES: Record<(typeof TIPOS_DE_FOTO)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}
/** A URL assinada da foto vale 6 h; a lista de membros é relida bem antes disso. */
const VALIDADE_URL_FOTO = 6 * 60 * 60

export interface MembroAtivo {
  id: string
  nome: string
  papel: PapelMembro | null
  /** Para exibir: o cargo da lista ou, sem ele, o cargo digitado antes. */
  cargo: string | null
  cargoCodigo: CodigoCargo | null
  /** Cargo digitado antes da lista fixa (ADR-0021), até o de-para. */
  cargoAntigo: string | null
  profissao: CodigoProfissao | null
  /** URL assinada da foto; null mostra as iniciais. */
  fotoUrl: string | null
}

interface LinhaMembro {
  id: string
  nome: string
  papel?: PapelMembro | null
  cargo?: string | null
  cargo_antigo?: string | null
  profissao?: string | null
  foto?: { excluido_em: string | null; versao: { caminho: string } | null } | null
}

const COLUNAS_MEMBRO = `id, nome, papel, cargo, cargo_antigo, profissao,
  foto:documento!membro_foto_fk(excluido_em, versao:documento_versao!documento_versao_vigente_fk(caminho))`

function caminhoDaFoto(linha: LinhaMembro): string | null {
  const foto = linha.foto
  if (!foto || foto.excluido_em) return null
  return foto.versao?.caminho ?? null
}

/** Troca o caminho de cada foto por uma URL assinada, numa chamada só. */
async function comFotos(linhas: readonly LinhaMembro[]): Promise<MembroAtivo[]> {
  const caminhos = linhas.map(caminhoDaFoto).filter((c): c is string => c !== null)
  const urls = new Map<string, string>()
  if (caminhos.length > 0) {
    const { data, error } = await obterSupabase()
      .storage.from('arquivos')
      .createSignedUrls(caminhos, VALIDADE_URL_FOTO)
    // Sem a foto, o avatar mostra as iniciais: não vale derrubar a tela por isso.
    if (!error) {
      for (const item of data) {
        if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
      }
    }
  }
  return linhas.map((linha) => {
    const caminho = caminhoDaFoto(linha)
    return {
      id: linha.id,
      nome: linha.nome,
      papel: linha.papel ?? null,
      ...profissaoECargo(linha),
      fotoUrl: caminho ? (urls.get(caminho) ?? null) : null,
    }
  })
}

export async function listarMembrosAtivos(consultoriaId: string): Promise<MembroAtivo[]> {
  const { data, error } = await obterSupabase()
    .from('membro')
    .select(COLUNAS_MEMBRO)
    .eq('consultoria_id', consultoriaId)
    .eq('situacao', 'ativo')
    .order('nome')
    .range(0, 199)
  if (error) throw error
  return comFotos(data)
}

/** O próprio vínculo (membro) nesta consultoria, com cargo e foto. */
export async function meuPerfil(membroId: string): Promise<MembroAtivo> {
  const { data, error } = await obterSupabase()
    .from('membro')
    .select(COLUNAS_MEMBRO)
    .eq('id', membroId)
    .maybeSingle()
  if (error) throw error
  const [membro] = data ? await comFotos([data]) : []
  if (!membro) throw new Error('sem_permissao')
  return membro
}

/** Profissão e cargo do membro, lidos das colunas; código desconhecido fica nulo. */
export function profissaoECargo(linha: {
  cargo?: string | null
  cargo_antigo?: string | null
  profissao?: string | null
}): Pick<MembroAtivo, 'cargo' | 'cargoCodigo' | 'cargoAntigo' | 'profissao'> {
  const cargoCodigo = cargoDoCodigo(linha.cargo)
  const cargoAntigo = linha.cargo_antigo ?? null
  return {
    cargo: cargoCodigo ? rotuloDoCargo(cargoCodigo) : cargoAntigo,
    cargoCodigo,
    cargoAntigo,
    profissao: profissaoDoCodigo(linha.profissao),
  }
}

/** A própria pessoa ou a Gestão. Nulo limpa. */
export async function definirProfissaoECargo(
  membroId: string,
  profissao: CodigoProfissao | null,
  cargo: CodigoCargo | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('definir_profissao_e_cargo', {
    p_membro_id: membroId,
    p_profissao: profissao,
    p_cargo: cargo,
  })
  if (error) throw error
}

export type ProblemaDaFoto = 'tipo' | 'vazio' | 'grande_demais'

/** PNG ou JPEG, até 2 MB. */
export function conferirFoto(arquivo: File): ProblemaDaFoto | null {
  if (!(TIPOS_DE_FOTO as readonly string[]).includes(arquivo.type)) return 'tipo'
  if (arquivo.size === 0) return 'vazio'
  return arquivo.size > TAMANHO_MAXIMO_FOTO ? 'grande_demais' : null
}

/** Envia a imagem como objeto novo e registra como foto. Cada envio é uma versão nova. */
export async function enviarFoto(
  membro: { id: string; consultoriaId: string },
  arquivo: File,
): Promise<void> {
  const supabase = obterSupabase()
  const tipo = arquivo.type as (typeof TIPOS_DE_FOTO)[number]
  const versaoId = crypto.randomUUID()
  const caminho = `${membro.consultoriaId}/membro/${versaoId}.${EXTENSOES[tipo]}`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: tipo, upsert: false })
  if (envio.error) throw envio.error
  const { error } = await supabase.rpc('registrar_foto_membro', {
    p_membro_id: membro.id,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
  })
  if (error) throw error
}

export async function removerFoto(membroId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('remover_foto_membro', { p_membro_id: membroId })
  if (error) throw error
}
