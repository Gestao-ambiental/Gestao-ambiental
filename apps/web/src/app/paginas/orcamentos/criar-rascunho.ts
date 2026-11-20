// Criar o rascunho de orçamento sem diálogo (pedido do Eduardo, 20/11/2026): quem chama diz para
// quem é e, se quiser, o objeto; sem objeto, entra o inicial e o editor troca sozinho pelo modelo
// ou pelo primeiro serviço. Serve à tela Novo orçamento e a quem cria orçamento de outro lugar
// (ex.: renovação de licença, ADR-0044: aí o banco decide cliente e objeto e liga a licença).
import { OBJETO_INICIAL } from '@gestao-ambiental/domain'
import { useCallback, useRef } from 'react'

import { chaveDoOrcamento, useTarefas } from '@/app/consultoria/tempo-ativo'
import { criarOrcamento, type ParaQuem } from '@/lib/api/orcamentos'
import { criarOrcamentoDeRenovacao } from '@/lib/api/renovacoes'

/** Chave do tempo ativo antes de o orçamento ter id (ADR-0027). */
export const CHAVE_DO_NOVO_ORCAMENTO = 'orcamento:novo'

export interface PedidoDeRascunho {
  paraQuem: ParaQuem
  /** O que será orçado. Vazio ou ausente: o inicial, trocado depois pelo modelo ou serviço. */
  objeto?: string
  /**
   * Orçamento da renovação de uma LAO (ADR-0044): o banco usa o cliente do empreendimento da
   * licença e o objeto "Renovação da <licença>" (paraQuem e objeto ficam de lado) e grava a taxa
   * como despesa do cliente (nula = a cotar). Se a licença já tem orçamento vivo, vem o id dele.
   */
  renovacao?: { instrumentoId: string; taxaCentavos: number | null }
}

/**
 * Cria o rascunho com o id dado (repetir com o mesmo id não duplica). Devolve o id do orçamento,
 * que na renovação pode ser o de um orçamento que já existia para a licença.
 */
export function criarRascunho(
  id: string,
  consultoriaId: string,
  pedido: PedidoDeRascunho,
): Promise<string> {
  if (pedido.renovacao) {
    const { instrumentoId, taxaCentavos } = pedido.renovacao
    return criarOrcamentoDeRenovacao(id, consultoriaId, instrumentoId, taxaCentavos)
  }
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
