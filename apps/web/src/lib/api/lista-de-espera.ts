// Lista de espera do site (ADR-0032). O site grava sem login; aqui só a leitura da central
// (operador com dois fatores; quem recusa é o banco).

import type { TipoDeContato } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

import { TAMANHO_PAGINA_CENTRAL, type PaginaDaCentral } from './central'

export interface PessoaNaListaDeEspera {
  id: string
  nome: string
  contato: { tipo: TipoDeContato; valor: string }
  criadaEm: string
}

export async function listarListaDeEspera(
  pagina: number,
): Promise<PaginaDaCentral<PessoaNaListaDeEspera>> {
  const { data, error } = await obterSupabase().rpc('central_lista_de_espera', {
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
  })
  if (error) throw error
  const linhas = (data as typeof data | null) ?? []
  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      contato: {
        tipo: linha.tipo_contato === 'whatsapp' ? 'whatsapp' : 'email',
        valor: linha.contato,
      },
      criadaEm: linha.criada_em,
    })),
    total: linhas[0]?.total ?? 0,
  }
}
