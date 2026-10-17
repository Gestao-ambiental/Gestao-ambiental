import { Monitor, Moon, Sun } from 'lucide-react'

import { useTema } from '@/app/tema/contexto-tema'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PREFERENCIAS_TEMA, type PreferenciaTema } from '@/lib/tema'

const ROTULOS: Record<PreferenciaTema, string> = {
  claro: 'Claro',
  escuro: 'Escuro',
  sistema: 'Igual ao sistema',
}

const ICONES = { claro: Sun, escuro: Moon, sistema: Monitor } as const

function ehPreferencia(valor: string): valor is PreferenciaTema {
  return (PREFERENCIAS_TEMA as readonly string[]).includes(valor)
}

/** Troca de tema: claro, escuro ou igual ao sistema (lembrado neste navegador). */
export function BotaoTema() {
  const { preferencia, definirPreferencia } = useTema()
  const Icone = ICONES[preferencia]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Tema: ${ROTULOS[preferencia]}. Trocar tema`}
        >
          <Icone aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={preferencia}
          onValueChange={(valor) => {
            if (ehPreferencia(valor)) definirPreferencia(valor)
          }}
        >
          {PREFERENCIAS_TEMA.map((opcao) => {
            const IconeOpcao = ICONES[opcao]
            return (
              <DropdownMenuRadioItem key={opcao} value={opcao}>
                <IconeOpcao aria-hidden="true" />
                {ROTULOS[opcao]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
