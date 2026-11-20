// Busca global do Grama Fluent (Ctrl+K / Cmd+K): campo no centro da barra do app (no celular, só
// o botão de lupa) que abre um diálogo de comando. Combobox com listbox agrupada e
// aria-activedescendant: o foco fica no campo; setas movem, Enter abre, Esc fecha e devolve o foco.
// O que volta é decidido pela RLS; esconder orçamento e itens da Gestão aqui é só apresentação.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as EventoTeclado,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'

import { Icone, type NomeIcone } from '@/components/ui/icone'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Esqueleto } from '@/components/ui/esqueleto'
import {
  buscarNoGrama,
  TAMANHO_MINIMO_DA_BUSCA,
  type ResultadoBusca,
  type TipoResultadoBusca,
} from '@/lib/api/busca'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { useConsultoria } from '../consultoria/contexto-consultoria'
import { ITENS_NAVEGACAO } from '../navegacao'

const ESPERA_AO_DIGITAR_MS = 200
const PLACEHOLDER = 'Buscar licença, condicionante, orçamento'

const GRUPOS: readonly { tipo: TipoResultadoBusca; rotulo: string; icone: NomeIcone }[] = [
  { tipo: 'empreendimento', rotulo: 'Empreendimentos', icone: 'briefcase' },
  { tipo: 'licenca', rotulo: 'Licenças', icone: 'file-check' },
  { tipo: 'condicionante', rotulo: 'Condicionantes', icone: 'list' },
  { tipo: 'orcamento', rotulo: 'Orçamentos', icone: 'file-text' },
]

