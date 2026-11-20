import { useId, useState, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { BotaoIcone } from './botao-icone'

type Props = Omit<ComponentProps<'input'>, 'id'> & {
  rotulo: string
  /** Texto de apoio abaixo do campo; some quando há erro. */
  ajuda?: ReactNode
  /** Ao lado do rótulo, à direita (ex.: a marca da IA). */
  acessorio?: ReactNode
  erro?: string
  /** Campo de senha com botão "Mostrar senha" / "Ocultar senha". */
  senha?: boolean
  id?: string
}

/**
 * Campo de texto com rótulo em cima, ajuda e erro.
 * O erro fica ligado ao campo por aria-describedby e marca aria-invalid; nunca só pela cor.
 */
export function CampoTexto({
  rotulo,
  ajuda,
  acessorio,
  erro,
  senha = false,
  id,
  type,
  className,
  ...rest
}: Props) {
  const gerado = useId()
  const campoId = id ?? gerado
  const apoioId = `${campoId}-apoio`
  const [mostrar, setMostrar] = useState(false)
  const apoio = erro ?? ajuda

  return (
    <div className={cn('flex flex-col gap-(--e-1)', className)}>
      <div className="flex min-h-5 items-center gap-(--e-2)">
        <label htmlFor={campoId} className="flex-1 rotulo text-(--tinta)">
          {rotulo}
        </label>
        {acessorio}
      </div>
      <div className="relative flex items-center">
        <input
          id={campoId}
          type={senha ? (mostrar ? 'text' : 'password') : type}
          aria-invalid={erro ? true : undefined}
          aria-describedby={apoio ? apoioId : undefined}
          className={cn(
            'h-(--controle) max-md:h-(--controle-toque) w-full rounded-(--raio) border bg-(--campo) px-(--e-3) corpo text-(--tinta) transicao-estado outline-none',
            'border-(--campo-borda) hover:border-(--tinta-3) focus:border-(--campo-borda-ativa) focus:bg-(--campo-foco) focus:shadow-[0_0_0_1px_var(--campo-borda-ativa)]',
            'disabled:cursor-not-allowed disabled:bg-(--off) disabled:text-(--tinta-off)',
            'read-only:bg-(--off) read-only:text-(--tinta-2)',
            erro &&
              'border-(--atraso) focus:border-(--atraso) focus:shadow-[0_0_0_1px_var(--atraso)]',
            senha && 'pr-(--e-8)',
          )}
          {...rest}
        />
        {senha ? (
          <BotaoIcone
            icone="eye"
            rotulo={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
            selecionado={mostrar}
            tamanho="compacto"
            className="absolute right-(--e-1)"
            onClick={() => {
              setMostrar((valor) => !valor)
            }}
          />
        ) : null}
      </div>
      {apoio ? (
        <span
          id={apoioId}
          className={cn('text-xs', erro ? 'font-[650] text-(--atraso-texto)' : 'text-(--tinta-2)')}
        >
          {apoio}
        </span>
      ) : null}
    </div>
  )
}
