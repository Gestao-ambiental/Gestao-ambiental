// Atividades do empreendimento pela triagem CONSEMA 250/2024 (ADR-0050, LEG-05). A triagem grava no
// empreendimento quando ainda não há licença (ou a Gestão prefere): escrita só pela RPC
// gravar_atividades_no_empreendimento (só Gestão), que inclui ou atualiza pelo código e nunca apaga.
// A leitura junta as gravadas no empreendimento e nas licenças dele (RLS decide o que se vê).

import type { Porte, Potencial } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

import type { AtividadeParaGravar } from './atividades-da-licenca'

/** De onde veio a atividade: gravada no empreendimento ou numa licença dele. */
export type OrigemDaAtividade = 'empreendimento' | 'licenca'

export interface AtividadeDoEmpreendimento {
  codigo: string
  descricao: string
  porte: Porte
  potencial: Potencial
  origem: OrigemDaAtividade
  /** Licença de onde veio (origem 'licenca'); nulo quando gravada no empreendimento. */
  instrumentoId: string | null
  registradoEm: string
}

const PORTES: readonly Porte[] = ['minimo', 'pequeno', 'medio', 'grande', 'unico']
const POTENCIAIS: readonly Potencial[] = ['P', 'M', 'G']

function comoPorte(valor: string): Porte {
  const porte = PORTES.find((p) => p === valor)
  if (!porte) throw new Error(`Porte desconhecido: ${valor}`)
  return porte
}

function comoPotencial(valor: string): Potencial {
  const potencial = POTENCIAIS.find((p) => p === valor)
  if (!potencial) throw new Error(`Potencial desconhecido: ${valor}`)
  return potencial
}

function comoOrigem(valor: string): OrigemDaAtividade {
  if (valor === 'empreendimento' || valor === 'licenca') return valor
  throw new Error(`Origem desconhecida: ${valor}`)
}

/** Atividades do empreendimento e das licenças dele, por código (qualquer membro). */
export async function listarAtividadesDoEmpreendimento(
  consultoriaId: string,
  empreendimentoId: string,
): Promise<AtividadeDoEmpreendimento[]> {
  const { data, error } = await obterSupabase().rpc('listar_atividades_do_empreendimento', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
  })
  if (error) throw error
  return data.map((a) => ({
    codigo: a.codigo,
    descricao: a.descricao,
    porte: comoPorte(a.porte),
    potencial: comoPotencial(a.potencial),
    origem: comoOrigem(a.origem),
    instrumentoId: a.instrumento_id,
    registradoEm: a.registrado_em,
  }))
}

/** Grava as atividades no empreendimento (só Gestão). Devolve quantas ele tem depois. */
export async function gravarAtividadesNoEmpreendimento(
  consultoriaId: string,
  empreendimentoId: string,
  atividades: readonly AtividadeParaGravar[],
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('gravar_atividades_no_empreendimento', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
    p_atividades: atividades.map((a) => ({
      codigo: a.codigo,
      descricao: a.descricao,
      porte: a.porte,
      potencial: a.potencial,
      medidas: a.medidas,
      fonte: a.fonte,
    })),
  })
  if (error) throw error
  return data
}