/** Licença e condicionante não têm página própria: abrem o empreendimento. */
function destinoDoResultado(resultado: ResultadoBusca): string {
  return resultado.tipo === 'orcamento'
    ? `/orcamentos/${resultado.referenciaId}`
    : `/empreendimentos/${resultado.referenciaId}`
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

interface Opcao {
  chave: string
  grupo: string
  titulo: string
  detalhe: string | null
  icone: NomeIcone
  destino: string
}

interface Grupo {
  rotulo: string
  opcoes: Opcao[]
}

export function BuscaGlobal() {
  const [aberto, setAberto] = useState(false)
  const devolverFocoA = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (
        (evento.ctrlKey || evento.metaKey) &&
        !evento.altKey &&
        !evento.shiftKey &&
        evento.key.toLowerCase() === 'k'
      ) {
        evento.preventDefault()
        // Aberto pelo atalho: o foco volta para onde estava (com o diálogo já aberto, não muda).
        if (document.activeElement instanceof HTMLElement) {
          devolverFocoA.current ??= document.activeElement
        }
        setAberto(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [])

  const abrir = (gatilho: HTMLElement) => {
    devolverFocoA.current = gatilho
    setAberto(true)
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={(evento) => {
          abrir(evento.currentTarget)
        }}
        className="hidden h-(--size-control) w-full max-w-[520px] min-w-0 cursor-pointer items-center gap-(--space-100) rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) text-left text-(--text-subtle) transicao-estado hover:bg-(--neutral-subtle-hover) md:flex"
      >
        <Icone nome="search" />
        <span className="min-w-0 flex-1 truncate corpo">{PLACEHOLDER}</span>
        <kbd className="shrink-0 rounded-(--radius) border px-(--space-050) text-xs text-(--text-subtle)">
          Ctrl K
        </kbd>
      </button>
      <BotaoIcone
        icone="search"
        rotulo="Buscar"
        aria-haspopup="dialog"
        className="md:hidden"
        onClick={(evento) => {
          abrir(evento.currentTarget)
        }}
      />
      <Dialog.Root open={aberto} onOpenChange={setAberto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-(--scrim) data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-(--space-200) py-(--space-800) max-md:px-(--space-100) max-md:py-(--space-200)">
            <Dialog.Content
              aria-describedby={undefined}
              onCloseAutoFocus={(evento) => {
                // Sem Dialog.Trigger o Radix não sabe quem abriu: devolvemos o foco à mão.
                evento.preventDefault()
                const alvo = devolverFocoA.current
                devolverFocoA.current = null
                if (alvo?.isConnected) alvo.focus()
              }}
              className="pointer-events-auto flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-(--radius-large) bg-(--surface-overlay) text-(--text) shadow-dialogo outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
            >
              <Dialog.Title className="sr-only">Buscar no Grama</Dialog.Title>
              <PaletaDeBusca
                aoEscolher={() => {
                  setAberto(false)
                }}
              />
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function PaletaDeBusca({ aoEscolher }: { aoEscolher: () => void }) {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const base = useId()
  const listaId = `${base}-lista`
  const [termo, setTermo] = useState('')
  const [termoBuscado, setTermoBuscado] = useState('')
  const [ativoChave, setAtivoChave] = useState<string | null>(null)
  const ehGestao = atual.papel === 'gestao'

  useEffect(() => {
    const espera = window.setTimeout(() => {
      setTermoBuscado(termo.trim())
    }, ESPERA_AO_DIGITAR_MS)
    return () => {
      window.clearTimeout(espera)
    }
  }, [termo])

  const buscar = termoBuscado.length >= TAMANHO_MINIMO_DA_BUSCA
  const consulta = useQuery({
    queryKey: ['busca-global', atual.consultoriaId, termoBuscado],
    queryFn: () => buscarNoGrama(atual.consultoriaId, termoBuscado),
    enabled: buscar,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const resultados = buscar
    ? (consulta.data ?? []).filter((r) => ehGestao || r.tipo !== 'orcamento')
    : []
  const grupos: Grupo[] = GRUPOS.flatMap(({ tipo, rotulo, icone }) => {
    const opcoes = resultados
      .filter((r) => r.tipo === tipo)
      .map((r) => ({
        chave: `${r.tipo}:${r.id}`,
        grupo: rotulo,
        titulo: r.titulo,
        detalhe: r.detalhe,
        icone,
        destino: destinoDoResultado(r),
      }))
    return opcoes.length ? [{ rotulo, opcoes }] : []
  })
  const filtro = semAcento(termo)
  const destinos = ITENS_NAVEGACAO.filter(
    (item) => (ehGestao || !item.somenteGestao) && semAcento(item.rotulo).includes(filtro),
  ).map((item) => ({
    chave: `ir:${item.para}`,
    grupo: 'Ir para',
    titulo: item.rotulo,
    detalhe: null,
    icone: item.icone,
    destino: item.para,
  }))
  if (destinos.length) grupos.push({ rotulo: 'Ir para', opcoes: destinos })

  const opcoes = grupos.flatMap((g) => g.opcoes)
  const indiceAtivo = Math.max(
    0,
    opcoes.findIndex((o) => o.chave === ativoChave),
  )
  const ativa = opcoes[indiceAtivo]
  const idDaOpcao = (opcao: Opcao) => `${base}-opcao-${String(opcoes.indexOf(opcao))}`
  const idAtivo = ativa ? idDaOpcao(ativa) : undefined

  // A opção ativa sempre visível na região que rola (o foco continua no campo).
  useEffect(() => {
    if (!idAtivo) return
    const elemento = document.getElementById(idAtivo) as Partial<
      Pick<HTMLElement, 'scrollIntoView'>
    > | null
    elemento?.scrollIntoView?.({ block: 'nearest' })
  }, [idAtivo])

  const escolher = (opcao: Opcao) => {
    aoEscolher()
    void navegar(opcao.destino)
  }

  const aoTeclar = (evento: EventoTeclado<HTMLInputElement>) => {
    if (!opcoes.length) return
    const mover = (indice: number) => {
      evento.preventDefault()
      const total = opcoes.length
      setAtivoChave(opcoes[(indice + total) % total]?.chave ?? null)
    }
    if (evento.key === 'ArrowDown') mover(indiceAtivo + 1)
    else if (evento.key === 'ArrowUp') mover(indiceAtivo - 1)
    else if (evento.key === 'Home' && evento.ctrlKey) mover(0)
    else if (evento.key === 'End' && evento.ctrlKey) mover(opcoes.length - 1)
    else if (evento.key === 'Enter' && ativa && !evento.nativeEvent.isComposing) {
      evento.preventDefault()
      escolher(ativa)
    }
  }

  const carregando = buscar && consulta.isPending
  const semResultado =
    buscar && consulta.isSuccess && !consulta.isPlaceholderData && resultados.length === 0

  let situacao: ReactNode = null
  if (consulta.isError && buscar) {
    situacao = (
      <p
        role="alert"
        className="flex items-center gap-(--space-100) px-(--space-200) py-(--space-150) corpo text-(--text-danger)"
      >
        <Icone nome="circle-alert" />
        {mensagemDoErro(consulta.error, 'Não foi possível buscar. Tente de novo.')}
      </p>
    )
  } else if (carregando) {
    situacao = (
      <div
        role="status"
        className="flex flex-col gap-(--space-100) px-(--space-200) py-(--space-150)"
      >
        <span className="sr-only">Buscando</span>
        <Esqueleto largura="60%" />
        <Esqueleto largura="40%" />
      </div>
    )
  } else if (semResultado) {
    situacao = (
      <p role="status" className="px-(--space-200) py-(--space-150) corpo text-(--text-subtle)">
        Nada encontrado para “{termoBuscado}”
      </p>
    )
  }

  return (
    <>
      <div className="flex items-center gap-(--space-100) border-b px-(--space-200)">
        <Icone nome="search" className="text-(--icon)" />
        {/* Primeiro elemento focável do diálogo: o Radix põe o foco aqui ao abrir. */}
        <input
          type="text"
          role="combobox"
          aria-label="Buscar no Grama"
          aria-expanded={opcoes.length > 0}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={idAtivo}
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          value={termo}
          onChange={(evento) => {
            setTermo(evento.target.value)
            setAtivoChave(null)
          }}
          onKeyDown={aoTeclar}
          className="h-12 min-w-0 flex-1 bg-transparent corpo text-(--text) outline-none placeholder:text-(--text-subtle) focus-visible:outline-none"
        />
        <kbd className="shrink-0 rounded-(--radius) border px-(--space-050) text-xs text-(--text-subtle) max-md:hidden">
          Esc
        </kbd>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-(--space-050)">
        {situacao}
        <div id={listaId} role="listbox" aria-label="Resultados da busca">
          {grupos.map((grupo, indiceGrupo) => {
            const tituloId = `${base}-grupo-${String(indiceGrupo)}`
            return (
              <div key={grupo.rotulo} role="group" aria-labelledby={tituloId}>
                <div
                  id={tituloId}
                  className="px-(--space-200) pt-(--space-150) pb-(--space-050) rotulo"
                >
                  {grupo.rotulo}
                </div>
                {grupo.opcoes.map((opcao) => {
                  const selecionada = opcao.chave === ativa?.chave
                  return (
                    // O teclado fica no campo (aria-activedescendant); a opção só recebe o mouse.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <div
                      key={opcao.chave}
                      id={idDaOpcao(opcao)}
                      role="option"
                      aria-selected={selecionada}
                      tabIndex={-1}
                      onMouseDown={(evento) => {
                        // Clicar não tira o foco do campo.
                        evento.preventDefault()
                      }}
                      onMouseMove={() => {
                        if (!selecionada) setAtivoChave(opcao.chave)
                      }}
                      onClick={() => {
                        escolher(opcao)
                      }}
                      className={cn(
                        'mx-(--space-100) flex cursor-pointer items-center gap-(--space-150) rounded-(--radius) px-(--space-100) py-(--space-100)',
                        selecionada && 'bg-(--surface-selected)',
                      )}
                    >
                      <Icone nome={opcao.icone} className="shrink-0 text-(--icon)" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate corpo">{opcao.titulo}</span>
                        {opcao.detalhe ? (
                          <span className="truncate text-xs text-(--text-subtle)">
                            {opcao.detalhe}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
