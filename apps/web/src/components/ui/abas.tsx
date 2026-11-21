// Abas do quadro (DESIGN.md): texto 16/700, a ativa com traço de 3px --marca-linha, contagem em
// plaqueta escura (zero não aparece). Duas formas:
// - Abas: estado da tela (tablist/tab, setas, Home/End, seleção segue o foco). Com `idBase`, cada
//   aba aponta (aria-controls) para o PainelDeAba de mesmo idBase e valor.
// - AbasDeFiltro: o mesmo desenho para filtros da mesma lista (grupo de botões com aria-pressed,
//   sem painel próprio; Tab passa por cada uma). O traço da ativa desliza de uma aba para a outra.
// - AbasDeRota: navegação entre rotas (nav com links, aria-current="page").
// No celular a faixa rola na própria região, nunca a página.
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'

import { cn } from '@/lib/utils'

import { IndicadorDeslizante, useIndicadorDeslizante } from './indicador-deslizante'

interface Rotulos {
  rotulo: string
  /** Palavra curta no celular; o rótulo completo segue para o leitor de tela. */
  curto?: string
  /** Contagem na plaqueta. Nula, indefinida ou zero não aparece. */
  contagem?: number | null
  /**
   * Como o leitor de tela lê a contagem (ex.: n => plural(n, 'orçamento', 'orçamentos')). Sem ela,
   * lê o número como aparece.
   */
  lerContagem?: (n: number) => string
  /** Plaqueta em tom de alerta enquanto a aba não está ativa (ex.: pendências). */
  alerta?: boolean
  oculta?: boolean
}

export interface Aba<V extends string> extends Rotulos {
  valor: V
}

export interface AbaDeRota extends Rotulos {
  para: string
  /** Só ativa na rota exata. */
  exata?: boolean
}

const faixa = 'flex w-max min-w-full gap-(--e-5) border-b border-(--regra-forte)'
const rolagem =
  'relative -mx-1 max-w-[calc(100%+8px)] min-w-0 overflow-x-auto overflow-y-hidden px-1 pt-1 [scrollbar-width:none]'

/** Espessura do traço da aba ativa (border-b-[3px]). */
const TRACO = 3

function classeDaAba(ativa: boolean, tracoDeslizante = false) {
  return cn(
    '-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-(--e-2) border-b-[3px] titulo-secao whitespace-nowrap no-underline transicao-estado hover:no-underline',
    ativa
      ? cn('text-(--tinta)', tracoDeslizante ? 'border-transparent' : 'border-(--marca-linha)')
      : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
  )
}

function ConteudoDaAba({ aba, ativa }: { aba: Rotulos; ativa: boolean }) {
  const n = aba.contagem
  const temContagem = typeof n === 'number' && n !== 0
  return (
    <>
      {aba.curto ? (
        <>
          <span aria-hidden="true" className="md:hidden">
            {aba.curto}
          </span>
          <span className="max-md:sr-only">{aba.rotulo}</span>
        </>
      ) : (
        aba.rotulo
      )}
      {temContagem ? (
        <>
          {/* Espaço só para o nome acessível ("Equipe 3"); na faixa flexível ele não ocupa lugar. */}
          {aba.lerContagem ? null : ' '}
          <span
            aria-hidden={aba.lerContagem ? true : undefined}
            className={cn(
              'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
              ativa
                ? 'bg-(--tinta) text-(--folha)'
                : aba.alerta
                  ? 'bg-(--alerta-fundo) text-(--alerta-texto)'
                  : 'bg-(--aperto) text-(--tinta-2)',
            )}
          >
            {n}
          </span>
          {aba.lerContagem ? <span className="sr-only">: {aba.lerContagem(n)}</span> : null}
        </>
      ) : null}
    </>
  )
}

/** Traz a aba ativa para a área visível da faixa sem rolar a página (scrollIntoView rolaria). */
function useAtivaVisivel(faixaRef: RefObject<HTMLElement | null>, chave: string) {
  useEffect(() => {
    const el = faixaRef.current
    const ativa = el?.querySelector<HTMLElement>(
      '[aria-selected="true"], [aria-pressed="true"], [aria-current="page"]',
    )
    if (!el || !ativa) return
    const fora =
      ativa.offsetLeft < el.scrollLeft ||
      ativa.offsetLeft + ativa.offsetWidth > el.scrollLeft + el.clientWidth
    if (fora) el.scrollLeft = Math.max(0, ativa.offsetLeft - 8)
  }, [faixaRef, chave])
}

export function idDaAba(idBase: string, valor: string) {
  return `${idBase}-aba-${valor}`
}

export function idDoPainel(idBase: string, valor: string) {
  return `${idBase}-painel-${valor}`
}

