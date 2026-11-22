// Identidade da consultoria na proposta (ADR-0018, fatia 6; P8): razão social, CNPJ, contato, logo e
// texto de apresentação padrão. Uma por consultoria; só a Gestão lê e edita. A logo vai direto para
// o Storage como objeto novo em consultoria_id/consultoria/<uuid>.<ext> e vira versão pela RPC.

import { obterSupabase } from '@/lib/supabase'

import { objeto, texto } from './json'
import { sha256 } from './ocorrencias'
import { TIPOS_DE_FOTO } from './perfil'

const EXTENSOES: Record<(typeof TIPOS_DE_FOTO)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}
/** A URL assinada da logo vale 1 h; a proposta relê ao abrir. */
const VALIDADE_URL_LOGO = 60 * 60
export const FRESCOR_DA_URL_LOGO_MS = (VALIDADE_URL_LOGO - 5 * 60) * 1000

export function chaveDaLogoDaConsultoria(consultoriaId: string) {
  return ['logo-da-consultoria', consultoriaId] as const
}

async function assinarLogo(
  supabase: ReturnType<typeof obterSupabase>,
  caminho: string | null,
): Promise<string | null> {
  if (!caminho) return null
  const assinada = await supabase.storage
    .from('arquivos')
    .createSignedUrl(caminho, VALIDADE_URL_LOGO)
  return assinada.error ? null : assinada.data.signedUrl
}

export async function obterLogoDaConsultoria(consultoriaId: string): Promise<string | null> {
  const supabase = obterSupabase()
  const { data, error } = await supabase.rpc('obter_logo_da_consultoria', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return assinarLogo(supabase, data)
}

export interface IdentidadeDaConsultoria {
  razaoSocial: string
  /** Só dígitos (ou o CNPJ alfanumérico), como o banco guarda. */
  cnpj: string
  endereco: string
  telefone: string
  email: string
  site: string
  textoApresentacao: string
  /** URL assinada da logo; nula sem logo (ou se o Storage falhar: a proposta segue sem ela). */
  logoUrl: string | null
  /** Zero enquanto nunca foi salva. */
  rowVersion: number
}

export type DadosDaIdentidade = Omit<IdentidadeDaConsultoria, 'logoUrl' | 'rowVersion'>

export const IDENTIDADE_VAZIA: IdentidadeDaConsultoria = {
  razaoSocial: '',
  cnpj: '',
  endereco: '',
  telefone: '',
  email: '',
  site: '',
  textoApresentacao: '',
  logoUrl: null,
  rowVersion: 0,
}

/** Nunca salva: devolve a identidade vazia (versão 0). */
export async function obterIdentidade(consultoriaId: string): Promise<IdentidadeDaConsultoria> {
  const supabase = obterSupabase()
  const { data, error } = await supabase.rpc('obter_identidade_da_consultoria', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const i = objeto(data)
  if (!i) return IDENTIDADE_VAZIA
  return {
    razaoSocial: texto(i.razao_social),
    cnpj: texto(i.cnpj),
    endereco: texto(i.endereco),
    telefone: texto(i.telefone),
    email: texto(i.email),
    site: texto(i.site),
    textoApresentacao: texto(i.texto_apresentacao),
    logoUrl: await assinarLogo(supabase, texto(i.logo_caminho)),
    rowVersion: typeof i.row_version === 'number' ? i.row_version : 0,
  }
}

export async function salvarIdentidade(
  consultoriaId: string,
  rowVersion: number,
  dados: DadosDaIdentidade,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_identidade_da_consultoria', {
    p_consultoria_id: consultoriaId,
    p_row_version: rowVersion,
    p_dados: {
      razao_social: dados.razaoSocial,
      cnpj: dados.cnpj,
      endereco: dados.endereco,
      telefone: dados.telefone,
      email: dados.email,
      site: dados.site,
      texto_apresentacao: dados.textoApresentacao,
    },
  })
  if (error) throw error
  return data
}

/** Envia a imagem como objeto novo e registra como logo. Cada envio é uma versão nova. */
export async function enviarLogo(consultoriaId: string, arquivo: File): Promise<void> {
  const supabase = obterSupabase()
  const tipo = arquivo.type as (typeof TIPOS_DE_FOTO)[number]
  const versaoId = crypto.randomUUID()
  const caminho = `${consultoriaId}/consultoria/${versaoId}.${EXTENSOES[tipo]}`
  const hash = await sha256(arquivo)
  const envio = await supabase.storage
    .from('arquivos')
    .upload(caminho, arquivo, { contentType: tipo, upsert: false })
  if (envio.error) throw envio.error
  const { error } = await supabase.rpc('registrar_logo_da_consultoria', {
    p_consultoria_id: consultoriaId,
    p_versao_id: versaoId,
    p_caminho: caminho,
    p_nome_original: arquivo.name,
    p_sha256: hash,
  })
  if (error) throw error
}

export async function removerLogo(consultoriaId: string): Promise<void> {
  const { error } = await obterSupabase().rpc('remover_logo_da_consultoria', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
}
