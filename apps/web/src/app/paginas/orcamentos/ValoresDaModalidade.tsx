// Orçamento aberto pela triagem sem valores para a modalidade (ADR-0056): depois de montar os
// itens, a Gestão guarda como valores da modalidade e o próximo "Orçar" já vem com eles.
import {
  ehModalidade,
  nomeDosValoresDaModalidade,
  ROTULO_DA_MODALIDADE,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { salvarValoresDaModalidade } from '@/lib/api/triagem-orcamento'
import { mensagemDoErro } from '@/lib/erros'

export function ValoresDaModalidade({ orcamentoId }: { orcamentoId: string }) {
  const [parametros] = useSearchParams()
  const modalidade = parametros.get('modalidade')
  const semValores = parametros.get('sem-valores') === '1'
  const queryClient = useQueryClient()
  const [modeloId] = useState(() => crypto.randomUUID())
  const salvar = useMutation({
    mutationFn: () => {
      if (!ehModalidade(modalidade)) throw new Error('modalidade_invalida')
      return salvarValoresDaModalidade({
        orcamentoId,
        modeloId,
        modalidade,
        nome: nomeDosValoresDaModalidade(modalidade),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['modelos-de-orcamento'] })
    },
  })

  if (!semValores || !ehModalidade(modalidade)) return null
  const rotulo = ROTULO_DA_MODALIDADE[modalidade]

  if (salvar.isSuccess) {
    return (
      <MensagemSecao role="status" tom="sucesso">
        Valores guardados para {rotulo}.
      </MensagemSecao>
    )
  }
  return (
    <MensagemSecao
      tom="atencao"
      titulo={`Sem valores para ${rotulo}`}
      acoes={
        <Botao
          tamanho="compacto"
          disabled={salvar.isPending}
          onClick={() => {
            salvar.mutate()
          }}
        >
          {salvar.isPending ? 'Guardando' : 'Guardar como valores da modalidade'}
        </Botao>
      }
    >
      {salvar.isError ? <span role="alert">{mensagemDoErro(salvar.error)}</span> : null}
    </MensagemSecao>
  )
}
