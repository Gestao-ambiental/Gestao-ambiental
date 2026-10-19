// Extração por IA (épico 9). O navegador só pede: quem lê o PDF e fala com a IA é a Edge Function
// extrair-licenca (ADR-0006). A resposta é rascunho; a tela só mostra o que a Gestão vai revisar.

import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

/** Limite do texto que a IA lê (o manual aceita até 25 MB). */
export const LIMITE_PDF_IA_BYTES = 10 * 1024 * 1024
/** Depois disso, uma extração "em andamento" é tratada como abandonada (o banco libera outra). */
export const EXTRACAO_ABANDONADA_MS = 3 * 60 * 1000

export type MotivoDaFalha =
  | 'pdf_sem_texto'
  | 'pdf_grande_demais'
  | 'provedor_indisponivel'
  | 'tempo_esgotado'
  | 'resposta_invalida'
  | 'configuracao_ausente'
  | 'erro_interno'

export const MENSAGEM_DA_FALHA: Record<MotivoDaFalha, string> = {
  pdf_sem_texto: 'Este PDF é uma imagem e a IA só lê PDF com texto. Siga pelo cadastro manual.',
  pdf_grande_demais: 'A IA lê PDF com texto até 10 MB. Siga pelo cadastro manual.',
  provedor_indisponivel: 'A IA não respondeu agora. Tente de novo ou siga pelo manual.',
  tempo_esgotado: 'A extração não respondeu em 2 minutos. Tente de novo ou siga pelo manual.',
  resposta_invalida:
    'A IA devolveu algo fora do formato esperado. Tente de novo ou siga pelo manual.',
  configuracao_ausente: 'A extração por IA não está configurada neste ambiente. Siga pelo manual.',
  erro_interno: 'Não foi possível concluir a extração. Tente de novo ou siga pelo manual.',
}

/** Falhas em que tentar de novo não adianta: o caminho é o manual. */
export const FALHA_DEFINITIVA: ReadonlySet<MotivoDaFalha> = new Set([
  'pdf_sem_texto',
  'pdf_grande_demais',
  'configuracao_ausente',
])

export interface CampoProposto {
  valor: string | null
  pagina: number | null
}

export interface PropostaDeIdentificacao {
  tipo: CampoProposto
  numero: CampoProposto
  orgao: CampoProposto
  emitido_em: CampoProposto
  assinado_em: CampoProposto
  publicado_em: CampoProposto
  recebido_em: CampoProposto
  validade: CampoProposto
}

export interface Extracao {
  id: string
  situacao: 'em_andamento' | 'concluida' | 'falhou'
  motivo: MotivoDaFalha | null
  iniciadaEm: string
  itensPropostos: number | null
  identificacao: PropostaDeIdentificacao | null
}

function propostaDe(resultado: unknown): PropostaDeIdentificacao | null {
  if (typeof resultado !== 'object' || resultado === null) return null
  const ident = (resultado as { identificacao?: unknown }).identificacao
  return typeof ident === 'object' && ident !== null ? (ident as PropostaDeIdentificacao) : null
}

/** A extração mais recente do rascunho, se houver. */
export async function obterUltimaExtracao(instrumentoId: string): Promise<Extracao | null> {
  const { data, error } = await obterSupabase()
    .from('extracao_ia')
    .select('id, situacao, motivo, iniciada_em, itens_propostos, resultado')
    .eq('instrumento_id', instrumentoId)
    .order('iniciada_em', { ascending: false })
    .range(0, 0)
  if (error) throw error
  const x = data[0]
  if (!x) return null
  return {
    id: x.id,
    situacao: x.situacao as Extracao['situacao'],
    motivo: x.motivo as MotivoDaFalha | null,
    iniciadaEm: x.iniciada_em,
    itensPropostos: x.itens_propostos,
    identificacao: propostaDe(x.resultado),
  }
}

export type ResultadoDaExtracao =
  | { situacao: 'em_andamento' }
  | { situacao: 'concluida'; itens: number }
  | { situacao: 'falhou'; motivo: MotivoDaFalha }

/**
 * Pede a extração e espera (síncrona, até 2 min). `extracaoId` vem da tela: repetir depois de
 * erro de rede retoma a mesma extração. Recusas do banco viram erro com o código em `message`.
 */
export async function extrairLicenca(
  extracaoId: string,
  instrumentoId: string,
): Promise<ResultadoDaExtracao> {
  const resposta = await obterSupabase().functions.invoke<ResultadoDaExtracao>('extrair-licenca', {
    body: { extracaoId, instrumentoId },
  })
  const error: unknown = resposta.error
  const data = resposta.data
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const corpo = (await (error.context as Response).json().catch(() => ({}))) as {
        erro?: string
      }
      throw new Error(corpo.erro ?? 'erro_interno')
    }
    // Sem resposta (rede, função fora do ar): a mesma mensagem de IA indisponível.
    return { situacao: 'falhou', motivo: 'provedor_indisponivel' }
  }
  if (!data) return { situacao: 'falhou', motivo: 'erro_interno' }
  return data
}
