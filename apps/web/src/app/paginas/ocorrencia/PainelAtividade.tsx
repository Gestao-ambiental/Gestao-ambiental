import {
  dataEHoraNoFuso,
  formatarDataCivil,
  partesDoComentario,
  rotuloDoDia,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { Carregando, EstadoErro } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CarrosselImagens, type ImagemDoCarrossel } from '@/components/ui/carrossel-imagens'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import {
  comentar,
  urlDoArquivo,
  type EventoDaAtividade,
  type Evidencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import type { MembroAtivo } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { tamanhoLegivel } from './apoio'
import { ehImagem } from './dados'
import { montarFeed, plural, type ItemDoFeed } from './feed'

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

interface Props {
  ocorrencia: Ocorrencia
  eventos: readonly EventoDaAtividade[] | undefined
  carregando: boolean
  comErro: boolean
  aoTentarDeNovo: () => void
  evidencias: readonly Evidencia[]
  membros: readonly MembroAtivo[]
  urls: ReadonlyMap<string, string>
  fuso: string
  aoComentar: () => Promise<void>
  /** Cabeçalho próprio (tela de Atividade no celular); padrão: "Atividade" + buscar. */
  cabecalho?: ReactNode
  className?: string
}

/**
 * Atividade (Tela 16 v2, seção 9): histórico e comentários em ordem cronológica, com separador de
 * dia, e o campo de comentário fixo embaixo. O feed rola sozinho.
 */
export function PainelAtividade({
  ocorrencia,
  eventos,
  carregando,
  comErro,
  aoTentarDeNovo,
  evidencias,
  membros,
  urls,
  fuso,
  aoComentar,
  cabecalho,
  className,
}: Props) {
  const feed = useRef<HTMLDivElement>(null)
  const [carrossel, setCarrossel] = useState<{
    imagens: ImagemDoCarrossel[]
    indice: number | null
  }>({ imagens: [], indice: null })
  const fotos = new Map(membros.map((m) => [m.id, m.fotoUrl]))
  const itens = eventos ? montarFeed(ocorrencia, eventos, evidencias, fuso) : []

  // Mais novo embaixo: ao carregar e a cada item novo, o feed desce até o fim.
  const total = itens.length
  useEffect(() => {
    const elemento = feed.current
    if (elemento && total > 0) elemento.scrollTop = elemento.scrollHeight
  }, [total])

  return (
    <section
      aria-labelledby="titulo-atividade"
      className={cn('flex min-h-0 flex-col bg-(--surface)', className)}
    >
      {cabecalho ?? (
        <header className="flex h-12 shrink-0 items-center gap-(--space-100) border-b px-(--space-200)">
          <h2 id="titulo-atividade" className="flex-1 corpo font-medium">
            Atividade
          </h2>
          <BotaoIcone icone="search" rotulo="Buscar na atividade" aparencia="sutil" />
        </header>
      )}

      <div
        ref={feed}
        className="flex min-h-0 flex-1 flex-col gap-(--space-150) overflow-y-auto px-(--space-200) py-(--space-200)"
      >
        {comErro ? (
          <EstadoErro
            titulo="Não foi possível carregar a atividade."
            aoTentarDeNovo={aoTentarDeNovo}
          />
        ) : carregando ? (
          <Carregando rotulo="Carregando a atividade" linhas={4} />
        ) : (
          <ol aria-label="Atividade da ocorrência" className="flex flex-col gap-(--space-150)">
            {itens.map((item, i) => {
              const { data, hora } = dataEHoraNoFuso(new Date(item.instante), fuso)
              const anterior = itens[i - 1]
              const separador =
                anterior !== undefined &&
                dataEHoraNoFuso(new Date(anterior.instante), fuso).data !== data
              const quando = {
                hora: hora.slice(0, 5),
                completo: `${formatarDataCivil(data)} ${hora.slice(0, 5)}`,
              }
              return (
                <li key={item.chave} className="flex flex-col gap-(--space-150)">
                  {separador ? (
                    <div className="flex justify-center py-(--space-050)">
                      <span className="rounded-(--radius-pill) border px-(--space-100) py-(--space-025) text-xs text-(--text-subtle)">
                        {rotuloDoDia(data)}
                      </span>
                    </div>
                  ) : null}
                  <ItemDaAtividade
                    item={item}
                    fotoUrl={item.atorId ? (fotos.get(item.atorId) ?? null) : null}
                    quando={quando}
                    membros={membros}
                    urls={urls}
                    aoAbrirImagens={(imagens, indice) => {
                      setCarrossel({ imagens, indice })
                    }}
                  />
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <CampoComentario ocorrenciaId={ocorrencia.id} membros={membros} aoComentar={aoComentar} />

      <CarrosselImagens
        imagens={carrossel.imagens}
        indice={carrossel.indice}
        aoMudarIndice={(indice) => {
          setCarrossel((atual) => ({ ...atual, indice }))
        }}
      />
    </section>
  )
}

function AvatarDoAtor({
  item,
  fotoUrl,
  grande,
}: {
  item: ItemDoFeed
  fotoUrl: string | null
  grande: boolean
}) {
  if (item.atorId === null) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-(--icon-subtle)"
      >
        <Icone nome="settings" tamanho={12} />
      </span>
    )
  }
  return <Avatar nome={item.atorNome} fotoUrl={fotoUrl} tamanho={grande ? 'grande' : 'medio'} />
}

function Hora({ quando }: { quando: { hora: string; completo: string } }) {
  return (
    <time title={quando.completo} className="shrink-0 text-xs text-(--text-subtle) tabular-nums">
      {quando.hora}
    </time>
  )
}

function ItemDaAtividade({
  item,
  fotoUrl,
  quando,
  membros,
  urls,
  aoAbrirImagens,
}: {
  item: ItemDoFeed
  fotoUrl: string | null
  quando: { hora: string; completo: string }
  membros: readonly MembroAtivo[]
  urls: ReadonlyMap<string, string>
  aoAbrirImagens: (imagens: ImagemDoCarrossel[], indice: number) => void
}) {
  if (item.tipo === 'evento') {
    return (
      <div className="flex items-start gap-(--space-100) text-xs text-(--text-subtle)">
        <AvatarDoAtor item={item} fotoUrl={fotoUrl} grande={false} />
        <p className="min-w-0 flex-1 self-center">
          <span className="font-medium text-(--text)">{item.atorNome}</span> {item.acao}
        </p>
        <span className="self-center">
          <Hora quando={quando} />
        </span>
      </div>
    )
  }

  if (item.tipo === 'comentario') {
    const nomes = membros.filter((m) => item.mencoes.includes(m.id)).map((m) => m.nome)
    return (
      <article className="flex items-start gap-(--space-100)">
        <AvatarDoAtor item={item} fotoUrl={fotoUrl} grande />
        <div className="flex min-w-0 flex-1 flex-col gap-(--space-025)">
          <div className="flex flex-wrap items-center gap-(--space-100)">
            <span className="corpo font-medium">{item.atorNome}</span>
            <Hora quando={quando} />
            {item.selo ? <Selo tom="atencao">{item.selo}</Selo> : null}
          </div>
          <p className="corpo break-words whitespace-pre-line">
            {partesDoComentario(item.texto, nomes).map((parte, i) =>
              parte.tipo === 'mencao' ? (
                <span key={i} className="font-medium">
                  @{parte.nome}
                </span>
              ) : (
                <span key={i}>{parte.texto}</span>
              ),
            )}
          </p>
        </div>
      </article>
    )
  }

  const arquivos = item.evidencia.arquivos
  const imagens: ImagemDoCarrossel[] = arquivos.flatMap((a) => {
    const url = ehImagem(a.mime) ? urls.get(a.caminho) : undefined
    return url ? [{ id: a.versaoId, nome: a.nome, url }] : []
  })
  const documentos = arquivos.filter((a) => !ehImagem(a.mime) || !urls.has(a.caminho))
  return (
    <article className="flex items-start gap-(--space-100)">
      <AvatarDoAtor item={item} fotoUrl={fotoUrl} grande />
      <div className="flex min-w-0 flex-1 flex-col gap-(--space-100)">
        <div className="flex items-start gap-(--space-100)">
          <p className="min-w-0 flex-1 corpo text-(--text-subtle)">
            <span className="font-medium text-(--text)">{item.atorNome}</span> enviou{' '}
            {plural(arquivos.length, 'arquivo', 'arquivos')} para conferência
          </p>
          <Hora quando={quando} />
        </div>
        {imagens.length > 0 ? (
          <ul aria-label="Imagens enviadas" className="flex flex-wrap gap-(--space-100)">
            {imagens.map((imagem, indice) => (
              <li key={imagem.id}>
                <button
                  type="button"
                  aria-label={`Ver ${imagem.nome}`}
                  onClick={() => {
                    aoAbrirImagens(imagens, indice)
                  }}
                  className="block size-[76px] cursor-pointer overflow-hidden rounded-(--radius) border outline-none focus-visible:shadow-(--focus-ring)"
                >
                  <img src={imagem.url} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {documentos.length > 0 ? (
          <ul aria-label="Documentos enviados" className="flex flex-col gap-(--space-050)">
            {documentos.map((a) => (
              <li key={a.versaoId}>
                <LinhaDocumento nome={a.nome} tamanho={a.tamanho} caminho={a.caminho} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}

function LinhaDocumento({
  nome,
  tamanho,
  caminho,
}: {
  nome: string
  tamanho: number
  caminho: string
}) {
  const abrir = useMutation({
    mutationFn: () => urlDoArquivo(caminho),
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  return (
    <>
      <button
        type="button"
        title={nome}
        onClick={() => {
          abrir.mutate()
        }}
        className="flex h-9 w-full cursor-pointer items-center gap-(--space-100) rounded-(--radius) border px-(--space-100) text-left transicao-estado outline-none hover:bg-(--surface-hover) focus-visible:shadow-(--focus-ring)"
      >
        <Icone nome="file-text" className="text-(--icon)" />
        <span className="min-w-0 flex-1 truncate corpo">{nome}</span>
        <span className="shrink-0 text-xs text-(--text-subtle) tabular-nums">
          {tamanhoLegivel(tamanho)}
        </span>
      </button>
      {abrir.isError ? (
        <p role="alert" className="text-xs text-(--text-danger)">
          {mensagemDoErro(abrir.error)}
        </p>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Campo de comentário com @menção
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** "@pala" imediatamente antes do cursor: o termo buscado e onde começa. */
function mencaoEmDigitacao(
  texto: string,
  cursor: number,
): { termo: string; inicio: number } | null {
  const antes = texto.slice(0, cursor)
  const achado = /(^|\s)@([^\s@]*)$/u.exec(antes)
  if (!achado) return null
  const termo = achado[2] ?? ''
  return { termo, inicio: cursor - termo.length - 1 }
}

function CampoComentario({
  ocorrenciaId,
  membros,
  aoComentar,
}: {
  ocorrenciaId: string
  membros: readonly MembroAtivo[]
  aoComentar: () => Promise<void>
}) {
  const id = useId()
  const campo = useRef<HTMLTextAreaElement>(null)
  const [texto, setTexto] = useState('')
  const [chave, setChave] = useState(() => crypto.randomUUID())
  const [mencionados, setMencionados] = useState<readonly MembroAtivo[]>([])
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null)
  const [ativa, setAtiva] = useState(0)

  const sugestoes = busca
    ? membros.filter((m) => normalizar(m.nome).includes(normalizar(busca.termo))).slice(0, 6)
    : []
  const aberta = sugestoes.length > 0

  const enviar = useMutation({
    mutationFn: () => {
      const corpo = texto.trim()
      const mencoes = mencionados.filter((m) => corpo.includes(`@${m.nome}`)).map((m) => m.id)
      return comentar(chave, ocorrenciaId, corpo, [...new Set(mencoes)])
    },
    onSuccess: async () => {
      setTexto('')
      setMencionados([])
      setChave(crypto.randomUUID())
      await aoComentar()
    },
  })

  function atualizarBusca(valor: string, cursor: number) {
    setBusca(mencaoEmDigitacao(valor, cursor))
    setAtiva(0)
  }

  function escolher(membro: MembroAtivo) {
    if (!busca) return
    const fim = busca.inicio + 1 + busca.termo.length
    const novo = `${texto.slice(0, busca.inicio)}@${membro.nome} ${texto.slice(fim)}`
    const cursor = busca.inicio + membro.nome.length + 2
    setTexto(novo)
    setMencionados((atuais) => [...atuais, membro])
    setBusca(null)
    requestAnimationFrame(() => {
      campo.current?.focus()
      campo.current?.setSelectionRange(cursor, cursor)
    })
  }

  function publicar() {
    if (enviar.isPending) return
    if (!texto.trim()) {
      campo.current?.focus()
      return
    }
    enviar.mutate()
  }

  function teclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (aberta) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault()
        setAtiva((i) => (i + 1) % sugestoes.length)
        return
      }
      if (evento.key === 'ArrowUp') {
        evento.preventDefault()
        setAtiva((i) => (i - 1 + sugestoes.length) % sugestoes.length)
        return
      }
      if (evento.key === 'Enter' || evento.key === 'Tab') {
        const membro = sugestoes[ativa]
        if (membro) {
          evento.preventDefault()
          escolher(membro)
          return
        }
      }
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setBusca(null)
        return
      }
    }
    if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
      evento.preventDefault()
      publicar()
    }
  }

  const listaId = `${id}-mencoes`
  return (
    <div className="shrink-0 p-(--space-150) max-md:pb-[calc(var(--space-150)+env(safe-area-inset-bottom))]">
      <div className="relative rounded-(--radius) border bg-(--surface) focus-within:border-(--border-focus)">
        {aberta ? (
          <div
            id={listaId}
            role="listbox"
            aria-label="Pessoas para mencionar"
            className="absolute inset-x-(--space-100) bottom-full z-10 mb-(--space-050) flex max-h-60 flex-col overflow-y-auto rounded-(--radius) border bg-(--surface-overlay) py-(--space-050) shadow-(--shadow-overlay)"
          >
            {sugestoes.map((membro, indice) => (
              <div
                key={membro.id}
                id={`${listaId}-${membro.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={indice === ativa}
                onMouseDown={(evento) => {
                  evento.preventDefault()
                  escolher(membro)
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-(--space-100) px-(--space-150) py-(--space-075) corpo',
                  indice === ativa ? 'bg-(--surface-selected)' : 'hover:bg-(--surface-hover)',
                )}
              >
                <Avatar nome={membro.nome} fotoUrl={membro.fotoUrl} tamanho="pequeno" />
                <span className="truncate">{membro.nome}</span>
              </div>
            ))}
          </div>
        ) : null}
        <label htmlFor={`${id}-texto`} className="sr-only">
          Comentário
        </label>
        <textarea
          ref={campo}
          id={`${id}-texto`}
          rows={2}
          value={texto}
          maxLength={5000}
          placeholder="Escreva um comentário. Use @ para mencionar."
          aria-autocomplete="list"
          aria-controls={aberta ? listaId : undefined}
          aria-activedescendant={
            aberta && sugestoes[ativa] ? `${listaId}-${sugestoes[ativa].id}` : undefined
          }
          onChange={(evento) => {
            setTexto(evento.target.value)
            atualizarBusca(evento.target.value, evento.target.selectionStart)
          }}
          onKeyDown={teclar}
          onBlur={() => {
            setBusca(null)
          }}
          className="block w-full resize-none border-0 bg-transparent px-(--space-150) pt-(--space-100) corpo text-(--text) outline-none placeholder:text-(--text-subtlest)"
        />
        <div className="flex items-center justify-between border-t px-(--space-100) py-(--space-075)">
          <BotaoIcone icone="paperclip" rotulo="Anexar ao comentário" aparencia="sutil" disabled />
          <Botao
            aparencia="primario"
            tamanho="compacto"
            iconeAntes="send"
            aria-busy={enviar.isPending || undefined}
            onClick={publicar}
          >
            Comentar
          </Botao>
        </div>
      </div>
      {enviar.isError ? (
        <p role="alert" className="mt-(--space-050) text-xs text-(--text-danger)">
          {mensagemDoErro(enviar.error)}
        </p>
      ) : null}
    </div>
  )
}
