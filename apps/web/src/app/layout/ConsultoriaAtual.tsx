import { NOMES_PAPEL } from '@/app/papeis'
import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'
import type { Vinculo } from '@/lib/api/acesso'

function Identificacao({ vinculo }: { vinculo: Vinculo }) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate corpo-medio text-(--text)">{vinculo.consultoriaNome}</span>
      <span className="rotulo">{NOMES_PAPEL[vinculo.papel]}</span>
    </span>
  )
}

/**
 * Consultoria no topo do rail (design system). Com um vínculo ativo, aparece fixa; com mais de
 * um, vira seletor (ACC-04). A consultoria escolhida é filtro de tela; o acesso é do banco.
 */
export function ConsultoriaAtual() {
  const { atual, vinculos, trocar } = useConsultoria()
  const ativos = vinculos.filter((v) => v.situacao === 'ativo')

  if (ativos.length <= 1) {
    return (
      <div
        className="px-(--space-050)"
        aria-label={`Consultoria: ${atual.consultoriaNome}`}
        role="group"
      >
        <Identificacao vinculo={atual} />
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Consultoria: ${atual.consultoriaNome}. Trocar consultoria`}
        className="flex w-full cursor-pointer items-center gap-(--space-100) rounded-(--radius) px-(--space-050) py-(--space-050) transicao-estado hover:bg-(--surface-hover)"
      >
        <Identificacao vinculo={atual} />
        <Icone nome="chevron-down" className="ml-auto text-(--icon)" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Suas consultorias</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={atual.consultoriaId} onValueChange={trocar}>
          {ativos.map((vinculo) => (
            <DropdownMenuRadioItem key={vinculo.consultoriaId} value={vinculo.consultoriaId}>
              {vinculo.consultoriaNome}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
