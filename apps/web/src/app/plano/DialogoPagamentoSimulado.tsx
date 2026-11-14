import { formatarDataCivil, formatarReais, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { pagarCobrancaSimulada } from '@/lib/api/plano'
import { mensagemDoErro } from '@/lib/erros'

import { CHAVE_COBRANCAS, CHAVE_SITUACAO_COMERCIAL } from './situacao'

export interface CobrancaParaPagar {
  id: string
  valorCentavos: number
  vencimento: string
}

/**
 * Pagamento simulado do protótipo (ADR-0026): no lugar da página do Asaas, um diálogo com
 * "Confirmar pagamento", que marca a cobrança como paga no banco.
 */
export function DialogoPagamentoSimulado({
  cobranca,
  aoFechar,
}: {
  cobranca: CobrancaParaPagar | null
  aoFechar: () => void
}) {
  const queryClient = useQueryClient()
  const pagar = useMutation({
    mutationFn: (id: string) => pagarCobrancaSimulada(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE_SITUACAO_COMERCIAL] }),
        queryClient.invalidateQueries({ queryKey: [CHAVE_COBRANCAS] }),
      ])
      aoFechar()
    },
  })

  return (
    <Dialogo
      aberto={cobranca !== null}
      aoMudar={(aberto) => {
        if (!aberto && !pagar.isPending) {
          pagar.reset()
          aoFechar()
        }
      }}
      titulo="Pagamento simulado"
      descricao="Protótipo: nenhum valor é cobrado."
      acoes={
        <>
          <Botao disabled={pagar.isPending} onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={pagar.isPending || cobranca === null}
            onClick={() => {
              if (cobranca) pagar.mutate(cobranca.id)
            }}
          >
            Confirmar pagamento
          </Botao>
        </>
      }
    >
      {cobranca ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-(--space-200) gap-y-(--space-075)">
          <dt>Valor</dt>
          <dd className="text-right tabular-nums">{formatarReais(cobranca.valorCentavos)}</dd>
          <dt>Vencimento</dt>
          <dd className="text-right tabular-nums">
            {formatarDataCivil(cobranca.vencimento as DataCivil)}
          </dd>
        </dl>
      ) : null}
      {pagar.isError ? (
        <p role="alert" className="text-(--text-danger)">
          {mensagemDoErro(pagar.error)}
        </p>
      ) : null}
    </Dialogo>
  )
}

/** Botão "Pagar" que abre o pagamento simulado. */
export function BotaoPagarSimulado({
  cobranca,
  tamanho = 'compacto',
}: {
  cobranca: CobrancaParaPagar | null
  tamanho?: 'compacto' | 'padrao'
}) {
  const [aberta, setAberta] = useState<CobrancaParaPagar | null>(null)
  if (!cobranca) return null
  return (
    <>
      <Botao
        aparencia="primario"
        tamanho={tamanho}
        onClick={() => {
          setAberta(cobranca)
        }}
      >
        Pagar
      </Botao>
      <DialogoPagamentoSimulado
        cobranca={aberta}
        aoFechar={() => {
          setAberta(null)
        }}
      />
    </>
  )
}
