import { useContext, useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { ContextoConsultoria } from '@/app/consultoria/contexto-consultoria'
import { usePrenderTarefa } from '@/app/consultoria/tempo-ativo'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MarcaGrama } from '@/components/ui/marca-grama'
import { Trilha } from '@/components/ui/trilha'
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
  const navegar = useNavigate()
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
          <h1 className="truncate titulo-painel text-(--tinta) max-md:titulo-secao">{titulo}</h1>
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
          <Link to={sairPara}>
            <span>
              Sair<span className="max-md:sr-only"> e continuar depois</span>
            </span>
          </Link>
        </Botao>
      </header>

      <div className="shrink-0 border-b bg-(--folha)">
        <Trilha
          rotulo="Passos do cadastro"
          atual={indiceAtual}
          passos={PASSOS.map((item) => ({ id: item.chave, titulo: item.rotulo }))}
          aoEscolher={
            instrumentoId
              ? (indice) => {
                  const destino = PASSOS[indice]
                  if (destino) void navegar(`/licencas/${instrumentoId}/${destino.chave}`)
                }
              : undefined
          }
          // Só volta a passos já feitos; o avanço é pelo "Continuar", que valida e salva.
          podeEscolher={(indice) => indice < indiceAtual}
          compactaNoCelular
          className="relative px-(--e-3) py-(--e-2) md:px-(--e-5)"
        />
      </div>

      <main id="conteudo" tabIndex={-1} className="min-h-0 flex-1 overflow-auto outline-none">
        {larga ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-[880px] p-(--e-4) md:p-(--e-6)">{children}</div>
        )}
      </main>

      {rodape ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-x-(--e-3) gap-y-(--e-2) border-t bg-(--folha) px-(--e-4) py-(--e-3) md:px-(--e-6)">
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
      <span
        className="min-w-0 flex-1 corpo text-(--tinta-2) max-md:order-first max-md:basis-full"
        aria-live="polite"
      >
        {aviso}
      </span>
      {voltarPara ? (
        <Botao aparencia="sutil" asChild>
          <Link to={voltarPara}>Voltar</Link>
        </Botao>
      ) : null}
      <Botao
        aparencia="primario"
        iconeDepois={continuando || rotuloContinuar !== 'Continuar' ? undefined : 'arrow-right'}
        disabled={!podeContinuar || continuando}
        aria-busy={continuando ? true : undefined}
        onClick={aoContinuar}
        className="max-md:flex-1"
      >
        {continuando ? 'Salvando…' : rotuloContinuar}
      </Botao>
    </>
  )
}
