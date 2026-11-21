// Painel do dono (P8, ADR-0054): leituras só da Gestão; dinheiro só com a permissão financeira.
import type { ClienteEmRisco } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export async function listarClientesEmRisco(consultoriaId: string): Promise<ClienteEmRisco[]> {
  const { data, error } = await obterSupabase().rpc('painel_clientes_em_risco', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data.map((l) => ({
    chave: l.chave,
    nome: l.nome,
    prazosAtrasados: l.prazos_atrasados,
    laoAlemDoLimite: l.lao_alem_do_limite,
    laoPertoDoLimite: l.lao_perto_do_limite,
    vencimentosVencidos: l.vencimentos_vencidos,
    receberVencidoCentavos: l.receber_vencido_centavos,
    aprovadoCentavos: l.aprovado_centavos,
  }))
}

export interface CargaDaPessoa {
  membroId: string | null
  nome: string | null
  prazos: number
  atrasados: number
  minutosTarefas: number
}

export async function listarCarga(consultoriaId: string): Promise<CargaDaPessoa[]> {
  const { data, error } = await obterSupabase().rpc('painel_carga', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data.map((l) => ({
    membroId: l.membro_id,
    nome: l.nome,
    prazos: l.prazos,
    atrasados: l.atrasados,
    minutosTarefas: l.minutos_tarefas,
  }))
}

export interface DinheiroDoCliente {
  chave: string
  nome: string
  aprovadoCentavos: number
  recebidoCentavos: number
  aReceberCentavos: number
  vencidoCentavos: number
}

export async function listarDinheiroPorCliente(
  consultoriaId: string,
): Promise<DinheiroDoCliente[]> {
  const { data, error } = await obterSupabase().rpc('painel_dinheiro_por_cliente', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  return data.map((l) => ({
    chave: l.chave,
    nome: l.nome,
    aprovadoCentavos: l.aprovado_centavos,
    recebidoCentavos: l.recebido_centavos,
    aReceberCentavos: l.a_receber_centavos,
    vencidoCentavos: l.vencido_centavos,
  }))
}
