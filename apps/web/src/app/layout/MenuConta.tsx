import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
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
import { meuPerfil } from '@/lib/api/perfil'

/**
 * Menu da conta (Protótipo 04): nome e e-mail, Meu perfil, troca de consultoria e Sair.
 */
export function MenuConta() {
  const { sessao, sair } = useSessao()
  const { atual, vinculos, trocar } = useConsultoria()
  const [falhaAoSair, setFalhaAoSair] = useState(false)
  const navegar = useNavigate()
  // Só para a foto no avatar: sem ela (ou com erro), ficam as iniciais.
  const perfil = useQuery({
    queryKey: ['meu-perfil', atual.membroId],
    queryFn: () => meuPerfil(atual.membroId),
    retry: false,
  })
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
        <Avatar nome={usuario.nome} fotoUrl={perfil.data?.fotoUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="flex flex-col px-(--space-150) py-(--space-100)">
          <span className="corpo-medio text-(--text)">{usuario.nome}</span>
          <span className="rotulo">{usuario.email}</span>
        </div>
        <DropdownMenuItem
          onSelect={() => {
            void navegar('/perfil')
          }}
        >
          <Icone nome="circle-user" />
          Meu perfil
        </DropdownMenuItem>
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
            setFalhaAoSair(false)
            void sair().then((terminou) => {
              if (terminou) void navegar('/entrar', { replace: true })
              else setFalhaAoSair(true)
            })
          }}
        >
          <Icone nome="log-out" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
      {falhaAoSair && (
        <p role="alert" className="corpo text-(--text-danger)">
          Não foi possível sair da conta. Tente novamente.
        </p>
      )}
    </DropdownMenu>
  )
}
