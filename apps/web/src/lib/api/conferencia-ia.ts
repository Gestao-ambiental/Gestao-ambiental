// Conferência do relatório por IA (ADR-0036, fatia 3). A tela lê a tabela conferencia_ia (RLS:
// membro ativo) e pede a conferência à Edge Function conferir-relatorio, que confere o plano, a
// cota e quem pode pedir. A IA só aponta; quem decide é a Gestão.
import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

export type CategoriaDoApontamento =
  'empreendimento' | 'licenca' | 'condicionante' | 'datas' | 'consistencia' | 'escrita'

export interface Apontamento {
  origem: 'regra' | 'ia'
  categoria: CategoriaDoApontamento
  gravidade: 'corrigir' | 'verificar'
  trecho: string
  problema: string
  sugestao: string
  /** Texto exato que troca o trecho ("Aplicar sugestão"); vazio quando não há troca direta. */
  substituicao: string
}

export interface ConferenciaIa {
  id: string
  evidenciaId: string
  situacao: 'em_andamento' | 'concluida' | 'falhou'
  motivo: string | null
  resumo: string | null
  apontamentos: Apontamento[]
  iniciadaEm: string
}

const CATEGORIAS = new Set<string>([
  'empreendimento',
  'licenca',
  'condicionante',
  'datas',
  'consistencia',
  'escrita',
])

function lerApontamentos(valor: unknown): Apontamento[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item): Apontamento[] => {
    if (typeof item !== 'object' || item === null) return []
    const a = item as Record<string, unknown>
    if (typeof a.problema !== 'string' || !CATEGORIAS.has(String(a.categoria))) return []
    return [
      {
        origem: a.origem === 'regra' ? 'regra' : 'ia',
        categoria: a.categoria as CategoriaDoApontamento,
        gravidade: a.gravidade === 'corrigir' ? 'corrigir' : 'verificar',
        trecho: typeof a.trecho === 'string' ? a.trecho : '',
        problema: a.problema,
        sugestao: typeof a.sugestao === 'string' ? a.sugestao : '',
        substituicao: typeof a.substituicao === 'string' ? a.substituicao : '',
      },
    ]
  })
}

/** A conferência mais recente de cada evidência (as que falharam antes ficam de histórico). */
export async function listarConferenciasIa(
  evidenciaIds: readonly string[],
): Promise<Map<string, ConferenciaIa>> {
  const resultado = new Map<string, ConferenciaIa>()
  if (evidenciaIds.length === 0) return resultado
  const { data, error } = await obterSupabase()
    .from('conferencia_ia')
    .select('id, evidencia_id, situacao, motivo, resumo, apontamentos, iniciada_em')
    .in('evidencia_id', [...evidenciaIds])
    .order('iniciada_em', { ascending: false })
    .range(0, 199)
  if (error) throw error
  for (const c of data) {
    if (resultado.has(c.evidencia_id)) continue
    resultado.set(c.evidencia_id, {
      id: c.id,
      evidenciaId: c.evidencia_id,
      situacao: c.situacao as ConferenciaIa['situacao'],
      motivo: c.motivo,
      resumo: c.resumo,
      apontamentos: lerApontamentos(c.apontamentos),
      iniciadaEm: c.iniciada_em,
    })
  }
  return resultado
}

/** O que conferir: a evidência anexada ou uma versão do relatório escrito no Grama. */
export type AlvoDaConferencia = { evidenciaId: string } | { relatorioId: string; versao: number }

/** Pede a conferência. Repetir só devolve a situação (a função não chama a IA de novo). */
export async function pedirConferenciaIa(alvo: AlvoDaConferencia): Promise<void> {
  const resposta = await obterSupabase().functions.invoke('conferir-relatorio', {
    body: { conferenciaId: crypto.randomUUID(), ...alvo },
  })
  const error: unknown = resposta.error
  if (!error) return
  if (error instanceof FunctionsHttpError) {
    const corpo = (await (error.context as Response).json().catch(() => ({}))) as {
      erro?: string
    }
    throw new Error(corpo.erro ?? 'erro_interno')
  }
  throw new Error('ia_indisponivel')
}
