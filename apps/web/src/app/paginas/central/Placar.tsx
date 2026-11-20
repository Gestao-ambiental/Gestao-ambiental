import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface CasaDoPlacar {
  rotulo: string
  valor: ReactNode
  /** Linha curta embaixo do rótulo (ex.: "13 de 16", "R$ 2.300,00"). */
  detalhe?: ReactNode
}

/**
 * Placar da central (DESIGN.md, "Placar"): uma faixa só, dividida por regras finas, número
 * tabular em cima e rótulo embaixo. Densa: número de 22px, para caber muitas casas.
 */
export function Placar({
  casas,
  className,
  colunas = 4,
}: {
  casas: CasaDoPlacar[]
  className?: string
  /** Casas por linha no desktop (a faixa quebra em linhas iguais). */
  colunas?: 3 | 4 | 5 | 6
}) {
  // As regras são a borda direita e de baixo de cada casa; a margem negativa esconde as da
  // última coluna e da última linha dentro da moldura.
  return (
    <div className={cn('overflow-hidden rounded-(--raio-painel) border bg-(--folha)', className)}>
      <dl
        className={cn(
          '-mr-px -mb-px grid grid-cols-2',
          colunas === 3 && 'sm:grid-cols-3',
          colunas === 4 && 'sm:grid-cols-4',
          colunas === 5 && 'sm:grid-cols-3 lg:grid-cols-5',
          colunas === 6 && 'sm:grid-cols-3 lg:grid-cols-6',
        )}
      >
        {casas.map((casa) => (
          <div
            key={casa.rotulo}
            className="flex min-w-0 flex-col gap-(--e-05) border-r border-b border-(--regra-leve) px-(--e-4) py-(--e-3)"
          >
            <dt className="order-2 truncate rotulo">{casa.rotulo}</dt>
            <dd className="order-1 truncate numero-contagem text-(--tinta)">{casa.valor}</dd>
            {casa.detalhe ? (
              <dd className="order-3 truncate corpo text-(--tinta-2) numero">{casa.detalhe}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  )
}
