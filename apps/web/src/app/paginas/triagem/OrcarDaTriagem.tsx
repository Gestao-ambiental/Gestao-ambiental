// "Orçar" da conclusão da triagem (ADR-0056): abre um rascunho para o empreendimento com os valores
// que a consultoria guardou para a modalidade e a taxa do órgão como repasse. Só a Gestão.
import {
  despesaDaTaxa,
  objetoDoOrcamentoDaTriagem,
  type Modalidade,
  type TaxaDaAtividade,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { criarOrcamentoDaTriagem } from '@/lib/api/triagem-orcamento'
import { mensagemDoErro } from '@/lib/erros'

export function OrcarDaTriagem({
  consultoriaId,
  empreendimento,
  modalidade,
  orgao,
  taxas,
}: {
  consultoriaId: string
  empreendimento: { id: string; nome: string }
  modalidade: Modalidade
  orgao: 'estadual' | 'municipal' | null
  taxas: readonly TaxaDaAtividade[]
}) {
  const navegar = useNavigate()
  // Um id por abertura da tela: clicar de novo não cria outro rascunho.
  const [id] = useState(() => crypto.randomUUID())
  const orcar = useMutation({
    mutationFn: () =>
      criarOrcamentoDaTriagem({
        id,
        consultoriaId,
        empreendimentoId: empreendimento.id,
        modalidade,
        objeto: objetoDoOrcamentoDaTriagem(modalidade, empreendimento.nome),
        taxa: despesaDaTaxa(orgao, taxas),
      }),
    onSuccess: ({ orcamentoId, modeloId }) => {
      void navegar(
        modeloId
          ? `/orcamentos/${orcamentoId}`
          : `/orcamentos/${orcamentoId}?modalidade=${modalidade}&sem-valores=1`,
      )
    },
  })

  return (
    <div className="flex flex-col items-start gap-(--e-2)">
      <Botao
        iconeAntes="file-plus"
        disabled={orcar.isPending}
        onClick={() => {
          orcar.mutate()
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
