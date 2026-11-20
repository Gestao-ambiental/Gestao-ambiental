import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { useBloqueio } from '@/app/bloqueio/contexto-bloqueio'
import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useMeusAcessosDeSuporte } from '@/app/consultoria/modo-suporte'
import { useSouOperador } from '@/app/paginas/central/operador'
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
 * Menu da conta (Protótipo 04): nome e e-mail, Meu perfil (foto e cargo), Segurança (dois fatores,
 * ADR-0024), troca de consultoria, Bloquear tela e Sair. Para operador da plataforma, o link da
 * central administrativa (ADM-01).
 */
export function MenuConta() {
  const { sessao, sair } = useSessao()
  const { atual, vinculos, trocar, suporte, abrirSuporte } = useConsultoria()
  const { bloquear } = useBloqueio()
  const navegar = useNavigate()
  // Só para a foto no avatar: sem ela (ou com erro), ficam as iniciais.
  const perfil = useQuery({
    queryKey: ['meu-perfil', atual.membroId],
    queryFn: () => meuPerfil(atual.membroId),
    // Em modo suporte não há membro (nem foto): ficam as iniciais.
    enabled: !suporte,
    retry: false,
  })
  // Só decide se o link aparece; as RPCs da central recusam quem não é operador.
  const operador = useSouOperador()
  // Operador: os acessos de suporte valendo em que entrou aparecem como opção (ADR-0025).
  const acessosDeSuporte = useMeusAcessosDeSuporte()
  if (!sessao) return null
  const usuario = usuarioDaSessao(sessao)
  const ativos = vinculos.filter((v) => v.situacao === 'ativo')
  const comoSuporte = acessosDeSuporte.data ?? []
  const valorAtual = suporte ? `suporte:${atual.consultoriaId}` : atual.consultoriaId

  function escolher(valor: string) {
    if (valor === valorAtual) return
    if (valor.startsWith('suporte:')) {
      // Acesso que acabou entre abrir o menu e escolher: o banco recusa e a opção some.
      void abrirSuporte(valor.slice('suporte:'.length)).catch(() => acessosDeSuporte.refetch())
      return
    }
    trocar(valor)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta de ${usuario.nome}`}
        title={usuario.nome}
        className="inline-flex size-(--controle) cursor-pointer items-center justify-center rounded-(--raio) transicao-estado hover:bg-(--toque)"
      >
        <Avatar nome={usuario.nome} fotoUrl={perfil.data?.fotoUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="flex flex-col px-(--e-3) py-(--e-2)">
          <span className="corpo-medio text-(--tinta)">{usuario.nome}</span>
          <span className="rotulo">{usuario.email}</span>
        </div>
        {suporte ? null : (
          <DropdownMenuItem
            onSelect={() => {
              void navegar('/perfil')
            }}
          >
            <Icone nome="circle-user" />
            Meu perfil
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            void navegar('/seguranca')
          }}
        >
          <Icone nome="settings" />
          Segurança
        </DropdownMenuItem>
        {!suporte && atual.papel === 'gestao' ? (
          <DropdownMenuItem
            onSelect={() => {
              void navegar('/configuracoes/modelos')
            }}
          >
            <Icone nome="file-text" />
            Modelos de documento
          </DropdownMenuItem>
        ) : null}
        {operador.data === true ? (
          <DropdownMenuItem
            onSelect={() => {
              void navegar('/admin')
            }}
          >
            <Icone nome="layout-grid" />
            Central administrativa
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Consultoria</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={valorAtual} onValueChange={escolher}>
          {ativos.map((vinculo) => (
            <DropdownMenuRadioItem key={vinculo.consultoriaId} value={vinculo.consultoriaId}>
              <span className="flex flex-col">
                <span>{vinculo.consultoriaNome}</span>
                <span className="rotulo">{NOMES_PAPEL[vinculo.papel]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
          {comoSuporte.map((acesso) => (
            <DropdownMenuRadioItem
              key={`suporte:${acesso.consultoriaId}`}
              value={`suporte:${acesso.consultoriaId}`}
            >
              <span className="flex flex-col">
                <span>{acesso.consultoriaNome}</span>
                <span className="rotulo">Suporte</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={bloquear}>
          <Icone nome="lock" />
          <span className="flex-1">Bloquear tela</span>
          <kbd className="text-xs text-(--tinta-2)">Ctrl+Shift+L</kbd>
        </DropdownMenuItem>
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
