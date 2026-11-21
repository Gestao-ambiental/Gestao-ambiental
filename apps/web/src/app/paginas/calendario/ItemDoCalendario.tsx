import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { estiloDaCategoria, type Categoria } from './colorir-por'
import type { ItemDoDia, TipoDoItem } from './itens-do-calendario'

/*
 * Cada tipo tem uma forma própria além da cor (WCAG 1.4.1): quadrado cheio = prazo oficial,
 * quadrado vazado = meta interna, triângulo = limite de protocolo, anel = validade, losango =
 * serviço, círculo cheio = resíduos.
 */
const FORMAS: Record<TipoDoItem, { forma: string; tinta: string }> = {
  prazo: { forma: 'size-2 bg-current', tinta: 'text-(--tinta)' },
  meta: {
    forma: 'size-2 rounded-[1px] border-[1.5px] border-current',
    tinta: 'text-(--tinta-2)',
  },
  limite_protocolo: {
    forma: 'h-0 w-0 border-x-[4.5px] border-b-[8px] border-x-transparent border-b-current',
    tinta: 'text-(--alerta-texto)',
  },
  validade: {
    forma: 'size-2 rounded-full border-[1.5px] border-current',
    tinta: 'text-(--andamento-texto)',
  },
  tarefa: { forma: 'size-[7px] rotate-45 bg-current', tinta: 'text-(--tinta)' },
  residuo: {
    forma: 'size-2 rounded-full bg-current',
    tinta: 'text-(--ok-texto)',
  },
}

/** Marca de forma do tipo, na cor do tipo. Decorativa: o tipo também vai escrito. */
export function MarcaDoTipo({ tipo, className }: { tipo: TipoDoItem; className?: string }) {
  const f = FORMAS[tipo]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-2.5 shrink-0 items-center justify-center',
        f.tinta,
        className,
      )}
    >
      <span className={cn('inline-block', f.forma)} />
    </span>
  )
}

/** Sigla da categoria (área ou pessoa) junto da cor: a informação nunca vai só na cor. */
export function SiglaDaCategoria({ categoria }: { categoria: Categoria }) {
  const { fundo, forte } = estiloDaCategoria(categoria.cor)
  return (
    <span
      aria-hidden
      style={{ backgroundColor: fundo, borderColor: forte }}
      className="inline-flex h-4 min-w-6 shrink-0 items-center justify-center rounded-(--raio-mini) border px-[3px] text-[10px] leading-none font-[800] text-(--tinta)"
    >
      {categoria.sigla}
    </span>
  )
}

/**
 * Evento: marca de forma, prefixo escrito ("Meta", "Serviço", "Resíduos") e texto. Com
 * `categoria` (colorir por área ou pessoa), ganha o fundo suave e o traço forte da categoria, a
 * sigla dela e o nome no title.
 */
export function EventoDoDia({
  item,
  modo = 'linha',
  categoria,
}: {
  item: ItemDoDia
  categoria?: Categoria | null
  /** linha: uma linha truncada (mês); quebra: texto pequeno que quebra (semana); inteiro: lista. */
  modo?: 'linha' | 'quebra' | 'inteiro'
}) {
  const f = FORMAS[item.tipo]
  const forte = item.tipo === 'prazo' || item.tipo === 'limite_protocolo'
  const cores = categoria ? estiloDaCategoria(categoria.cor) : null
  const classes = cn(
    'flex min-w-0 gap-(--e-15) rounded-(--raio-mini) text-(--tinta) no-underline',
    modo === 'linha' && 'h-5 items-center px-(--e-1) text-xs',
    modo === 'quebra' && 'items-start px-(--e-1) py-px text-xs',
    modo === 'inteiro' && 'items-start corpo',
    item.link && 'transicao-estado hover:bg-(--toque) hover:no-underline',
    cores && modo !== 'inteiro' && 'pl-(--e-15)',
  )
  const estilo = cores
    ? { backgroundColor: cores.fundo, boxShadow: `inset 3px 0 0 ${cores.forte}` }
    : undefined
  // O title diz a categoria (a pessoa já vem no texto de apoio; a área, não).
  const titulo =
    categoria && !item.descricao.includes(categoria.rotulo)
      ? `${item.descricao} · ${categoria.rotulo}`
      : item.descricao
  const conteudo = (
    <>
      {categoria && modo !== 'inteiro' ? <SiglaDaCategoria categoria={categoria} /> : null}
      <MarcaDoTipo
        tipo={item.tipo}
        className={modo === 'quebra' ? 'mt-[3px]' : modo === 'inteiro' ? 'mt-[5px]' : undefined}
      />
      {item.prefixo ? (
        <span className={cn('shrink-0 font-[750]', f.tinta)}>{item.prefixo}</span>
      ) : null}
      <span
        className={cn(
          'min-w-0',
          modo === 'linha' && 'truncate',
          modo === 'quebra' && 'flex-1 hyphens-auto',
          modo === 'inteiro' && 'break-words',
          forte && 'font-[650]',
          item.tipo === 'meta' && 'text-(--tinta-2)',
          (item.tipo === 'limite_protocolo' || item.tipo === 'validade') && f.tinta,
        )}
      >
        {item.texto}
        {item.semResponsavel && modo === 'quebra' ? (
          <span className="block font-normal text-(--tinta-2)">sem resp.</span>
        ) : null}
      </span>
      {/* Na lista a linha de apoio já diz "sem responsável"; na semana vai embaixo do texto. */}
      {item.semResponsavel && modo === 'linha' ? (
        <span className="shrink-0 text-(--tinta-2)">sem resp.</span>
      ) : null}
    </>
  )
  if (item.link) {
    return (
      <Link
        to={item.link}
        title={titulo}
        style={modo === 'inteiro' ? undefined : estilo}
        className={classes}
      >
        {conteudo}
      </Link>
    )
  }
  return (
    <span title={titulo} style={modo === 'inteiro' ? undefined : estilo} className={classes}>
      {conteudo}
    </span>
  )
}
