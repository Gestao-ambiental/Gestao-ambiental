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

function Identificacao({ vinculo, papel }: { vinculo: Vinculo; papel?: string }) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate corpo-medio text-(--tinta)">{vinculo.consultoriaNome}</span>
      <span className="rotulo">{papel ?? NOMES_PAPEL[vinculo.papel]}</span>
    </span>
  )
}

/**
 * Consultoria no topo do trilho. Com um vínculo ativo, aparece fixa; com mais de
 * um, vira seletor (ACC-04). A consultoria escolhida é filtro de tela; o acesso é do banco.
 */
export function ConsultoriaAtual() {
  const { atual, vinculos, trocar, suporte } = useConsultoria()
  const ativos = vinculos.filter((v) => v.situacao === 'ativo')

  // Modo suporte (ADR-0025): a consultoria fica fixa; sair é pela faixa do suporte.
  if (ativos.length <= 1 || suporte) {
    return (
      <div
        className="rounded-(--raio) border px-(--e-3) py-(--e-2)"
        aria-label={`Consultoria: ${atual.consultoriaNome}`}
        role="group"
      >
        <Identificacao vinculo={atual} papel={suporte ? 'Suporte' : undefined} />
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Consultoria: ${atual.consultoriaNome}. Trocar consultoria`}
        className="flex w-full cursor-pointer items-center gap-(--e-2) rounded-(--raio) border px-(--e-3) py-(--e-2) transicao-estado hover:bg-(--toque)"
      >
        <Identificacao vinculo={atual} />
        <Icone nome="chevron-down" className="ml-auto text-(--icone)" />
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
