// Lista de espera do site (ADR-0032 e ADR-0034). O site grava sem login; aqui a leitura da central,
// a marcação de contatado e o convite para o beta (operador com dois fatores; quem recusa é o banco).

import type { TipoDeContato } from '@gestao-ambiental/domain'
import { FunctionsHttpError } from '@supabase/supabase-js'

import { obterSupabase } from '@/lib/supabase'

import { TAMANHO_PAGINA_CENTRAL, type PaginaDaCentral } from './central'

export interface PessoaNaListaDeEspera {
  id: string
  nome: string
  contato: { tipo: TipoDeContato; valor: string }
  criadaEm: string
  contatadoEm: string | null
  convidadoEm: string | null
}

export async function listarListaDeEspera(
  pagina: number,
  soPendentes = false,
): Promise<PaginaDaCentral<PessoaNaListaDeEspera>> {
  const { data, error } = await obterSupabase().rpc('central_lista_de_espera', {
    p_limite: TAMANHO_PAGINA_CENTRAL,
    p_deslocamento: pagina * TAMANHO_PAGINA_CENTRAL,
    p_so_pendentes: soPendentes,
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
      contatadoEm: (linha.contatado_em as string | null) ?? null,
      convidadoEm: (linha.convidado_em as string | null) ?? null,
    })),
    total: linhas[0]?.total ?? 0,
  }
}

export async function marcarContatado(id: string, contatado: boolean): Promise<void> {
  const { error } = await obterSupabase().rpc('central_marcar_contatado', {
    p_id: id,
    p_contatado: contatado,
  })
  if (error) throw error
}

/** Convite do beta para um e-mail (ADR-0058): libera abrir uma consultoria, uma vez. */
export async function emitirConviteDoBeta(email: string): Promise<void> {
  const { error } = await obterSupabase().rpc('central_emitir_convite_do_beta', { p_email: email })
  if (error) throw error
}

/** WhatsApp: só registra o convite (a conversa abre no navegador com a mensagem pronta). */
export async function registrarConviteNoWhatsapp(id: string): Promise<void> {
  const { error } = await obterSupabase().rpc('central_registrar_convite', { p_id: id })
  if (error) throw error
}

const MOTIVOS_DO_CONVITE: Record<string, string> = {
  configuracao_ausente: 'O envio de e-mail não está configurado.',
  falha_no_envio: 'O serviço de e-mail recusou o envio.',
  dois_fatores_necessarios: 'A sessão precisa dos dois fatores.',
  sem_permissao: 'Sem permissão.',
  cadastro_inexistente: 'Este cadastro não está mais na lista de espera.',
}

/** Falha do convite por e-mail, já com a mensagem para a tela. */
export class ErroDoConvite extends Error {}

/** E-mail: a Edge Function registra o convite e manda o e-mail com o link de criar conta. */
export async function convidarPorEmail(id: string): Promise<void> {
  const resposta = await obterSupabase().functions.invoke('convidar-da-lista-de-espera', {
    body: { id },
  })
  const erro: unknown = resposta.error
  if (!erro) return
  if (erro instanceof FunctionsHttpError) {
    const corpo = (await (erro.context as Response).json().catch(() => ({}))) as { erro?: string }
    throw new ErroDoConvite(
      MOTIVOS_DO_CONVITE[corpo.erro ?? ''] ?? 'Não foi possível enviar o convite.',
    )
  }
  throw new ErroDoConvite('Sem conexão com o servidor.')
}
