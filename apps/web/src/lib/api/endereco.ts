// Busca de endereço da triagem (Edge Function buscar-endereco): sugestões enquanto a pessoa digita,
// só em Santa Catarina. O provedor e o cache ficam na função; aqui só a chamada e as mensagens.

import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

export interface SugestaoDeEndereco {
  /** Linha principal (rua e número, ou o lugar). */
  rotulo: string
  /** Bairro, cidade e CEP, quando houver. */
  detalhe: string | null
  latitude: number
  longitude: number
}

/** Menos que isso não vai ao servidor. */
export const MINIMO_PARA_BUSCAR = 4

const MOTIVOS: Record<string, string> = {
  texto_curto: 'Digite pelo menos 4 letras.',
  muitas_buscas: 'Muitas buscas seguidas. Espere um instante e tente de novo.',
  provedor_indisponivel: 'A busca de endereço não respondeu. Tente de novo ou marque no mapa.',
  sem_permissao: 'Sua sessão expirou. Entre de novo.',
}

export class ErroDaBuscaDeEndereco extends Error {}

export async function buscarEnderecos(texto: string): Promise<SugestaoDeEndereco[]> {
  const resposta = await obterSupabase().functions.invoke<{ sugestoes: SugestaoDeEndereco[] }>(
    'buscar-endereco',
    { body: { texto } },
  )
  const erro: unknown = resposta.error
  if (!erro && resposta.data) return resposta.data.sugestoes
  if (erro instanceof FunctionsHttpError) {
    const corpo = (await (erro.context as Response).json().catch(() => ({}))) as { erro?: string }
    throw new ErroDaBuscaDeEndereco(
      MOTIVOS[corpo.erro ?? ''] ?? 'Não foi possível buscar o endereço.',
    )
  }
  throw new ErroDaBuscaDeEndereco('Sem conexão com o servidor.')
}
