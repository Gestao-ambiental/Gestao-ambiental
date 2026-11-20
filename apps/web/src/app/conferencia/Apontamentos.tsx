// Apontamentos da conferência por IA (ADR-0037, ADR-0040): usados na evidência anexada e no editor
// do relatório. Estado = palavra + forma (Selo); a cor da IA (--ia) marca só o que ela propôs.
import type { ReactNode } from 'react'

import { Selo } from '@/components/ui/selo'
import type { Apontamento } from '@/lib/api/conferencia-ia'
import { cn } from '@/lib/utils'

import { CATEGORIAS } from './rotulos'

export function CartaoDoApontamento({
  apontamento,
  ativo = false,
  acoes,
  aoEscolher,
}: {
  apontamento: Apontamento
  /** Destacado (o trecho correspondente está selecionado no texto). */
  ativo?: boolean
  acoes?: ReactNode
  /** Clique no cartão leva ao trecho no texto. */
  aoEscolher?: () => void
}) {
  const conteudo = (
    <>
      <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
        {apontamento.gravidade === 'corrigir' ? (
          <Selo tom="perigo">Corrigir</Selo>
        ) : (
          <Selo tom="atencao">Verificar</Selo>
        )}
        <span className="rotulo text-(--tinta-3)">
          {CATEGORIAS[apontamento.categoria]}
          {apontamento.origem === 'regra' ? ' · regra fixa' : ''}
        </span>
      </span>
      <span className="corpo-medio text-(--tinta)">{apontamento.problema}</span>
      {apontamento.trecho ? (
        <span className="corpo text-(--tinta-2)">“{apontamento.trecho}”</span>
      ) : null}
      {apontamento.sugestao ? (
        <span className="corpo text-(--tinta)">{apontamento.sugestao}</span>
      ) : null}
    </>
  )
  return (
    <li
      className={cn(
        'flex flex-col gap-(--e-1) border-b border-(--regra-leve) py-(--e-3) last:border-b-0',
        ativo && 'border-l-[3px] border-l-(--ia) pl-(--e-3)',
      )}
    >
      {aoEscolher ? (
        <button
          type="button"
          onClick={aoEscolher}
          className="flex cursor-pointer flex-col gap-(--e-1) text-left"
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
      {acoes ? <span className="flex flex-wrap gap-(--e-2) pt-(--e-1)">{acoes}</span> : null}
    </li>
  )
}
