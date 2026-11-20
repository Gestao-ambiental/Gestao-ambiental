import type { ReactNode } from 'react'

import { ItemDoPlacar, Placar as PlacarDoGrama } from '@/components/ui/placar'

export interface CasaDoPlacar {
  rotulo: string
  valor: ReactNode
  /** Linha curta embaixo do rótulo (ex.: "13 de 16", "R$ 2.300,00"). */
  detalhe?: ReactNode
}

/**
 * Placar da central: o placar único do Grama (components/ui/placar) na medida compacta, número de
 * 22px, com a faixa quebrando em linhas iguais para caber muitas casas.
 */
export function Placar({
  rotulo,
  casas,
  className,
  colunas = 4,
}: {
  /** Nome acessível do grupo. */
  rotulo: string
  casas: CasaDoPlacar[]
  className?: string
  /** Casas por linha no desktop (a faixa quebra em linhas iguais). */
  colunas?: 3 | 4 | 5 | 6
}) {
  return (
    <PlacarDoGrama rotulo={rotulo} tamanho="compacto" colunas={colunas} className={className}>
      {casas.map((casa) => (
        <ItemDoPlacar
          key={casa.rotulo}
          rotulo={casa.rotulo}
          valor={casa.valor}
          detalhe={casa.detalhe}
        />
      ))}
    </PlacarDoGrama>
  )
}
