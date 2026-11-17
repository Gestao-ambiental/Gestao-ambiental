// Registro profissional do membro: o registro no conselho de cada profissão concluída da pessoa
// (ADR-0021). A pessoa informa o próprio; a Gestão confirma ou recusa (recusar = remover). Escrita só
// pelas RPCs; a situação (confirmado, aguardando, vencido) é calculada no domínio.

import {
  conselhoDoCodigo,
  profissaoDoCodigo,
  type CodigoConselho,
  type CodigoProfissao,
  type DataCivil,
} from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import { obterSupabase } from '@/lib/supabase'

export interface RegistroProfissional {
  id: string
  rowVersion: number
  membroId: string
  profissao: CodigoProfissao
  conselho: CodigoConselho
  numero: string
  uf: string | null
  validoAte: DataCivil | null
  confirmado: boolean
}

export interface RegistroAConfirmar extends RegistroProfissional {
  membroNome: string
}

interface LinhaDeRegistro {
  id: string
  row_version: number
  membro_id: string
  profissao: string
  conselho: string
  numero: string
  uf: string | null
  valido_ate: string | null
  confirmado_em: string | null
}

const COLUNAS =
  'id, row_version, membro_id, profissao, conselho, numero, uf, valido_ate, confirmado_em'

/** Linha do banco no formato da tela; código fora das listas (não deveria haver) fica de fora. */
function daLinha(linha: LinhaDeRegistro): RegistroProfissional | null {
  const profissao = profissaoDoCodigo(linha.profissao)
  const conselho = conselhoDoCodigo(linha.conselho)
  if (!profissao || !conselho) return null
  return {
    id: linha.id,
    rowVersion: linha.row_version,
    membroId: linha.membro_id,
    profissao,
    conselho,
    numero: linha.numero,
    uf: linha.uf,
    validoAte: linha.valido_ate as DataCivil | null,
    confirmado: linha.confirmado_em !== null,
  }
}

/** Registros em vigor de um membro (os removidos ficam fora). */
export async function listarRegistrosDoMembro(membroId: string): Promise<RegistroProfissional[]> {
  const { data, error } = await obterSupabase()
    .from('registro_profissional')
    .select(COLUNAS)
    .eq('membro_id', membroId)
    .is('removido_em', null)
    .order('declarado_em')
    .range(0, 99)
  if (error) throw error
  return (data as LinhaDeRegistro[]).flatMap((linha) => daLinha(linha) ?? [])
}

/** Registros aguardando a Gestão, de membros ativos, dos mais antigos para os mais novos. */
export async function listarRegistrosAConfirmar(
  consultoriaId: string,
): Promise<RegistroAConfirmar[]> {
  const { data, error } = await obterSupabase()
    .from('registro_profissional')
    .select(`${COLUNAS}, membro:membro!registro_profissional_membro_fk(nome, situacao)`)
    .eq('consultoria_id', consultoriaId)
    .is('confirmado_em', null)
    .is('removido_em', null)
    .order('declarado_em')
    .range(0, 99)
  if (error) throw error
  const linhas = data as (LinhaDeRegistro & {
    membro: { nome: string; situacao: string } | null
  })[]
  return linhas.flatMap((linha) => {
    const registro = daLinha(linha)
    if (!registro || linha.membro?.situacao !== 'ativo') return []
    return [{ ...registro, membroNome: linha.membro.nome }]
  })
}

export async function declararRegistroProfissional(dados: {
  membroId: string
  profissao: CodigoProfissao
  conselho: CodigoConselho
  numero: string
  uf: string | null
  validoAte: DataCivil | null
}): Promise<string> {
  const { data, error } = await obterSupabase().rpc('declarar_registro_profissional', {
    p_membro_id: dados.membroId,
    p_profissao: dados.profissao,
    p_conselho: dados.conselho,
    p_numero: dados.numero,
    p_uf: aceitaNulo(dados.uf),
    p_valido_ate: aceitaNulo(dados.validoAte),
  })
  if (error) throw error
  return data
}

export async function confirmarRegistroProfissional(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('confirmar_registro_profissional', {
    p_registro_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

export async function removerRegistroProfissional(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('remover_registro_profissional', {
    p_registro_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/** Cadastro Técnico Federal do Ibama (a própria pessoa ou a Gestão). Número vazio limpa. */
export async function definirCadastroFederal(
  membroId: string,
  numero: string,
  validoAte: DataCivil | null,
): Promise<void> {
  const { error } = await obterSupabase().rpc('definir_cadastro_federal', {
    p_membro_id: membroId,
    p_numero: numero,
    p_valido_ate: aceitaNulo(validoAte),
  })
  if (error) throw error
}
