import { LogOut } from 'lucide-react'

import { USUARIO_PROVISORIO } from '@/app/dados-provisorios'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Menu da conta. "Sair" fica desabilitado até existir login (épico 2): nada finge funcionar. */
export function MenuConta() {
  const usuario = USUARIO_PROVISORIO

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={`Conta de ${usuario.nome}`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground ring-1 ring-border"
          >
            {usuario.iniciais}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span>{usuario.nome}</span>
          <span className="text-sm font-normal text-muted-foreground">{usuario.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut aria-hidden="true" />
          Sair (disponível com o login)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
