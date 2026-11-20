// Peças do "quadro de partidas" (apps/web/DESIGN.md) usadas pelas telas de resíduos: painel,
// cabeçalho e célula da tabela, placar de contadores que filtram e rodapé com a contagem.

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

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
            className="min-w-6 rounded-(--raio-mini) bg-(--tinta) px-(--e-1) text-center text-xs font-[800] text-(--folha) numero"
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

/**
 * Contador do placar (mesmo desenho do placar da Visão): número de 40px e rótulo embaixo; ativo
 * com fundo de escolha e traço de 3px. Zero fica apagado.
 */
export function Contador({
  rotulo,
  valor,
  ativo,
  tom,
  aoClicar,
}: {
  rotulo: string
  valor: number
  ativo: boolean
  tom?: 'atraso' | 'alerta'
  aoClicar: () => void
}) {
  const aceso = valor > 0
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={cn(
        'group relative flex min-w-[140px] flex-1 cursor-pointer flex-col items-start gap-(--e-1) px-(--e-5) py-(--e-4) text-left transicao-estado hover:bg-(--toque)',
        'after:absolute after:inset-x-(--e-5) after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-transparent',
        ativo && 'bg-(--escolha) after:bg-(--marca-linha) hover:bg-(--escolha-toque)',
      )}
    >
      <span
        className={cn(
          'numero-grande',
          !aceso && 'text-(--tinta-3)',
          aceso && tom === 'atraso' && 'text-(--atraso-texto)',
          aceso && tom === 'alerta' && 'text-(--alerta-texto)',
          aceso && tom === undefined && 'text-(--tinta)',
        )}
      >
        {valor}
      </span>{' '}
      <span className="corpo-medio text-(--tinta-2) group-aria-pressed:text-(--tinta)">
        {rotulo}
      </span>
    </button>
  )
}

/** Faixa do placar: uma peça só, dividida por regras (duas colunas no celular). */
export function Placar({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-(--raio-painel) border bg-(--folha) md:flex md:divide-y-0"
    >
      {children}
    </div>
  )
}

/** Escolha segmentada (poucas opções, um clique): botões com aria-pressed. */
export function Segmentos<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string }[]
  valor: T
  aoMudar: (valor: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="inline-flex shrink-0 overflow-hidden rounded-(--raio) border border-(--regra-forte)"
    >
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => {
              aoMudar(opcao.valor)
            }}
            className={cn(
              'h-(--controle) cursor-pointer border-l border-(--regra-forte) px-(--e-3) corpo-medio transicao-estado first:border-l-0 max-md:h-(--controle-toque)',
              ativo
                ? 'bg-(--tinta) text-(--folha)'
                : 'bg-(--folha) text-(--tinta-2) hover:bg-(--toque) hover:text-(--tinta)',
            )}
          >
            {opcao.rotulo}
          </button>
        )
      })}
    </div>
  )
}
