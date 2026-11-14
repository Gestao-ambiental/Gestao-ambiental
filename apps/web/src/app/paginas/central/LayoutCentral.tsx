import { Link, Outlet, useNavigate } from 'react-router'

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

import { ExigeDoisFatores } from './ExigeDoisFatores'
import { useSouOperador } from './operador'

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
        className="inline-flex size-(--size-control) cursor-pointer items-center justify-center rounded-(--radius) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Avatar nome={usuario.nome} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className="flex flex-col px-(--space-150) py-(--space-100)">
          <span className="corpo-medio text-(--text)">{usuario.nome}</span>
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
        <nav aria-label="Central" className="mb-(--space-200) flex flex-wrap gap-(--space-100)">
          <Link to="/admin">Consultorias</Link>
          <Link to="/admin/financeiro">Financeiro</Link>
          <Link to="/admin/valor">Valor</Link>
          <Link to="/admin/parametros">Parâmetros</Link>
        </nav>
        <Outlet />
      </ExigeDoisFatores>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--space-100) focus:left-(--space-100) focus:z-50 focus:rounded-(--radius) focus:bg-(--surface-overlay) focus:px-(--space-150) focus:py-(--space-100) focus:shadow-sobreposicao"
      >
        Pular para o conteúdo
      </a>
      <BarraSuperior
        esquerda={
          <>
            <Link
              to="/admin"
              aria-label="Grama, central administrativa"
              className="inline-flex rounded-(--radius) no-underline hover:no-underline"
            >
              <MarcaGrama />
            </Link>
            <span className="hidden corpo-medio text-(--text-subtle) sm:inline">
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
        <div className="mx-auto w-full max-w-[1440px] p-(--space-200) md:p-(--space-300)">
          {conteudo}
        </div>
      </main>
    </div>
  )
}
