// Atividades da licença pela triagem CONSEMA 250/2024 (ADR-0044). Leitura por qualquer membro (RLS);
// escrita só pela RPC gravar_atividades_na_licenca (só Gestão), que inclui ou atualiza pelo código e
// nunca apaga atividade já gravada.

import type { Porte, Potencial } from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export interface AtividadeParaGravar {
  codigo: string
  descricao: string
  porte: Porte
  potencial: Potencial
  /** Sigla do parâmetro (Anexo VII) → valor numérico ≥ 0, como lido na triagem. */
  medidas: Record<string, number>
  /** Catálogo usado (CATALOGO_CONSEMA_250.fonte). */
  fonte: string
}

export interface AtividadeGravada extends AtividadeParaGravar {
  id: string
  registradoEm: string
  rowVersion: number
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

/** O banco garante um objeto de números; aqui só confere a forma antes de usar. */
function comoMedidas(valor: Json): Record<string, number> {
  const medidas: Record<string, number> = {}
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return medidas
  for (const [sigla, numero] of Object.entries(valor)) {
    if (typeof numero === 'number' && Number.isFinite(numero)) medidas[sigla] = numero
  }
  return medidas
}

export async function listarAtividadesDaLicenca(
  instrumentoId: string,
): Promise<AtividadeGravada[]> {
  const { data, error } = await obterSupabase()
    .from('atividade_licenciada')
    .select('id,codigo,descricao,porte,potencial,medidas,fonte,registrado_em,row_version')
    .eq('instrumento_id', instrumentoId)
    .order('codigo')
  if (error) throw error
  return data.map((a) => ({
    id: a.id,
    codigo: a.codigo,
    descricao: a.descricao,
    porte: comoPorte(a.porte),
    potencial: comoPotencial(a.potencial),
    medidas: comoMedidas(a.medidas),
    fonte: a.fonte,
    registradoEm: a.registrado_em,
    rowVersion: a.row_version,
  }))
}

/** Grava as atividades na licença (só Gestão). Devolve quantas a licença tem depois. */
export async function gravarAtividadesNaLicenca(
  consultoriaId: string,
  instrumentoId: string,
  atividades: readonly AtividadeParaGravar[],
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('gravar_atividades_na_licenca', {
    p_consultoria_id: consultoriaId,
    p_instrumento_id: instrumentoId,
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
