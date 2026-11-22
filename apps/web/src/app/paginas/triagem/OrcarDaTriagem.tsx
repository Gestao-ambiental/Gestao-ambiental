// "Orçar" da conclusão da triagem abre um rascunho para o empreendimento ou prospecto, com os valores
// que a consultoria guardou para a modalidade e a taxa do órgão como repasse. Só a Gestão.
import {
  despesaDaTaxa,
  objetoDoOrcamentoDaTriagem,
  type Modalidade,
  type TaxaDaAtividade,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
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
  empreendimento: { id: string; nome: string } | null
  modalidade: Modalidade
  orgao: 'estadual' | 'municipal' | null
  taxas: readonly TaxaDaAtividade[]
}) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const formulario = useId()
  const [nome, setNome] = useState<string | null>(null)
  // Repetir a mesma tentativa usa o mesmo id. Trocar o nome inicia outro pedido.
  const pedido = useRef<{ id: string; nome: string } | null>(null)
  const orcar = useMutation({
    mutationFn: (nomeDoCliente: string) => {
      if (pedido.current?.nome !== nomeDoCliente) {
        pedido.current = { id: crypto.randomUUID(), nome: nomeDoCliente }
      }
      return criarOrcamentoDaTriagem({
        id: pedido.current.id,
        consultoriaId,
        empreendimentoId: empreendimento?.id ?? null,
        prospectoNome: empreendimento ? undefined : nomeDoCliente,
        modalidade,
        objeto: objetoDoOrcamentoDaTriagem(modalidade, nomeDoCliente),
        taxa: despesaDaTaxa(orgao, taxas),
      })
    },
    onSuccess: ({ orcamentoId, modeloId }) => {
      void queryClient.invalidateQueries({ queryKey: ['orcamentos', consultoriaId] })
      void navegar(
        modeloId
          ? `/orcamentos/${orcamentoId}`
          : `/orcamentos/${orcamentoId}?modalidade=${modalidade}&sem-valores=1`,
      )
    },
  })

  function cancelar() {
    if (orcar.isPending) return
    orcar.reset()
    setNome(null)
  }

  const erro = orcar.isError ? (
    <MensagemSecao tom="perigo" role="alert">
      {mensagemDoErro(orcar.error)}
    </MensagemSecao>
  ) : null

  return (
    <div className="flex flex-col items-start gap-(--e-2)">
      <Botao
        iconeAntes="file-plus"
        disabled={orcar.isPending}
        onClick={() => {
          if (empreendimento) {
            orcar.mutate(empreendimento.nome)
          } else {
            setNome('')
          }
        }}
      >
        {orcar.isPending ? 'Abrindo' : 'Orçar'}
      </Botao>
      {empreendimento ? erro : null}
      {nome !== null ? (
        <Dialogo
          aberto
          aoMudar={cancelar}
          titulo="Orçar para cliente novo"
          acoes={
            <>
              <Botao disabled={orcar.isPending} onClick={cancelar}>
                Cancelar
              </Botao>
              <Botao
                type="submit"
                form={formulario}
                aparencia="primario"
                disabled={orcar.isPending || !nome.trim()}
              >
                {orcar.isPending ? 'Criando orçamento' : 'Criar orçamento'}
              </Botao>
            </>
          }
        >
          <form
            id={formulario}
            onSubmit={(evento) => {
              evento.preventDefault()
              if (!orcar.isPending && nome.trim()) orcar.mutate(nome.trim())
            }}
          >
            <CampoTexto
              rotulo="Nome da empresa ou do cliente"
              autoComplete="organization"
              maxLength={200}
              required
              readOnly={orcar.isPending}
              value={nome}
              onChange={(evento) => {
                setNome(evento.target.value)
              }}
            />
          </form>
          {erro}
        </Dialogo>
      ) : null}
    </div>
  )
}
