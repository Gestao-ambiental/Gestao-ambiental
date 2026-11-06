import { useMutation } from '@tanstack/react-query'

import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import { urlDoArquivo } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

import { tamanhoLegivel } from './apoio'

export interface ItemDeAnexo {
  chave: string
  nome: string
  tamanho: number
  /** Miniatura (imagem); sem ela, ícone de documento. */
  miniaturaUrl: string | null
  /** Arquivo já no Storage: clicar abre em nova aba. */
  caminho: string | null
}

interface Props {
  itens: readonly ItemDeAnexo[]
  /** Clicar na miniatura abre o carrossel nesta imagem. */
  aoAbrirImagem?: (chave: string) => void
  aoRemover?: (chave: string) => void
  rotulo: string
}

/** Linhas de 40px com borda: miniatura ou ícone, nome com reticências, tamanho e remover. */
export function ListaAnexos({ itens, aoAbrirImagem, aoRemover, rotulo }: Props) {
  const abrir = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  if (itens.length === 0) return null
  return (
    <>
      <ul aria-label={rotulo} className="flex flex-col gap-(--space-100)">
        {itens.map((item) => {
          const imagem = item.miniaturaUrl !== null
          return (
            <li
              key={item.chave}
              className="flex h-(--row-height) items-center gap-(--space-100) rounded-(--radius) border px-(--space-100)"
            >
              {imagem && aoAbrirImagem ? (
                <button
                  type="button"
                  aria-label={`Ver ${item.nome}`}
                  onClick={() => {
                    aoAbrirImagem(item.chave)
                  }}
                  className="size-7 shrink-0 cursor-pointer overflow-hidden rounded-(--radius) outline-none focus-visible:shadow-(--focus-ring)"
                >
                  <img src={item.miniaturaUrl ?? ''} alt="" className="size-full object-cover" />
                </button>
              ) : imagem ? (
                <img
                  src={item.miniaturaUrl ?? ''}
                  alt=""
                  className="size-7 shrink-0 rounded-(--radius) object-cover"
                />
              ) : (
                <span className="inline-flex size-7 shrink-0 items-center justify-center">
                  <Icone nome="file-text" className="text-(--icon)" />
                </span>
              )}
              {item.caminho && !imagem ? (
                <button
                  type="button"
                  onClick={() => {
                    if (item.caminho) abrir.mutate(item.caminho)
                  }}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left corpo text-(--text) hover:underline"
                  title={item.nome}
                >
                  {item.nome}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate corpo" title={item.nome}>
                  {item.nome}
                </span>
              )}
              <span className="shrink-0 text-xs text-(--text-subtle) tabular-nums">
                {tamanhoLegivel(item.tamanho)}
              </span>
              {aoRemover ? (
                <BotaoIcone
                  icone="x"
                  rotulo={`Remover ${item.nome}`}
                  tamanho="compacto"
                  onClick={() => {
                    aoRemover(item.chave)
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
      {abrir.isError ? (
        <p role="alert" className="text-xs text-(--text-danger)">
          {mensagemDoErro(abrir.error)}
        </p>
      ) : null}
    </>
  )
}