export function Abas<V extends string>({
  rotulo,
  abas,
  valor,
  aoMudar,
  idBase,
  className,
}: {
  /** Nome acessível da lista de abas. */
  rotulo: string
  abas: readonly Aba<V>[]
  valor: V
  aoMudar: (valor: V) => void
  /** Liga cada aba ao seu PainelDeAba (aria-controls). */
  idBase?: string
  className?: string
}) {
  const visiveis = abas.filter((a) => !a.oculta)
  const faixaRef = useRef<HTMLDivElement>(null)
  useAtivaVisivel(faixaRef, `${valor}|${visiveis.map((a) => a.contagem ?? '').join(',')}`)
  // Sem aba ativa visível, a primeira recebe o Tab.
  const focavel = visiveis.some((a) => a.valor === valor) ? valor : visiveis[0]?.valor

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, atual: number) {
    let proxima: number
    if (evento.key === 'ArrowRight') proxima = (atual + 1) % visiveis.length
    else if (evento.key === 'ArrowLeft') proxima = (atual - 1 + visiveis.length) % visiveis.length
    else if (evento.key === 'Home') proxima = 0
    else if (evento.key === 'End') proxima = visiveis.length - 1
    else return
    evento.preventDefault()
    const destino = visiveis[proxima]
    if (!destino) return
    faixaRef.current?.querySelector<HTMLElement>(`[data-valor="${destino.valor}"]`)?.focus()
    if (destino.valor !== valor) aoMudar(destino.valor)
  }

  return (
    <div ref={faixaRef} className={cn(rolagem, className)}>
      <div role="tablist" aria-label={rotulo} className={faixa}>
        {visiveis.map((aba, indice) => {
          const ativa = aba.valor === valor
          return (
            <button
              key={aba.valor}
              type="button"
              role="tab"
              id={idBase ? idDaAba(idBase, aba.valor) : undefined}
              aria-controls={idBase ? idDoPainel(idBase, aba.valor) : undefined}
              aria-selected={ativa}
              tabIndex={aba.valor === focavel ? 0 : -1}
              data-valor={aba.valor}
              onClick={() => {
                if (!ativa) aoMudar(aba.valor)
              }}
              onKeyDown={(evento) => {
                aoTeclar(evento, indice)
              }}
              className={classeDaAba(ativa)}
            >
              <ConteudoDaAba aba={aba} ativa={ativa} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Filtros da mesma lista com o desenho de abas: grupo de botões com aria-pressed. */
export function AbasDeFiltro<V extends string>({
  rotulo,
  abas,
  valor,
  aoMudar,
  className,
}: {
  /** Nome acessível do grupo. */
  rotulo: string
  abas: readonly Aba<V>[]
  valor: V
  aoMudar: (valor: V) => void
  className?: string
}) {
  const visiveis = abas.filter((a) => !a.oculta)
  const faixaRef = useRef<HTMLDivElement>(null)
  const chave = `${valor}|${visiveis.map((a) => a.contagem ?? '').join(',')}`
  useAtivaVisivel(faixaRef, chave)
  // O traço da ativa é um elemento só, que desliza até a aba escolhida (DESIGN.md, "Movimento").
  // Enquanto não há medida com largura (primeira pintura, jsdom), a própria aba desenha o traço.
  const { conteiner, medida, desliza } = useIndicadorDeslizante<HTMLDivElement>(
    '[aria-pressed="true"]',
    chave,
  )
  const tracoDeslizante = medida !== null && medida.largura > 0
  const medidaDoTraco = tracoDeslizante
    ? { ...medida, y: medida.y + medida.altura - TRACO, altura: TRACO }
    : null

  return (
    <div ref={faixaRef} role="group" aria-label={rotulo} className={cn(rolagem, className)}>
      <div ref={conteiner} className={cn(faixa, 'relative')}>
        <IndicadorDeslizante
          medida={medidaDoTraco}
          desliza={desliza}
          className="z-10 bg-(--marca-linha)"
        />
        {visiveis.map((aba) => {
          const ativa = aba.valor === valor
          return (
            <button
              key={aba.valor}
              type="button"
              aria-pressed={ativa}
              onClick={() => {
                if (!ativa) aoMudar(aba.valor)
              }}
              className={classeDaAba(ativa, tracoDeslizante)}
            >
              <ConteudoDaAba aba={aba} ativa={ativa} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Painel de uma aba de estado: mesmo idBase e valor das Abas. */
export function PainelDeAba({
  idBase,
  valor,
  className,
  children,
}: {
  idBase: string
  valor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={idDoPainel(idBase, valor)}
      aria-labelledby={idDaAba(idBase, valor)}
      className={className}
    >
      {children}
    </div>
  )
}

export function AbasDeRota({
  rotulo,
  abas,
  className,
}: {
  /** Nome acessível da navegação. */
  rotulo: string
  abas: readonly AbaDeRota[]
  className?: string
}) {
  const faixaRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const visiveis = abas.filter((a) => !a.oculta)
  useAtivaVisivel(faixaRef, `${pathname}|${visiveis.map((a) => a.contagem ?? '').join(',')}`)

  return (
    <nav ref={faixaRef} aria-label={rotulo} className={cn(rolagem, className)}>
      <ul className={faixa}>
        {visiveis.map((aba) => (
          <li key={aba.para} className="flex shrink-0">
            <NavLink
              to={aba.para}
              end={aba.exata}
              className={({ isActive }) => classeDaAba(isActive)}
            >
              {({ isActive }) => <ConteudoDaAba aba={aba} ativa={isActive} />}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
