import { useContext, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'

import { ContextoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { usePrenderTarefa } from '@/app/consultoria/tempo-ativo'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MarcaGrama } from '@/components/ui/marca-grama'
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
  // Em modo suporte a faixa do suporte fica acima: a moldura ocupa o resto da altura (ADR-0025).
  const suporte = useContext(ContextoConsultoria)?.suporte ?? null
  // Cadastro com IA (ADR-0027): o tempo ativo conta em todos os passos desta licença.
  usePrenderTarefa(instrumentoId ? `ia:${instrumentoId}` : null)
  const indiceAtual = PASSOS.findIndex((p) => p.chave === passo)
  const titulo = identificacao ? `Cadastrar licença · ${identificacao}` : 'Cadastrar licença'

  useEffect(() => {
    document.title = `${titulo} · Grama`
  }, [titulo])

  return (
    <div className={cn('flex flex-col bg-(--chao)', suporte ? 'min-h-0 flex-1' : 'h-dvh')}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-(--e-2) focus:left-(--e-2) focus:z-50 focus:rounded-(--raio) focus:bg-(--flutuante) focus:px-(--e-3) focus:py-(--e-2)"
      >
        Pular para o conteúdo
      </a>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-(--e-3) border-b bg-(--folha) px-(--e-4) py-(--e-2) md:px-(--e-6)">
        <MarcaGrama compactaNoCelular />
        <span aria-hidden="true" className="h-6 border-l" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate corpo-medio text-(--tinta)">{titulo}</h1>
          {contexto ? <span className="truncate text-xs text-(--tinta-2)">{contexto}</span> : null}
        </div>
        {salvoEm ? (
          <span
            role="status"
            className="hidden items-center gap-(--e-1) text-xs text-(--tinta-2) sm:flex"
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
        className="shrink-0 overflow-x-auto border-b bg-(--folha)"
      >
        <ol className="flex min-w-max items-center gap-(--e-2) px-(--e-4) py-(--e-3) md:px-(--e-6)">
          {PASSOS.map((item, indice) => {
            const feito = indice < indiceAtual
            const atual = indice === indiceAtual
            const ultimo = indice === PASSOS.length - 1
            const conteudo = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-6 shrink-0 items-center justify-center rounded-(--raio) border rotulo',
                    atual && 'border-(--acao) bg-(--acao) text-(--acao-texto)',
                    feito && 'border-(--escolha) bg-(--escolha) text-(--link)',
                    !atual && !feito && 'border-(--regra-forte) text-(--tinta-2)',
                  )}
                >
                  {feito ? <Icone nome="check" tamanho={12} /> : indice + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap',
                    atual ? 'corpo-medio text-(--tinta)' : 'corpo',
                    feito && 'text-(--tinta)',
                    !atual && !feito && 'text-(--tinta-2)',
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
                className={cn('flex items-center gap-(--e-2)', ultimo ? 'flex-none' : 'flex-1')}
              >
                {feito && instrumentoId ? (
                  <Link
                    to={`/licencas/${instrumentoId}/${item.chave}`}
                    className="flex items-center gap-(--e-2) no-underline hover:no-underline"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-(--e-2)"
                    aria-current={atual ? 'step' : undefined}
                  >
                    {conteudo}
                  </span>
                )}
                {ultimo ? null : (
                  <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-(--regra)" />
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
          <div className="mx-auto w-full max-w-[880px] p-(--e-4) md:p-(--e-6)">{children}</div>
        )}
      </main>

      {rodape ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-(--e-3) border-t bg-(--folha) px-(--e-4) py-(--e-3) md:px-(--e-6)">
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
      <span className="min-w-0 flex-1 text-xs text-(--tinta-2)" aria-live="polite">
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
