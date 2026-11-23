// "Orçar" da conclusão da triagem abre um rascunho para o empreendimento ou prospecto, com os valores
// que a consultoria guardou para a modalidade e a taxa do órgão como repasse. Só a Gestão.
import {
  despesaDaTaxa,
  objetoDoOrcamentoDaTriagem,
  type Modalidade,
  type TaxaDaAtividade,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  caminhoDoOrcamentoDaTriagem,
  criarOrcamentoDaTriagem,
  type EstadoDoNovoOrcamento,
} from '@/lib/api/triagem-orcamento'
import { mensagemDoErro } from '@/lib/erros'

export function OrcarDaTriagem({
  consultoriaId,
  empreendimento,
  modalidade,
  orgao,
  taxas,
  primario = true,
}: {
  consultoriaId: string
  empreendimento: { id: string; nome: string } | null
  modalidade: Modalidade
  orgao: 'estadual' | 'municipal' | null
  taxas: readonly TaxaDaAtividade[]
  /** Com o Gravar no cabeçalho, o Orçar desce para secundário (um primário por tela). */
  primario?: boolean
}) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [id] = useState(() => crypto.randomUUID())
  const taxa = despesaDaTaxa(orgao, taxas)
  const orcar = useMutation({
    mutationFn: (destino: { id: string; nome: string }) =>
      criarOrcamentoDaTriagem({
        id,
        consultoriaId,
        empreendimentoId: destino.id,
        modalidade,
        objeto: objetoDoOrcamentoDaTriagem(modalidade, destino.nome),
        taxa,
      }),
    onSuccess: (criado) => {
      void queryClient.invalidateQueries({ queryKey: ['orcamentos', consultoriaId] })
      void navegar(caminhoDoOrcamentoDaTriagem(criado, modalidade))
    },
  })

  return (
    <div className="flex flex-col gap-(--e-2)">
      <Botao
        aparencia={primario ? 'primario' : 'padrao'}
        iconeAntes="file-plus"
        larguraTotal
        disabled={orcar.isPending}
        onClick={() => {
          if (empreendimento) {
            orcar.mutate(empreendimento)
          } else {
            const state: EstadoDoNovoOrcamento = { triagem: { consultoriaId, modalidade, taxa } }
            void navegar('/orcamentos/novo', { state })
          }
        }}
      >
        {orcar.isPending ? 'Abrindo' : 'Orçar'}
      </Botao>
      {orcar.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(orcar.error)}
        </MensagemSecao>
      ) : null}
    </div>
  )
}
