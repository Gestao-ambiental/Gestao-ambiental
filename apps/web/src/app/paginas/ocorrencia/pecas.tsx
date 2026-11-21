import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Icone } from '@/components/ui/icone'

/** Link de volta igual ao da `<Pagina>`, para os estados que ainda não têm título. */
export function VoltarParaVisao() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-(--e-1) rounded-(--raio-mini) corpo-medio text-(--tinta-2) no-underline hover:text-(--tinta) hover:no-underline max-md:min-h-(--controle-toque)"
    >
      <Icone nome="chevron-left" />
      Visão da equipe
    </Link>
  )
}

/**
 * Cabeçalho de seção da coluna principal: título, contagem em plaqueta (opcional) e uma ação
 * discreta à direita, sobre uma regra forte. As linhas da seção vêm logo abaixo, sem caixa.
 */
export function CabecalhoDeSecao({
  id,
  titulo,
  contagem,
  acao,
}: {
  id: string
  titulo: string
  contagem?: string | null
  acao?: ReactNode
}) {
  return (
    <div className="flex min-h-(--controle) flex-wrap items-center justify-between gap-(--e-2) border-b border-(--regra-forte) pb-(--e-1)">
      <h2 id={id} className="flex items-center gap-(--e-2) titulo-secao text-(--tinta)">
        {titulo}
        {contagem ? (
          <span className="min-w-6 rounded-(--raio-mini) bg-(--aperto) px-(--e-15) text-center text-xs font-semibold text-(--tinta-2) numero">
            {contagem}
          </span>
        ) : null}
      </h2>
      {acao}
    </div>
  )
}

/** Vazio de seção: uma linha só, no mesmo formato em todas as seções da tela. */
export function VazioDeSecao({ children }: { children: ReactNode }) {
  return <p className="py-(--e-3) corpo text-(--tinta-3)">{children}</p>
}
