import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
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
import {
  FRESCOR_DA_URL_LOGO_MS,
  chaveDaLogoDaConsultoria,
  obterLogoDaConsultoria,
} from '@/lib/api/identidade'

function LogoDaConsultoria({ url }: { url: string }) {
  const [falhou, setFalhou] = useState(false)
  if (falhou) return null
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-14 shrink-0 rounded-sm bg-white object-contain p-1"
      onError={() => {
        setFalhou(true)
      }}
    />
  )
}

function Identificacao({
  vinculo,
  logoUrl,
  papel,
}: {
  vinculo: Vinculo
  logoUrl: string | null | undefined
  papel?: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-(--e-2) text-left">
      {logoUrl ? <LogoDaConsultoria key={logoUrl} url={logoUrl} /> : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate corpo-medio text-(--tinta)">{vinculo.consultoriaNome}</span>
        <span className="rotulo">{papel ?? NOMES_PAPEL[vinculo.papel]}</span>
      </span>
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
  const { data: logoUrl } = useQuery({
    queryKey: chaveDaLogoDaConsultoria(atual.consultoriaId),
    queryFn: () => obterLogoDaConsultoria(atual.consultoriaId),
    staleTime: FRESCOR_DA_URL_LOGO_MS,
  })

  // Modo suporte (ADR-0025): a consultoria fica fixa; sair é pela faixa do suporte.
  if (ativos.length <= 1 || suporte) {
    return (
      <div
        className="rounded-(--raio) border px-(--e-3) py-(--e-2)"
        aria-label={`Consultoria: ${atual.consultoriaNome}`}
        role="group"
      >
        <Identificacao vinculo={atual} logoUrl={logoUrl} papel={suporte ? 'Suporte' : undefined} />
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Consultoria: ${atual.consultoriaNome}. Trocar consultoria`}
        className="flex w-full cursor-pointer items-center gap-(--e-2) rounded-(--raio) border px-(--e-3) py-(--e-2) transicao-estado hover:bg-(--toque)"
      >
        <Identificacao vinculo={atual} logoUrl={logoUrl} />
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
