import { USUARIO_PROVISORIO } from '@/app/dados-provisorios'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'

/** Menu da conta. "Sair" fica desabilitado até existir login (épico 2): nada finge funcionar. */
export function MenuConta() {
  const usuario = USUARIO_PROVISORIO

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta de ${usuario.nome}`}
        title={usuario.nome}
        className="inline-flex size-(--size-control) cursor-pointer items-center justify-center rounded-(--radius) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Avatar nome={usuario.nome} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="flex flex-col px-(--space-150) py-(--space-100)">
          <span className="corpo-medio text-(--text)">{usuario.nome}</span>
          <span className="rotulo">{usuario.email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="sr-only">Ações da conta</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Icone nome="log-out" />
          Sair (disponível com o login)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
