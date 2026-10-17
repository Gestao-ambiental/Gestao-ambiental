import { useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'

/** Menu da conta (Protótipo 04): nome e e-mail, troca de consultoria e Sair. */
export function MenuConta() {
  const { sessao, sair } = useSessao()
  const { atual, vinculos, trocar } = useConsultoria()
  const navegar = useNavigate()
  if (!sessao) return null
  const usuario = usuarioDaSessao(sessao)
  const ativos = vinculos.filter((v) => v.situacao === 'ativo')

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
        <DropdownMenuLabel>Consultoria</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={atual.consultoriaId} onValueChange={trocar}>
          {ativos.map((vinculo) => (
            <DropdownMenuRadioItem key={vinculo.consultoriaId} value={vinculo.consultoriaId}>
              <span className="flex flex-col">
                <span>{vinculo.consultoriaNome}</span>
                <span className="rotulo">{NOMES_PAPEL[vinculo.papel]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void sair().then(() => navegar('/entrar', { replace: true }))
          }}
        >
          <Icone nome="log-out" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
