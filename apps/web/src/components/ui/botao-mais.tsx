// Botão "…" com o menu das ações que não são a principal da tela ou da linha.
// Na tela: "Mais ações", contorno padrão. Na linha: "Ações de <nome>", sutil. Alvo de 44px no
// celular (vem do BotaoIcone). Sem itens visíveis, o botão não aparece.
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import { BotaoIcone } from './botao-icone'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Icone, type NomeIcone } from './icone'

interface ItemBase {
  rotulo: string
  icone?: NomeIcone
  /** Linha menor embaixo do rótulo (ex.: o motivo de estar desabilitado). */
  detalhe?: string
  /** Ação destrutiva: texto em vermelho. */
  perigo?: boolean
  desabilitado?: boolean
  /** Fica de fora do menu. */
  oculto?: boolean
  /** Linha fina antes do item, para separar grupos. */
  separadoAntes?: boolean
  /** Chave do React quando o rótulo se repete. */
  chave?: string
}

export type ItemDoMenuMais =
  | (ItemBase & { aoEscolher: () => void; para?: never })
  | (ItemBase & { para: string; aoEscolher?: never })

interface Props {
  itens: readonly ItemDoMenuMais[]
  /** Nome acessível. Padrão "Mais ações"; com `de`, "Ações de <de>". */
  rotulo?: string
  /** Nome do que a linha representa (ex.: a pessoa, o número do orçamento). */
  de?: string
  /** Padrão na tela, sutil na linha (com `de`). */
  aparencia?: 'padrao' | 'sutil'
  desabilitado?: boolean
  className?: string
}

export function BotaoMais({
  itens,
  rotulo,
  de,
  aparencia,
  desabilitado = false,
  className,
}: Props) {
  const visiveis = itens.filter((item) => !item.oculto)
  if (visiveis.length === 0) return null
  const nome = rotulo ?? (de ? `Ações de ${de}` : 'Mais ações')
  const comDetalhe = visiveis.some((item) => Boolean(item.detalhe))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BotaoIcone
          icone="ellipsis"
          rotulo={nome}
          aparencia={aparencia ?? (de ? 'sutil' : 'padrao')}
          disabled={desabilitado}
          className={className}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(comDetalhe && 'max-w-[280px]')}>
        {visiveis.map((item, indice) => {
          const conteudo = (
            <>
              {item.icone ? <Icone nome={item.icone} /> : null}
              {item.detalhe ? (
                <span className="flex flex-col">
                  <span>{item.rotulo}</span>
                  <span className="text-xs text-(--tinta-2)">{item.detalhe}</span>
                </span>
              ) : (
                item.rotulo
              )}
            </>
          )
          const classe = cn(
            item.perigo && 'text-(--atraso-texto)',
            item.detalhe &&
              'h-auto min-h-(--controle) py-(--e-1) whitespace-normal max-md:h-auto max-md:min-h-(--controle-toque)',
          )
          return (
            <MenuItem
              key={item.chave ?? item.rotulo}
              separar={indice > 0 && item.separadoAntes === true}
            >
              {item.para === undefined ? (
                <DropdownMenuItem
                  disabled={item.desabilitado}
                  className={classe}
                  onSelect={() => {
                    item.aoEscolher()
                  }}
                >
                  {conteudo}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={item.desabilitado} className={classe} asChild>
                  <Link to={item.para}>{conteudo}</Link>
                </DropdownMenuItem>
              )}
            </MenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuItem({ separar, children }: { separar: boolean; children: ReactNode }) {
  return (
    <>
      {separar ? <DropdownMenuSeparator /> : null}
      {children}
    </>
  )
}
