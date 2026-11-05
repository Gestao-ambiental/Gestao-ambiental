import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

import { PASSOS, type ChavePasso } from './passos'

function horaDe(instante: Date): string {
  return instante.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  passo: ChavePasso
  instrumentoId?: string
  /** Ex.: "LAO 4821/2023", depois de identificada. */
  identificacao?: string | null
  /** "Empreendimento · Unidade". */
  contexto?: string
  /** Para onde "Sair e continuar depois" volta (a tela do empreendimento). */
  sairPara: string
  salvoEm?: Date | null
  rodape?: ReactNode
  /** Conteúdo ocupa a área toda (painéis lado a lado) em vez da coluna central. */
  larga?: boolean
  children: ReactNode
}

/**
 * Moldura do cadastro de licença (Protótipos 10 a 14): barra com o título e "Sair e continuar
 * depois", os cinco passos e o rodapé fixo com as ações. Só a área do conteúdo rola.
 */
export function MolduraCadastro({
  passo,
  instrumentoId,
  identificacao,
  contexto,
  sairPara,
  salvoEm,
  rodape,
  larga = false,
  children,
}: Props) {
  const indiceAtual = PASSOS.findIndex((p) => p.chave === passo)
  const titulo = identificacao ? `Cadastrar licença · ${identificacao}` : 'Cadastrar licença'

  useEffect(() => {
    document.title = `${titulo} · Grama`
  }, [titulo])

  return (
    <div className="flex h-dvh flex-col bg-(--surface-sunken)">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--space-100) focus:left-(--space-100) focus:z-50 focus:rounded-(--radius) focus:bg-(--surface-overlay) focus:px-(--space-150) focus:py-(--space-100)"
      >
        Pular para o conteúdo
      </a>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-(--space-150) border-b bg-(--surface) px-(--space-200) py-(--space-100) md:px-(--space-300)">
        <span className="titulo-secao text-(--text-brand)">Grama</span>
        <span aria-hidden="true" className="h-6 border-l" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate corpo-medio text-(--text)">{titulo}</h1>
          {contexto ? (
            <span className="truncate text-xs text-(--text-subtle)">{contexto}</span>
          ) : null}
        </div>
        {salvoEm ? (
          <span
            role="status"
            className="hidden items-center gap-(--space-050) text-xs text-(--text-subtle) sm:flex"
          >
            <Icone nome="check" tamanho={12} />
            Rascunho salvo às {horaDe(salvoEm)}
          </span>
        ) : null}
        <Botao asChild>
          <Link to={sairPara}>Sair e continuar depois</Link>
        </Botao>
      </header>

      <nav
        aria-label="Passos do cadastro"
        className="shrink-0 overflow-x-auto border-b bg-(--surface)"
      >
        <ol className="flex min-w-max items-center gap-(--space-100) px-(--space-200) py-(--space-150) md:px-(--space-300)">
          {PASSOS.map((item, indice) => {
            const feito = indice < indiceAtual
            const atual = indice === indiceAtual
            const ultimo = indice === PASSOS.length - 1
            const conteudo = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-6 shrink-0 items-center justify-center rounded-(--radius) border rotulo',
                    atual && 'border-(--brand) bg-(--brand) text-(--text-inverse)',
                    feito &&
                      'border-(--surface-selected) bg-(--surface-selected) text-(--text-link)',
                    !atual && !feito && 'border-(--border-strong) text-(--text-subtle)',
                  )}
                >
                  {feito ? <Icone nome="check" tamanho={12} /> : indice + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap',
                    atual ? 'corpo-medio text-(--text)' : 'corpo',
                    feito && 'text-(--text)',
                    !atual && !feito && 'text-(--text-subtle)',
                  )}
                >
                  {item.rotulo}
                  {feito ? <span className="sr-only"> (concluído)</span> : null}
                </span>
              </>
            )
            return (
              <li
                key={item.chave}
                className={cn(
                  'flex items-center gap-(--space-100)',
                  ultimo ? 'flex-none' : 'flex-1',
                )}
              >
                {feito && instrumentoId ? (
                  <Link
                    to={`/licencas/${instrumentoId}/${item.chave}`}
                    className="flex items-center gap-(--space-100) no-underline hover:no-underline"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-(--space-100)"
                    aria-current={atual ? 'step' : undefined}
                  >
                    {conteudo}
                  </span>
                )}
                {ultimo ? null : (
                  <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-(--border)" />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <main id="conteudo" tabIndex={-1} className="min-h-0 flex-1 overflow-auto outline-none">
        {larga ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-[880px] p-(--space-200) md:p-(--space-300)">
            {children}
          </div>
        )}
      </main>

      {rodape ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-(--space-150) border-t bg-(--surface) px-(--space-200) py-(--space-150) md:px-(--space-300)">
          {rodape}
        </footer>
      ) : null}
    </div>
  )
}

/** Rodapé padrão: salvar rascunho + aviso à esquerda; voltar e continuar à direita. */
export function RodapeCadastro({
  aoSalvar,
  salvando,
  aviso,
  voltarPara,
  aoContinuar,
  rotuloContinuar = 'Continuar',
  podeContinuar,
  continuando,
}: {
  aoSalvar?: () => void
  salvando?: boolean
  aviso?: ReactNode
  voltarPara?: string
  aoContinuar: () => void
  rotuloContinuar?: string
  podeContinuar: boolean
  continuando?: boolean
}) {
  return (
    <>
      {aoSalvar ? (
        <Botao disabled={salvando} onClick={aoSalvar}>
          {salvando ? 'Salvando…' : 'Salvar rascunho'}
        </Botao>
      ) : null}
      <span className="min-w-0 flex-1 text-xs text-(--text-subtle)" aria-live="polite">
        {aviso}
      </span>
      {voltarPara ? (
        <Botao aparencia="sutil" asChild>
          <Link to={voltarPara}>Voltar</Link>
        </Botao>
      ) : null}
      <Botao
        aparencia="primario"
        disabled={!podeContinuar || continuando}
        aria-busy={continuando ? true : undefined}
        onClick={aoContinuar}
      >
        {continuando ? 'Salvando…' : rotuloContinuar}
      </Botao>
    </>
  )
}
