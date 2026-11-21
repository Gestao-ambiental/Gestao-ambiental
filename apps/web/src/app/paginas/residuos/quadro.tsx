// Peças do "quadro de partidas" (apps/web/DESIGN.md) usadas pelas telas de resíduos: painel,
// cabeçalho e célula da tabela e rodapé com a contagem. O placar e o segmentado são os de
// components/ui.

import type { ReactNode } from 'react'

/** Painel do quadro: folha com regra de 1px, sem sombra. */
export const classePainel =
  'flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)'

/** Região da tabela: rola na própria região, nunca a página. */
export const classeRegiao = 'max-h-[calc(100dvh-280px)] overflow-auto'

export const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left whitespace-nowrap rotulo-maiusculo text-(--tinta-2)'

export const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

export const classeLinha = 'transicao-estado hover:bg-(--toque)'

/** Item da lista do celular (a tabela vira lista abaixo de md). */
export const classeItemCelular =
  'flex flex-col gap-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0'

/** Título de painel com a contagem em plaqueta escura (como a aba da Visão). */
export function TituloDoPainel({
  id,
  children,
  contagem,
  acoes,
}: {
  id: string
  children: ReactNode
  contagem?: number | null
  acoes?: ReactNode
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-(--e-2) border-b px-(--e-4) py-(--e-2)">
      <h2
        id={id}
        className="flex flex-1 items-center gap-(--e-2) titulo-secao whitespace-nowrap text-(--tinta)"
      >
        {children}
        {contagem === undefined || contagem === null ? null : (
          <span
            aria-hidden="true"
            className="min-w-6 rounded-(--raio-mini) bg-(--tinta) px-(--e-1) text-center text-xs font-semibold text-(--folha) numero"
          >
            {contagem}
          </span>
        )}
      </h2>
      {acoes}
    </div>
  )
}

/** Rodapé do quadro: "5 de 12 MTRs" e, quando houver, o botão de carregar mais. */
export function RodapeDoQuadro({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
      <span className="flex-1 rotulo numero" aria-live="polite">
        {texto}
      </span>
      {children}
    </div>
  )
}
