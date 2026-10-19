// Acesso a dados do épico 3 (carteira, empreendimento e unidades). Escrita só por RPC; leitura
// pela RLS de membro ativo. Erros sobem como vieram: a tela traduz com lib/erros.

import type { DataCivil, LicencaResumo } from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_EMPREENDIMENTOS = 50

export interface EmpreendimentoNaLista {
  id: string
  nome: string
  clienteNome: string | null
  cnpj: string | null
  unidades: number
  /** Licenças do empreendimento, para a situação mais urgente e a próxima validade (domínio). */
  licencas: LicencaResumo[]
}

function lerLicencas(valor: Json): LicencaResumo[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const situacao: LicencaResumo['situacao'] = item.situacao === 'ativo' ? 'ativo' : 'rascunho'
    return [
      {
        situacao,
        validade: typeof item.validade === 'string' ? (item.validade as DataCivil) : null,
        sigla: typeof item.sigla === 'string' ? item.sigla : null,
        antecedencia: typeof item.antecedencia === 'number' ? item.antecedencia : null,
        diasLimite: typeof item.dias_limite === 'number' ? item.dias_limite : null,
        protocoladoEm:
          typeof item.protocolado_em === 'string' ? (item.protocolado_em as DataCivil) : null,
      },
    ]
  })
}

export async function listarEmpreendimentos(
  consultoriaId: string,
  busca: string,
  pagina: number,
): Promise<{ itens: EmpreendimentoNaLista[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_empreendimentos', {
    p_consultoria_id: consultoriaId,
    p_busca: busca,
    p_limite: TAMANHO_PAGINA_EMPREENDIMENTOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_EMPREENDIMENTOS,
  })
  if (error) throw error
  return {
    itens: data.map((linha) => {
      // O gerador de tipos não marca colunas de função como anuláveis; estas podem vir nulas.
      const clienteNome: string | null = linha.cliente_nome
      const cnpj: string | null = linha.cnpj
      return {
        id: linha.id,
        nome: linha.nome,
        clienteNome,
        cnpj,
        unidades: linha.unidades,
        licencas: lerLicencas(linha.licencas),
      }
    }),
    total: data[0]?.total ?? 0,
  }
}

export interface Parecido {
  id: string
  nome: string
  mesmoNome: boolean
  mesmoCnpj: boolean
}

/** Possíveis duplicados (aviso, nunca bloqueio). `ignorar`: o próprio, ao editar. */
export async function buscarParecidos(
  consultoriaId: string,
  nome: string,
  cnpj: string,
  ignorar?: string,
): Promise<Parecido[]> {
  const { data, error } = await obterSupabase().rpc('empreendimentos_parecidos', {
    p_consultoria_id: consultoriaId,
    p_nome: nome,
    p_cnpj: cnpj,
    ...(ignorar ? { p_ignorar: ignorar } : {}),
  })
  if (error) throw error
  return data.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    mesmoNome: linha.mesmo_nome,
    mesmoCnpj: linha.mesmo_cnpj,
  }))
}

export interface DadosEmpreendimento {
  nome: string
  cliente: string
  cnpj: string
}

/** Cria com o id gerado na tela: repetir (clique duplo, rede instável) não duplica. */
export async function criarEmpreendimento(
  id: string,
  consultoriaId: string,
  dados: DadosEmpreendimento & { primeiraUnidade: string },
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_empreendimento', {
    p_id: id,
    p_consultoria_id: consultoriaId,
    p_nome: dados.nome,
    p_cliente: dados.cliente,
    p_cnpj: dados.cnpj,
    p_primeira_unidade: dados.primeiraUnidade,
  })
  if (error) throw error
  return data
}

export async function editarEmpreendimento(id: string, dados: DadosEmpreendimento): Promise<void> {
  const { error } = await obterSupabase().rpc('editar_empreendimento', {
    p_id: id,
    p_nome: dados.nome,
    p_cliente: dados.cliente,
    p_cnpj: dados.cnpj,
  })
  if (error) throw error
}

export interface Empreendimento {
  id: string
  nome: string
  clienteNome: string | null
  cnpj: string | null
}

/** `null` quando não existe ou não é da consultoria (a RLS devolve zero linhas, sem distinção). */
export async function obterEmpreendimento(id: string): Promise<Empreendimento | null> {
  const { data, error } = await obterSupabase()
    .from('empreendimento')
    .select('id, nome, cnpj, cliente:cliente!empreendimento_cliente_fk(nome)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    nome: data.nome,
    clienteNome: data.cliente?.nome ?? null,
    cnpj: data.cnpj,
  }
}

export interface Unidade {
  id: string
  nome: string
  endereco: string | null
}

export async function listarUnidades(empreendimentoId: string): Promise<Unidade[]> {
  const { data, error } = await obterSupabase()
    .from('unidade')
    .select('id, nome, endereco')
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em', { ascending: true })
    .order('id', { ascending: true })
    .range(0, 199)
  if (error) throw error
  return data
}

export async function criarUnidade(
  id: string,
  empreendimentoId: string,
  nome: string,
  endereco: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_unidade', {
    p_id: id,
    p_empreendimento_id: empreendimentoId,
    p_nome: nome,
    p_endereco: endereco,
  })
  if (error) throw error
  return data
}

export async function editarUnidade(id: string, nome: string, endereco: string): Promise<void> {
  const { error } = await obterSupabase().rpc('editar_unidade', {
    p_id: id,
    p_nome: nome,
    p_endereco: endereco,
  })
  if (error) throw error
}
