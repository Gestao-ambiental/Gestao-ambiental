import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

import { CONSULTORIAS_PROVISORIAS } from '@/app/dados-provisorios'
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
import { cn } from '@/lib/utils'

/**
 * Seletor de consultoria (só visual até ACC-04). A consultoria escolhida é filtro de tela;
 * o acesso continua sendo "membro ativo desta consultoria", decidido no banco.
 */
export function SeletorConsultoria({ className }: { className?: string }) {
  const [atualId, setAtualId] = useState(CONSULTORIAS_PROVISORIAS[0]?.id ?? '')
  const atual = CONSULTORIAS_PROVISORIAS.find((c) => c.id === atualId)
  if (!atual) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('h-auto min-w-0 justify-start gap-2 px-2 py-1.5 text-left', className)}
          aria-label={`Consultoria: ${atual.nome}. Trocar consultoria`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            {atual.sigla}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-semibold">{atual.nome}</span>
            <span className="text-sm text-muted-foreground">{atual.papel}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Suas consultorias</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={atualId} onValueChange={setAtualId}>
          {CONSULTORIAS_PROVISORIAS.map((consultoria) => (
            <DropdownMenuRadioItem key={consultoria.id} value={consultoria.id}>
              <span className="flex flex-col">
                <span>{consultoria.nome}</span>
                <span className="text-sm text-muted-foreground">{consultoria.papel}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
