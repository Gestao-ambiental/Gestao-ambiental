// Criar o rascunho de orçamento sem diálogo (pedido do Eduardo, 20/11/2026): quem chama diz para
// quem é e, se quiser, o objeto; sem objeto, entra o inicial e o editor troca sozinho pelo modelo
// ou pelo primeiro serviço. Serve à tela Novo orçamento e a quem cria orçamento de outro lugar
// (ex.: renovação de licença, ADR-0044: aí o banco decide cliente e objeto e liga a licença).
import { OBJETO_INICIAL, objetoDoOrcamentoDaTriagem } from '@gestao-ambiental/domain'
import { useCallback, useRef } from 'react'

import { chaveDoOrcamento, useTarefas } from '@/app/consultoria/tempo-ativo'
import { criarOrcamento, type ParaQuem } from '@/lib/api/orcamentos'
import { criarOrcamentoDeRenovacao } from '@/lib/api/renovacoes'
import {
  caminhoDoOrcamentoDaTriagem,
  criarOrcamentoDaTriagem,
  type DadosDaTriagemParaOrcamento,
} from '@/lib/api/triagem-orcamento'

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
  triagem?: DadosDaTriagemParaOrcamento & { nomeDoCliente: string | null }
}

/**
 * Cria o rascunho com o id dado (repetir com o mesmo id não duplica). Devolve o id do orçamento,
 * que na renovação pode ser o de um orçamento que já existia para a licença.
 */
async function criarRascunho(id: string, consultoriaId: string, pedido: PedidoDeRascunho) {
  if (pedido.renovacao) {
    const { instrumentoId, taxaCentavos } = pedido.renovacao
    const criado = await criarOrcamentoDeRenovacao(id, consultoriaId, instrumentoId, taxaCentavos)
    return { id: criado, caminho: `/orcamentos/${criado}` }
  }
  if (pedido.triagem) {
    const { modalidade, taxa, nomeDoCliente } = pedido.triagem
    const criado = await criarOrcamentoDaTriagem({
      id,
      consultoriaId,
      empreendimentoId:
        'empreendimentoId' in pedido.paraQuem ? pedido.paraQuem.empreendimentoId : null,
      prospectoNome: 'prospecto' in pedido.paraQuem ? pedido.paraQuem.prospecto.nome : undefined,
      modalidade,
      objeto: objetoDoOrcamentoDaTriagem(modalidade, nomeDoCliente),
      taxa,
    })
    return { id: criado.orcamentoId, caminho: caminhoDoOrcamentoDaTriagem(criado, modalidade) }
  }
  const objeto = pedido.objeto?.trim() ? pedido.objeto.trim() : OBJETO_INICIAL
  const criado = await criarOrcamento(id, consultoriaId, pedido.paraQuem, objeto)
  return { id: criado, caminho: `/orcamentos/${criado}` }
}

/**
 * Hook de criar rascunho: guarda o id entre tentativas (erro de rede e repetir não cria outro
 * orçamento) e passa o tempo ativo de "Novo orçamento" para o orçamento criado.
 */
export function useCriarRascunho(consultoriaId: string) {
  const tarefas = useTarefas()
  const tentativa = useRef<{ chave: string; id: string } | null>(null)
  return useCallback(
    async (pedido: PedidoDeRascunho) => {
      const chave = JSON.stringify(pedido)
      if (tentativa.current?.chave !== chave) {
        tentativa.current = { chave, id: crypto.randomUUID() }
      }
      const criado = await criarRascunho(tentativa.current.id, consultoriaId, pedido)
      tarefas.transferir(CHAVE_DO_NOVO_ORCAMENTO, chaveDoOrcamento(criado.id))
      tentativa.current = null
      return criado
    },
    [consultoriaId, tarefas],
  )
}
