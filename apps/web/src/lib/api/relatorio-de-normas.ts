// Leituras do relatório e do painel das normas (ADR-0050, LEG-10): requisitos de toda a consultoria
// (quadro Conformidade), mudanças que alcançaram um empreendimento (relatório) e normas citadas no
// texto de uma condicionante (base legal).

import type { DataCivil, RequisitoDoEmpreendimento } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

const PAGINA = 500

function anulavel<T>(valor: T | null | undefined): T | null {
  return valor ?? null
}

/** Todos os requisitos da consultoria (páginas de 500 até o total). */
export async function listarRequisitosDaConsultoria(
  consultoriaId: string,
): Promise<RequisitoDoEmpreendimento[]> {
  const todos: RequisitoDoEmpreendimento[] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await obterSupabase().rpc('listar_requisitos_da_consultoria', {
      p_consultoria_id: consultoriaId,
      p_limite: PAGINA,
      p_deslocamento: pagina * PAGINA,
    })
    if (error) throw error
    for (const l of data) {
      todos.push({
        empreendimentoId: l.empreendimento_id,
        empreendimentoNome: l.empreendimento_nome,
        aplicavel: anulavel(l.aplicavel),
        avaliacaoResultado:
          l.avaliacao_resultado === 'conforme' || l.avaliacao_resultado === 'nao_conforme'
            ? l.avaliacao_resultado
            : null,
        avaliadaEm: anulavel(l.avaliada_em) as DataCivil | null,
        ultimaMudancaPublicadaEm: anulavel(l.ultima_mudanca_publicada_em),
        acaoPrazo: anulavel(l.acao_prazo) as DataCivil | null,
      })
    }
    const total = data[0]?.total ?? 0
    if (data.length < PAGINA || todos.length >= total) return todos
  }
}

export interface MudancaDoEmpreendimento {
  mudancaId: string
  normaId: string
  normaTitulo: string
  tipo: string
  publicadaEm: string
  resumo: string | null
  oQueMuda: string[]
  urlOficial: string | null
  licencas: string[]
}

function lerResumo(valor: unknown): { resumo: string | null; oQueMuda: string[] } {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return { resumo: null, oQueMuda: [] }
  }
  const { resumo, o_que_muda } = valor as Record<string, unknown>
  return {
    resumo: typeof resumo === 'string' ? resumo : null,
    oQueMuda: Array.isArray(o_que_muda)
      ? o_que_muda.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

export async function listarMudancasDoEmpreendimento(
  consultoriaId: string,
  empreendimentoId: string,
  desde: DataCivil,
): Promise<MudancaDoEmpreendimento[]> {
  const { data, error } = await obterSupabase().rpc('listar_mudancas_do_empreendimento', {
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: empreendimentoId,
    p_desde: desde,
  })
  if (error) throw error
  return data.map((l) => ({
    mudancaId: l.mudanca_id,
    normaId: l.norma_id,
    normaTitulo: l.norma_titulo,
    tipo: l.tipo_mudanca,
    publicadaEm: l.publicada_em,
    ...lerResumo(l.resumo),
    urlOficial: anulavel(l.url_oficial),
    licencas: l.licencas,
  }))
}

export interface NormaCitada {
  chave: string
  id: string
  titulo: string
  revogada: boolean
}

export async function normasPorChave(chaves: readonly string[]): Promise<NormaCitada[]> {
  if (chaves.length === 0) return []
  const { data, error } = await obterSupabase().rpc('normas_por_chave', {
    p_chaves: [...chaves],
  })
  if (error) throw error
  return data.map((l) => ({
    chave: l.chave,
    id: l.id,
    titulo: l.titulo,
    revogada: l.situacao_na_fonte === 'revogada',
  }))
}
