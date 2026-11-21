import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Medida do número: `grande` 40px (contagens); `medio` 22px até 1280px e 40px acima (reais,
 * horas); `compacto` 22px sempre (placar denso, dentro de painel ou com muitas casas).
 */
export type TamanhoDoPlacar = 'grande' | 'medio' | 'compacto'

type Colunas = 3 | 4 | 5 | 6

interface ContextoDoPlacar {
  /** Todas as casas são estáticas: a faixa vira lista de definição (dt/dd). */
  lista: boolean
  tamanho: TamanhoDoPlacar
  colunas: Colunas | undefined
}

const Contexto = createContext<ContextoDoPlacar>({
  lista: false,
  tamanho: 'grande',
  colunas: undefined,
})

const CLASSE_DO_NUMERO: Record<TamanhoDoPlacar, string> = {
  grande: 'numero-grande',
  medio: 'numero-contagem xl:numero-grande',
  compacto: 'numero-contagem',
}

/** Palavra no lugar do número ("Sem preço", "Juntando dados"): medida de título, que quebra linha. */
const CLASSE_DA_PALAVRA: Record<TamanhoDoPlacar, string> = {
  grande: 'titulo-tela',
  medio: 'titulo-painel xl:titulo-tela',
  compacto: 'titulo-painel',
}

/** Altura da linha do número: palavras ("Sem preço") e números de medidas diferentes alinham. */
const ALTURA_DO_NUMERO: Record<TamanhoDoPlacar, string> = {
  grande: 'min-h-10',
  medio: 'min-h-[22px] xl:min-h-10',
  compacto: 'min-h-[22px]',
}

const COLUNAS: Record<Colunas, string> = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
}

function temAcao(filho: ReactNode): boolean {
  return isValidElement<{ aoClicar?: unknown }>(filho) && filho.props.aoClicar !== undefined
}

/**
 * Placar (DESIGN.md, "Placar"): uma faixa só, dividida por regras, número grande em cima e rótulo
 * embaixo. Não são cartões soltos. No celular, grade de 2 colunas. Com `colunas`, a faixa quebra
 * em linhas iguais (placar denso da central). Sem `moldura`, fica solta dentro de um painel.
 */
export function Placar({
  rotulo,
  children,
  tamanho = 'grande',
  colunas,
  moldura = true,
  className,
}: {
  /** Nome acessível do grupo. */
  rotulo: string
  children: ReactNode
  tamanho?: TamanhoDoPlacar
  /** Casas por linha a partir de sm; sem isso, uma faixa só a partir de md. */
  colunas?: Colunas
  moldura?: boolean
  className?: string
}) {
  const lista = !Children.toArray(children).some(temAcao)
  const Faixa = lista ? 'dl' : 'div'
  // As regras são a borda direita e de baixo de cada casa; a margem negativa esconde as da última
  // coluna e da última linha dentro da moldura.
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn(
        'min-w-0 overflow-hidden',
        moldura && 'rounded-(--raio-painel) border bg-(--folha)',
        className,
      )}
    >
      <Contexto value={{ lista, tamanho, colunas }}>
        <Faixa
          className={cn(
            '-mr-px -mb-px grid grid-cols-2',
            colunas ? COLUNAS[colunas] : 'md:flex md:flex-wrap',
          )}
        >
          {children}
        </Faixa>
      </Contexto>
    </div>
  )
}

/**
 * Uma casa do placar. Com `aoClicar`, é um botão que filtra (aria-pressed = `ativo`, traço de 3px
 * embaixo); sem, um bloco estático. Zero fica apagado em tinta clara; `tom` só acende com valor.
 */
export function ItemDoPlacar({
  rotulo,
  valor,
  detalhe,
  tom,
  apagado,
  ativo = false,
  aoClicar,
}: {
  rotulo: string
  valor: ReactNode
  /** Linha curta embaixo do rótulo (ex.: "3 de 4", "Subiu 2 contra o mês anterior"). */
  detalhe?: ReactNode
  /** `atraso` em vermelho, `alerta` em âmbar, `hoje` com a plaqueta verde. */
  tom?: 'atraso' | 'alerta' | 'hoje'
  /** Sem valor para mostrar; o padrão é apagar o zero. */
  apagado?: boolean
  ativo?: boolean
  aoClicar?: () => void
}) {
  const { lista, tamanho, colunas } = useContext(Contexto)
  const aceso = !(apagado ?? valor === 0)
  const palavra = typeof valor === 'string' && !/\d/.test(valor)

  const classeCasa = cn(
    'relative flex min-w-0 flex-col items-start gap-(--e-1) border-r border-b border-(--regra) text-left',
    tamanho === 'compacto' ? 'px-(--e-4) py-(--e-3)' : 'px-(--e-5) py-(--e-4)',
    colunas
      ? 'max-sm:last:odd:col-span-2'
      : 'max-md:last:odd:col-span-2 md:min-w-[140px] md:flex-1',
  )
  const classeValor = cn(
    'flex items-end',
    ALTURA_DO_NUMERO[tamanho],
    palavra ? CLASSE_DA_PALAVRA[tamanho] : CLASSE_DO_NUMERO[tamanho],
    !aceso && 'text-(--tinta-3)',
    aceso && tom === 'atraso' && 'text-(--atraso-texto)',
    aceso && tom === 'alerta' && 'text-(--alerta-texto)',
    aceso && tom !== 'atraso' && tom !== 'alerta' && 'text-(--tinta)',
  )
  const numero =
    aceso && tom === 'hoje' ? (
      <span className="rounded-(--raio-mini) bg-(--sinal) px-(--e-2) text-(--sinal-texto)">
        {valor}
      </span>
    ) : (
      valor
    )
  const classeRotulo = 'corpo-medio text-(--tinta-2)'
  const classeDetalhe =
    'flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-05) rotulo text-(--tinta-2) numero'

  if (aoClicar) {
    return (
      <button
        type="button"
        aria-pressed={ativo}
        onClick={aoClicar}
        className={cn(
          classeCasa,
          'group cursor-pointer transicao-estado hover:bg-(--toque) focus-visible:outline-offset-[-4px]',
          'after:absolute after:inset-x-(--e-5) after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-transparent',
          ativo && 'bg-(--escolha) after:bg-(--marca-linha) hover:bg-(--escolha-toque)',
        )}
      >
        <span className={classeValor}>{numero}</span>{' '}
        <span className={cn(classeRotulo, 'group-aria-pressed:text-(--tinta)')}>{rotulo}</span>
        {detalhe ? (
          <>
            {' '}
            <span className={classeDetalhe}>{detalhe}</span>
          </>
        ) : null}
      </button>
    )
  }

  if (lista) {
    // dt antes do dd no HTML (leitor de tela lê "rótulo: valor"); na tela, o número vem primeiro.
    return (
      <div className={classeCasa}>
        <dt className={cn(classeRotulo, 'order-2')}>{rotulo}</dt>
        <dd className={cn(classeValor, 'order-1')}>{numero}</dd>
        {detalhe ? <dd className={cn(classeDetalhe, 'order-3')}>{detalhe}</dd> : null}
      </div>
    )
  }

  return (
    <div className={classeCasa}>
      <span className={classeValor}>{numero}</span> <span className={classeRotulo}>{rotulo}</span>
      {detalhe ? <span className={classeDetalhe}>{detalhe}</span> : null}
    </div>
  )
}
