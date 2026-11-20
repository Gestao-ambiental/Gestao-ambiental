import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

// Controles nativos (teclado e leitor de tela de graça) desenhados como no design system: o
// visual padrão do navegador com a cor da marca escura parecia marcado mesmo desmarcado.
const baseControle =
  'peer size-[18px] shrink-0 cursor-pointer appearance-none border-[1.5px] border-(--campo-borda) bg-(--campo) transicao-estado ' +
  'hover:border-(--tinta-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foco) ' +
  'disabled:cursor-not-allowed disabled:bg-(--off)'

/** Rádio nativo no visual do Grama, para quem monta o próprio cartão (ex.: escolha do plano). */
export const classeRadio = cn(
  baseControle,
  'rounded-full checked:border-[5px] checked:border-(--acao) checked:bg-(--folha)',
)

type Props = Omit<ComponentProps<'input'>, 'type' | 'id'> & {
  rotulo: ReactNode
  id?: string
}

/** Caixa de seleção nativa desenhada no visual do Grama (teclado e leitor de tela de graça). */
export function CaixaSelecao({ rotulo, id, className, ...rest }: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  return (
    <div className={cn('inline-flex items-center gap-(--e-2)', className)}>
      <span className="relative inline-flex">
        <input
          id={campoId}
          type="checkbox"
          className={cn(
            baseControle,
            'rounded-(--raio-mini) checked:border-(--acao) checked:bg-(--acao)',
          )}
          {...rest}
        />
        <Icone
          nome="check"
          tamanho={12}
          className="pointer-events-none invisible absolute top-[3px] left-[3px] text-(--acao-texto) peer-checked:visible"
        />
      </span>
      <label htmlFor={campoId} className="cursor-pointer corpo text-(--tinta)">
        {rotulo}
      </label>
    </div>
  )
}

type PropsRadio = Omit<ComponentProps<'input'>, 'type' | 'id'> & {
  rotulo: ReactNode
  descricao?: ReactNode
  id?: string
}

/** Opção de rádio em cartão (Protótipo 07: papel no convite), com descrição abaixo do rótulo. */
export function OpcaoRadio({ rotulo, descricao, id, className, ...rest }: PropsRadio) {
  const gerado = useId()
  const campoId = id ?? gerado
  // Nome acessível só com o rótulo; a descrição entra como descrição (não polui o nome).
  return (
    <label
      htmlFor={campoId}
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 rounded-(--raio) border px-(--e-3) py-(--e-2) transicao-estado',
        'border-(--regra-forte) has-checked:border-(--marca-linha) has-checked:shadow-[0_0_0_1px_var(--marca-linha)] has-checked:bg-(--escolha) hover:bg-(--toque)',
        className,
      )}
    >
      <span className="inline-flex items-center gap-(--e-2)">
        <input
          id={campoId}
          type="radio"
          aria-labelledby={`${campoId}-rotulo`}
          aria-describedby={descricao ? `${campoId}-descricao` : undefined}
          className={classeRadio}
          {...rest}
        />
        <span id={`${campoId}-rotulo`} className="corpo text-(--tinta)">
          {rotulo}
        </span>
      </span>
      {descricao ? (
        <span id={`${campoId}-descricao`} className="pl-6 text-xs text-(--tinta-2)">
          {descricao}
        </span>
      ) : null}
    </label>
  )
}
