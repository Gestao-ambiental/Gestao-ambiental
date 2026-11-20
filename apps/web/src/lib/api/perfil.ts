// Perfil do membro: profissão, cargo e foto (o seletor de responsável mostra quem é quem). Profissão
// e cargo são códigos das listas fixas do Grama (ADR-0021). Cargo e foto vivem
// no vínculo (membro). A foto vai direto para o Storage como objeto novo em
// consultoria_id/membro/<uuid>.<ext> e vira versão pela RPC, que confere caminho, MIME e tamanho.

import {
  cargoDoCodigo,
  generoDoCodigo,
  outrasProfissoes,
  profissaoDoCodigo,
  rotuloDoCargo,
  type CodigoCargo,
  type CodigoProfissao,
  type DataCivil,
  type GeneroDaPessoa,
  type PapelMembro,
} from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
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
  /** Profissão principal: a que aparece no orçamento e na Equipe. */
  profissao: CodigoProfissao | null
  /** A principal ainda em curso (estudante): junto do nome vira "Estudante de …". */
  profissaoEmCurso: boolean
  /** Outras formações concluídas, além da principal (ADR-0021 §6). */
  outrasProfissoes: CodigoProfissao[]
  /** Gênero da própria pessoa: só muda a forma da profissão junto do nome. Nulo: não informado. */
  genero: GeneroDaPessoa | null
  /** URL assinada da foto; null mostra as iniciais. */
  fotoUrl: string | null
  /** Cadastro Técnico Federal do Ibama: número (só dígitos) e validade. */
  ctfNumero: string | null
  ctfValidoAte: DataCivil | null
}

interface LinhaMembro {
  id: string
  nome: string
  papel?: PapelMembro | null
  cargo?: string | null
  cargo_antigo?: string | null
  profissao?: string | null
  /** O gerador tipa a lista de enum como unknown[]; o domínio filtra os códigos válidos. */
  outras_profissoes?: readonly unknown[] | null
  profissao_em_curso?: boolean | null
  genero?: string | null
  ctf_numero?: string | null
  ctf_valido_ate?: string | null
  foto?: { excluido_em: string | null; versao: { caminho: string } | null } | null
}

const COLUNAS_MEMBRO = `id, nome, papel, cargo, cargo_antigo, profissao, outras_profissoes, profissao_em_curso, genero, ctf_numero, ctf_valido_ate,
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
      genero: generoDoCodigo(linha.genero),
      fotoUrl: caminho ? (urls.get(caminho) ?? null) : null,
      ctfNumero: linha.ctf_numero ?? null,
      ctfValidoAte: (linha.ctf_valido_ate ?? null) as DataCivil | null,
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
  outras_profissoes?: readonly unknown[] | null
  profissao_em_curso?: boolean | null
}): Pick<
  MembroAtivo,
  'cargo' | 'cargoCodigo' | 'cargoAntigo' | 'profissao' | 'profissaoEmCurso' | 'outrasProfissoes'
> {
  const cargoCodigo = cargoDoCodigo(linha.cargo)
  const cargoAntigo = linha.cargo_antigo ?? null
  const profissao = profissaoDoCodigo(linha.profissao)
  return {
    cargo: cargoCodigo ? rotuloDoCargo(cargoCodigo) : cargoAntigo,
    cargoCodigo,
    cargoAntigo,
    profissao,
    // Sem profissão não há o que estar cursando.
    profissaoEmCurso: profissao !== null && linha.profissao_em_curso === true,
    outrasProfissoes: outrasProfissoes(profissao, linha.outras_profissoes ?? []),
  }
}

// ---------------------------------------------------------------------------
// Cadastro da pessoa: formação (profissão principal) e gênero
// ---------------------------------------------------------------------------

/** O que a conta precisa ter no vínculo atual antes de usar o sistema. */
export interface CadastroDaPessoa {
  profissao: CodigoProfissao | null
  /** A formação ainda em curso. Não conta para o cadastro estar completo. */
  emCurso: boolean
  genero: GeneroDaPessoa | null
}

/** Colunas lidas para saber se o cadastro está completo (o cliente falso dos testes as reconhece). */
export const COLUNAS_CADASTRO = 'profissao, profissao_em_curso, genero'

/** Formação e gênero do próprio vínculo. */
export async function meuCadastro(membroId: string): Promise<CadastroDaPessoa> {
  const { data, error } = await obterSupabase()
    .from('membro')
    .select(COLUNAS_CADASTRO)
    .eq('id', membroId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('sem_permissao')
  return {
    profissao: profissaoDoCodigo(data.profissao),
    emCurso: data.profissao_em_curso,
    genero: generoDoCodigo(data.genero),
  }
}

export function cadastroCompleto(cadastro: CadastroDaPessoa): boolean {
  return cadastro.profissao !== null && cadastro.genero !== null
}

/**
 * Grava a formação principal (e se ainda está cursando) e o gênero em todos os vínculos ativos da
 * pessoa logada.
 */
export async function completarCadastro(
  profissao: CodigoProfissao,
  genero: GeneroDaPessoa,
  emCurso: boolean,
): Promise<void> {
  const { error } = await obterSupabase().rpc('completar_cadastro', {
    p_profissao: profissao,
    p_genero: genero,
    p_em_curso: emCurso,
  })
  if (error) throw error
}

/** Só o gênero, em todos os vínculos ativos da pessoa logada (ninguém muda o gênero de outra). */
export async function definirMeuGenero(genero: GeneroDaPessoa): Promise<void> {
  const { error } = await obterSupabase().rpc('definir_meu_genero', { p_genero: genero })
  if (error) throw error
}

/**
 * A própria pessoa ou a Gestão. Nulo na principal ou no cargo limpa; sem `outras` ou sem `emCurso`,
 * as outras formações e o "ainda cursando" ficam como estão.
 */
export async function definirProfissaoECargo(
  membroId: string,
  profissao: CodigoProfissao | null,
  cargo: CodigoCargo | null,
  outras?: readonly CodigoProfissao[],
  emCurso?: boolean,
): Promise<void> {
  const { error } = await obterSupabase().rpc('definir_profissao_e_cargo', {
    p_membro_id: membroId,
    p_profissao: aceitaNulo(profissao),
    p_cargo: aceitaNulo(cargo),
    ...(outras ? { p_outras_profissoes: [...outras] } : {}),
    ...(emCurso === undefined ? {} : { p_profissao_em_curso: emCurso }),
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
