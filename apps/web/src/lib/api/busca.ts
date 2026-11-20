// Busca global (Ctrl+K): uma RPC só leitura, security invoker. A RLS de cada tabela decide o que
// volta (a Equipe não lê orçamento; outra consultoria não lê nada). Erros sobem como vieram.

import { obterSupabase } from '@/lib/supabase'

export type TipoResultadoBusca = 'empreendimento' | 'licenca' | 'condicionante' | 'orcamento'

export interface ResultadoBusca {
  tipo: TipoResultadoBusca
  id: string
  titulo: string
  detalhe: string | null
  /** Id que monta a rota: o empreendimento (licença e condicionante) ou o próprio registro. */
  referenciaId: string
}

/** Abaixo disto o banco devolve vazio; a tela nem chama. */
export const TAMANHO_MINIMO_DA_BUSCA = 2

const TIPOS: readonly TipoResultadoBusca[] = [
  'empreendimento',
  'licenca',
  'condicionante',
  'orcamento',
]

function ehTipo(valor: string): valor is TipoResultadoBusca {
  return (TIPOS as readonly string[]).includes(valor)
}

export async function buscarNoGrama(
  consultoriaId: string,
  termo: string,
): Promise<ResultadoBusca[]> {
  const { data, error } = await obterSupabase().rpc('buscar_no_grama', {
    p_consultoria_id: consultoriaId,
    p_termo: termo,
  })
  if (error) throw error
  return data.flatMap((linha) => {
    if (!ehTipo(linha.tipo)) return []
    // O gerador de tipos não marca colunas de função como anuláveis; o detalhe pode vir nulo.
    const detalhe: string | null = linha.detalhe
    return [
      {
        tipo: linha.tipo,
        id: linha.id,
        titulo: linha.titulo,
        detalhe,
        referenciaId: linha.referencia_id,
      },
    ]
  })
}
