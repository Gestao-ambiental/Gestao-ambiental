// Carrossel de imagens em overlay sobre a tela toda (Tela 16 v2): nome do arquivo e "2 de 4" no
// topo, imagem inteira ao centro, setas laterais e fileira de miniaturas. ← e → navegam, Esc fecha;
// o foco fica preso no overlay e volta para quem abriu (Dialog do Radix).
import { Dialog } from 'radix-ui'
import type { KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

import { Icone } from './icone'

export interface ImagemDoCarrossel {
  id: string
  nome: string
  url: string
}

interface Props {
  imagens: readonly ImagemDoCarrossel[]
  /** Índice aberto; null fecha. */
  indice: number | null
  aoMudarIndice: (indice: number | null) => void
}

// Cores fixas do overlay (fundo da especificação, sempre escuro, nos dois temas).
const BRANCO = 'text-(--af-white)'
const BOTAO_REDONDO = cn(
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transicao-estado outline-none',
  'bg-[color-mix(in_srgb,var(--af-white)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--af-white)_24%,transparent)]',
  'focus-visible:shadow-[0_0_0_2px_var(--af-white)]',
  BRANCO,
)

export function CarrosselImagens({ imagens, indice, aoMudarIndice }: Props) {
  const total = imagens.length
  const atual = indice === null ? undefined : imagens[indice]

  function ir(passo: number) {
    if (indice === null || total === 0) return
    aoMudarIndice((indice + passo + total) % total)
  }

  function aoTeclar(evento: KeyboardEvent) {
    if (evento.key === 'ArrowRight') {
      evento.preventDefault()
      ir(1)
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault()
      ir(-1)
    }
  }

  return (
    <Dialog.Root
      open={atual !== undefined}
      onOpenChange={(aberto) => {
        if (!aberto) aoMudarIndice(null)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(15,26,18,0.92)]" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={aoTeclar}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          {atual && indice !== null ? (
            <>
              <div className="flex items-center gap-(--space-150) px-(--space-200) py-(--space-150)">
                <Icone nome="file-text" className={BRANCO} />
                <Dialog.Title className={cn('min-w-0 truncate corpo-medio', BRANCO)}>
                  {atual.nome}
                </Dialog.Title>
                <span
                  className={cn('corpo whitespace-nowrap opacity-80', BRANCO)}
                  aria-live="polite"
                >
                  {indice + 1} de {total}
                </span>
                <span className="flex-1" />
                <Dialog.Close className={BOTAO_REDONDO} aria-label="Fechar" title="Fechar">
                  <Icone nome="x" tamanho={24} />
                </Dialog.Close>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center px-(--space-800) max-md:px-(--space-200)">
                <img
                  src={atual.url}
                  alt={atual.nome}
                  className="max-h-full max-w-full rounded-(--radius) object-contain"
                />
                {total > 1 ? (
                  <>
                    <button
                      type="button"
                      aria-label="Imagem anterior"
                      title="Imagem anterior"
                      onClick={() => {
                        ir(-1)
                      }}
                      className={cn(BOTAO_REDONDO, 'absolute left-(--space-200)')}
                    >
                      <Icone nome="chevron-left" tamanho={24} />
                    </button>
                    <button
                      type="button"
                      aria-label="Próxima imagem"
                      title="Próxima imagem"
                      onClick={() => {
                        ir(1)
                      }}
                      className={cn(BOTAO_REDONDO, 'absolute right-(--space-200)')}
                    >
                      <Icone nome="chevron-right" tamanho={24} />
                    </button>
                  </>
                ) : null}
              </div>

              {total > 1 ? (
                <ul
                  aria-label="Miniaturas"
                  className="flex justify-center gap-(--space-100) overflow-x-auto px-(--space-200) py-(--space-200)"
                >
                  {imagens.map((imagem, i) => (
                    <li key={imagem.id}>
                      <button
                        type="button"
                        aria-label={`Ver ${imagem.nome}`}
                        aria-current={i === indice ? 'true' : undefined}
                        onClick={() => {
                          aoMudarIndice(i)
                        }}
                        className={cn(
                          'block h-12 w-16 cursor-pointer overflow-hidden rounded-(--radius) border-2 outline-none transicao-estado focus-visible:shadow-[0_0_0_2px_var(--af-white)]',
                          i === indice
                            ? 'border-(--af-white)'
                            : 'border-transparent opacity-60 hover:opacity-100',
                        )}
                      >
                        <img src={imagem.url} alt="" className="size-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
