import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { IndicadorDeslizante, useIndicadorDeslizante } from './indicador-deslizante'

export interface OpcaoSegmentada<T> {
  valor: T
  rotulo: ReactNode
}

/**
 * Controle segmentado (DESIGN.md, "Segmentado"): poucas opções exclusivas, um clique. Grupo colado
 * com borda de regra forte; a opção escolhida fica cheia de tinta, as outras transparentes.
 * Botões com aria-pressed dentro de um grupo com nome (o mesmo padrão em todas as telas).
 * `valor` nulo: nenhuma opção marcada (ex.: atalhos de um campo que aceita outro valor).
 */
export function Segmentado<T extends string | number | boolean>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  larguraTotalNoCelular = false,
  desabilitado = false,
  className,
}: {
  /** Nome acessível do grupo. */
  rotulo: string
  opcoes: readonly OpcaoSegmentada<T>[]
  valor: T | null
  aoMudar: (valor: T) => void
  /** No celular, o grupo ocupa a largura toda e as opções dividem o espaço. */
  larguraTotalNoCelular?: boolean
  desabilitado?: boolean
  className?: string
}) {
  // A opção escolhida é um fundo só, que desliza até a nova escolha.
  const { conteiner, medida, desliza } = useIndicadorDeslizante<HTMLDivElement>(
    '[aria-pressed="true"]',
    String(valor),
  )
  return (
    <div
      ref={conteiner}
      role="group"
      aria-label={rotulo}
      data-largura-total={larguraTotalNoCelular ? '' : undefined}
      className={cn(
        'relative isolate inline-flex shrink-0 rounded-(--raio) border border-(--regra-forte) bg-(--folha)',
        larguraTotalNoCelular && 'max-md:flex max-md:w-full',
        className,
      )}
    >
      <IndicadorDeslizante
        medida={medida}
        desliza={desliza}
        className={cn('-z-10 rounded-[5px]', desabilitado ? 'bg-(--tinta-3)' : 'bg-(--tinta)')}
      />
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor
        return (
          <button
            key={String(opcao.valor)}
            type="button"
            aria-pressed={ativo}
            disabled={desabilitado}
            onClick={() => {
              aoMudar(opcao.valor)
            }}
            className={cn(
              'inline-flex h-(--controle) cursor-pointer items-center justify-center border-l border-(--regra-forte) px-(--e-3) corpo-medio whitespace-nowrap transicao-estado max-md:h-(--controle-toque)',
              'first:rounded-l-[5px] first:border-l-0 last:rounded-r-[5px] disabled:cursor-not-allowed',
              larguraTotalNoCelular && 'max-md:flex-1',
              ativo
                ? 'bg-transparent text-(--folha)'
                : 'bg-transparent text-(--tinta-2) hover:bg-(--toque) hover:text-(--tinta) disabled:bg-transparent disabled:text-(--tinta-off)',
            )}
          >
            {opcao.rotulo}
          </button>
        )
      })}
    </div>
  )
}
