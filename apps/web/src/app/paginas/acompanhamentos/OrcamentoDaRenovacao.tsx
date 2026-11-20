import { Link } from 'react-router'

import { SeloSituacaoOrcamento } from '@/app/paginas/orcamentos/SeloSituacaoOrcamento'
import { Botao } from '@/components/ui/botao'
import type { OrcamentoDaRenovacao as Orcamento } from '@/lib/api/renovacoes'

/**
 * Coluna "Orçamento" do radar de renovações (ADR-0044). Gestão: número e situação com link, ou
 * "Gerar orçamento" (só com orçamentos no plano). Equipe: só a situação, sem número, link nem ação.
 */
export function OrcamentoDaRenovacao({
  instrumentoId,
  licenca,
  orcamento,
  ehGestao,
  podeGerar,
}: {
  instrumentoId: string
  /** Nome da licença, para o nome acessível da ação na linha. */
  licenca: string
  orcamento: Orcamento | null
  ehGestao: boolean
  /** O plano libera orçamentos (apresentação; o banco barra igual). */
  podeGerar: boolean
}) {
  if (orcamento) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
        {ehGestao && orcamento.id ? (
          <Link
            to={`/orcamentos/${orcamento.id}`}
            className="corpo-medio whitespace-nowrap text-(--tinta) numero"
          >
            {orcamento.numero ?? 'Orçamento'}
          </Link>
        ) : null}
        <SeloSituacaoOrcamento situacao={orcamento.situacao} />
      </span>
    )
  }
  if (ehGestao && podeGerar) {
    return (
      <Botao tamanho="compacto" asChild>
        <Link
          to={`/orcamentos/novo?renovacao=${instrumentoId}`}
          aria-label={`Gerar orçamento da ${licenca}`}
        >
          Gerar orçamento
        </Link>
      </Botao>
    )
  }
  return <span className="corpo whitespace-nowrap text-(--tinta-2)">Sem orçamento</span>
}
