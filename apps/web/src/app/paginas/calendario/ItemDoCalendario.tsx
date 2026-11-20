import { Link } from 'react-router'

import { cn } from '@/lib/utils'

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

/** Evento: marca de forma, prefixo escrito ("Meta", "Serviço", "Resíduos") e texto. */
export function EventoDoDia({
  item,
  modo = 'linha',
}: {
  item: ItemDoDia
  /** linha: uma linha truncada (mês); quebra: texto pequeno que quebra (semana); inteiro: lista. */
  modo?: 'linha' | 'quebra' | 'inteiro'
}) {
  const f = FORMAS[item.tipo]
  const forte = item.tipo === 'prazo' || item.tipo === 'limite_protocolo'
  const classes = cn(
    'flex min-w-0 gap-(--e-15) rounded-(--raio-mini) text-(--tinta) no-underline',
    modo === 'linha' && 'h-5 items-center px-(--e-1) text-xs',
    modo === 'quebra' && 'items-start px-(--e-1) py-px text-xs',
    modo === 'inteiro' && 'items-start corpo',
    item.link && 'transicao-estado hover:bg-(--toque) hover:no-underline',
  )
  const conteudo = (
    <>
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
      <Link to={item.link} title={item.descricao} className={classes}>
        {conteudo}
      </Link>
    )
  }
  return (
    <span title={item.descricao} className={classes}>
      {conteudo}
    </span>
  )
}
