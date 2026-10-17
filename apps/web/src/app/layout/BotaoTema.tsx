import { useTema } from '@/app/tema/contexto-tema'
import { BotaoIcone } from '@/components/ui/botao-icone'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PREFERENCIAS_TEMA, type PreferenciaTema } from '@/lib/tema'

const ROTULOS: Record<PreferenciaTema, string> = {
  claro: 'Claro',
  escuro: 'Escuro',
  sistema: 'Igual ao sistema',
}

function ehPreferencia(valor: string): valor is PreferenciaTema {
  return (PREFERENCIAS_TEMA as readonly string[]).includes(valor)
}

/** Troca de tema: claro (padrão), escuro ou igual ao sistema, lembrado neste navegador. */
export function BotaoTema() {
  const { preferencia, tema, definirPreferencia } = useTema()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BotaoIcone
          icone={tema === 'escuro' ? 'moon' : 'sun'}
          rotulo={`Tema: ${ROTULOS[preferencia]}. Trocar tema`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferencia}
          onValueChange={(valor) => {
            if (ehPreferencia(valor)) definirPreferencia(valor)
          }}
        >
          {PREFERENCIAS_TEMA.map((opcao) => (
            <DropdownMenuRadioItem key={opcao} value={opcao}>
              {ROTULOS[opcao]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
