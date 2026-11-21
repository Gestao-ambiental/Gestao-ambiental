import { Link, NavLink, Outlet, useNavigate } from 'react-router'

import { BotaoTema } from '@/app/layout/BotaoTema'
import { Pagina } from '@/app/paginas/Pagina'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { BarraSuperior } from '@/components/ui/barra-superior'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'
import { MarcaGrama } from '@/components/ui/marca-grama'
import { cn } from '@/lib/utils'

import { ExigeDoisFatores } from './ExigeDoisFatores'
import { useSouOperador } from './operador'

const ABAS: [string, string][] = [
  ['/admin', 'Consultorias'],
  ['/admin/financeiro', 'Financeiro'],
  ['/admin/valor', 'Valor'],
  ['/admin/parametros', 'Parâmetros'],
  ['/admin/lista-de-espera', 'Lista de espera'],
  ['/admin/normas', 'Normas'],
]

function MenuContaCentral() {
  const { sessao, sair } = useSessao()
  const navegar = useNavigate()
  if (!sessao) return null
  const usuario = usuarioDaSessao(sessao)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta de ${usuario.nome}`}
        title={usuario.nome}
        className="inline-flex size-(--controle) cursor-pointer items-center justify-center rounded-(--raio) transicao-estado hover:bg-(--toque)"
      >
        <Avatar nome={usuario.nome} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="flex flex-col px-(--e-3) py-(--e-2)">
          <span className="corpo-medio text-(--tinta)">{usuario.nome}</span>
          <span className="rotulo">{usuario.email}</span>
        </div>
        <DropdownMenuItem
          onSelect={() => {
            void navegar('/')
          }}
        >
          <Icone nome="house" />
          Voltar ao Grama
        </DropdownMenuItem>
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

/**
 * /admin (ADM-01; ADR-0022): fora do contexto de consultoria, porque o operador pode não ser membro
 * de nenhuma. Sem rail: logo, tema e conta. Quem não é operador vê "sem permissão"; o operador
 * passa pelos dois fatores (ADR-0024). Tudo isso é apresentação: as RPCs da central recusam no banco.
 */
export function LayoutCentral() {
  const operador = useSouOperador()

  let conteudo
  if (operador.isPending) {
    conteudo = <Carregando rotulo="Carregando a central" linhas={4} />
  } else if (operador.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível abrir a central."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void operador.refetch()}
      />
    )
  } else if (!operador.data) {
    conteudo = (
      <Pagina titulo="Central administrativa">
        <SemPermissao descricao={null} />
      </Pagina>
    )
  } else {
    conteudo = (
      <ExigeDoisFatores>
        <nav
          aria-label="Central"
          className="-mx-(--e-4) mb-(--e-6) flex gap-(--e-5) overflow-x-auto overflow-y-hidden border-b border-(--regra-forte) px-(--e-4) [scrollbar-width:none] md:mx-0 md:px-0"
        >
          {ABAS.map(([para, rotulo]) => (
            <NavLink
              key={para}
              to={para}
              end={para === '/admin'}
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex h-11 shrink-0 items-center border-b-[3px] titulo-secao whitespace-nowrap no-underline transicao-estado hover:no-underline',
                  isActive
                    ? 'border-(--marca-linha) text-(--tinta)'
                    : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
                )
              }
            >
              {rotulo}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </ExigeDoisFatores>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--e-2) focus:left-(--e-2) focus:z-50 focus:rounded-(--raio) focus:bg-(--flutuante) focus:px-(--e-3) focus:py-(--e-2) focus:shadow-sobreposicao"
      >
        Pular para o conteúdo
      </a>
      <BarraSuperior
        esquerda={
          <>
            <Link
              to="/admin"
              aria-label="Grama, central administrativa"
              className="inline-flex rounded-(--raio) no-underline hover:no-underline"
            >
              <MarcaGrama />
            </Link>
            <span className="hidden corpo-medio text-(--tinta-2) sm:inline">
              Central administrativa
            </span>
          </>
        }
        direita={
          <>
            <BotaoTema />
            <MenuContaCentral />
          </>
        }
      />
      <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 overflow-auto outline-none">
        <div className="mx-auto w-full max-w-[1440px] p-(--e-4) md:p-(--e-6)">{conteudo}</div>
      </main>
    </div>
  )
}
