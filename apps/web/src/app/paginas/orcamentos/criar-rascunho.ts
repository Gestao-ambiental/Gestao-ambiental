// Criar o rascunho de orçamento sem diálogo (pedido do Eduardo, 20/11/2026): quem chama diz para
// quem é e, se quiser, o objeto; sem objeto, entra o inicial e o editor troca sozinho pelo modelo
// ou pelo primeiro serviço. Serve à tela Novo orçamento e a quem cria orçamento de outro lugar
// (ex.: renovação de licença), sem passar pela tela.
import { OBJETO_INICIAL } from '@gestao-ambiental/domain'
import { useCallback, useRef } from 'react'

import { chaveDoOrcamento, useTarefas } from '@/app/consultoria/tempo-ativo'
import { criarOrcamento, type ParaQuem } from '@/lib/api/orcamentos'

/** Chave do tempo ativo antes de o orçamento ter id (ADR-0027). */
export const CHAVE_DO_NOVO_ORCAMENTO = 'orcamento:novo'

export interface PedidoDeRascunho {
  paraQuem: ParaQuem
  /** O que será orçado. Vazio ou ausente: o inicial, trocado depois pelo modelo ou serviço. */
  objeto?: string
}

/** Cria o rascunho com o id dado (repetir com o mesmo id não duplica). Devolve o id. */
export function criarRascunho(
  id: string,
  consultoriaId: string,
  pedido: PedidoDeRascunho,
): Promise<string> {
  const objeto = pedido.objeto?.trim() ? pedido.objeto.trim() : OBJETO_INICIAL
  return criarOrcamento(id, consultoriaId, pedido.paraQuem, objeto)
}

/**
 * Hook de criar rascunho: guarda o id entre tentativas (erro de rede e repetir não cria outro
 * orçamento) e passa o tempo ativo de "Novo orçamento" para o orçamento criado.
 */
export function useCriarRascunho(consultoriaId: string) {
  const tarefas = useTarefas()
  const id = useRef<string | null>(null)
  return useCallback(
    async (pedido: PedidoDeRascunho): Promise<string> => {
      id.current ??= crypto.randomUUID()
      const criado = await criarRascunho(id.current, consultoriaId, pedido)
      tarefas.transferir(CHAVE_DO_NOVO_ORCAMENTO, chaveDoOrcamento(criado))
      id.current = null
      return criado
    },
    [consultoriaId, tarefas],
  )
}
