import { useState } from 'react'

import { CONSULTORIAS_PROVISORIAS, type ConsultoriaResumo } from '@/app/dados-provisorios'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'

function Identificacao({ consultoria }: { consultoria: ConsultoriaResumo }) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate corpo-medio text-(--text)">{consultoria.nome}</span>
      <span className="rotulo">{consultoria.papel}</span>
    </span>
  )
}

/**
 * Consultoria no topo do rail (design system). Com um vínculo só, a seleção é automática e aparece
 * fixa; com mais de um, vira seletor (ACC-04). Só visual até o login: a consultoria escolhida é
 * filtro de tela, e o acesso continua decidido no banco.
 */
export function ConsultoriaAtual({
  consultorias = CONSULTORIAS_PROVISORIAS,
}: {
  consultorias?: readonly ConsultoriaResumo[]
}) {
  const [atualId, setAtualId] = useState(consultorias[0]?.id ?? '')
  const atual = consultorias.find((c) => c.id === atualId)
  if (!atual) return null

  if (consultorias.length === 1) {
    return (
      <div className="px-(--space-050)" aria-label={`Consultoria: ${atual.nome}`} role="group">
        <Identificacao consultoria={atual} />
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Consultoria: ${atual.nome}. Trocar consultoria`}
        className="flex w-full cursor-pointer items-center gap-(--space-100) rounded-(--radius) px-(--space-050) py-(--space-050) transicao-estado hover:bg-(--surface-hover)"
      >
        <Identificacao consultoria={atual} />
        <Icone nome="chevron-down" className="ml-auto text-(--icon)" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Suas consultorias</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={atualId} onValueChange={setAtualId}>
          {consultorias.map((consultoria) => (
            <DropdownMenuRadioItem key={consultoria.id} value={consultoria.id}>
              {consultoria.nome}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
