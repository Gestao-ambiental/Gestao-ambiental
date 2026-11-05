import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useParams } from 'react-router'

import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import type { PedidoDePagina } from '@/components/pdf/VisualizadorPdf'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { DivisorRedimensionavel } from '@/components/ui/divisor-redimensionavel'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  moverCondicionante,
  revisarCondicionante,
  salvarCondicionante,
  type Condicionante,
  type Instrumento,
  type Natureza,
  type Revisao,
} from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  descendentes,
  destinoAoSoltar,
  destinoDoNovo,
  linhasVisiveis,
  montarArvore,
  proximoCodigo,
  type NoCondicionante,
} from './arvore-condicionantes'
import { GuardaRascunho } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'
import { PainelPdf } from './PainelPdf'
import { useCondicionantes, useSalvamento } from './usar-rascunho'

const NATUREZAS: { chave: Natureza; rotulo: string; curto: string; descricao: string }[] = [
  {
    chave: 'obrigacao',
    rotulo: 'Obrigação',
    curto: 'Obrig.',
    descricao: 'Tem entrega e vira prazo.',
  },
  {
    chave: 'agrupador',
    rotulo: 'Agrupador',
    curto: 'Grupo',
    descricao: 'Título que reúne subitens. Não gera prazo.',
  },
  {
    chave: 'informacao_geral',
    rotulo: 'Informação geral',
    curto: 'Inf.',
    descricao: 'Contexto da licença. Não gera prazo.',
  },
  {
    chave: 'condicao_continua',
    rotulo: 'Condição contínua',
    curto: 'Contín.',
    descricao: 'Mantida o tempo todo. Não vira entrega periódica.',
  },
]

const REVISAO: Record<Revisao, { texto: string; tom: TomSelo }> = {
  pendente: { texto: 'Proposto', tom: 'andamento' },
  aceita: { texto: 'Aceito', tom: 'sucesso' },
  descartada: { texto: 'Descartado', tom: 'padrao' },
}

type Filtro = 'todos' | 'pendente' | 'aceita' | 'descartada'

// Larguras dos painéis (Protótipo 12): a lista vai de 260 a 640 px; o detalhe nunca some.
const LISTA = { padrao: 320, minimo: 260, maximo: 640 }
const PDF = { minimo: 320, maximo: 960 }

/** O documento começa com cerca de um terço da tela (420 px em 1366, ~690 px em 1920). */
function larguraPadraoDoPdf(): number {
  const tela = typeof window === 'undefined' ? 1366 : window.innerWidth
  return Math.round(Math.min(PDF.maximo, Math.max(420, tela * 0.36)))
}

/** Largura ajustada pela pessoa, lembrada neste aparelho. É só preferência de tela. */
function useLarguraLembrada(chave: string, padrao: number, minimo: number, maximo: number) {
  const [largura, setLargura] = useState(() => {
    try {
      const salva = Number(window.localStorage.getItem(chave))
      return salva >= minimo && salva <= maximo ? salva : padrao
    } catch {
      return padrao
    }
  })
  function mudar(nova: number) {
    setLargura(nova)
    try {
      window.localStorage.setItem(chave, String(nova))
    } catch {
      // Sem armazenamento (modo privado): vale só nesta tela.
    }
  }
  return [largura, mudar] as const
}

const classeCampo =
  'w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus) focus:bg-(--surface-input-focus)'

/** Texto fora de edição: caixa cinza de leitura, como no Protótipo 12. */
const classeLeitura =
  'read-only:border-transparent read-only:bg-(--surface-sunken) read-only:focus:border-(--border-focus)'

type Edicao =
  | { tipo: 'existente'; id: string }
  | { tipo: 'nova'; natureza: Natureza; paiId: string | null; codigo: string; titulo: string }

/**
 * Linha do item novo na árvore, como o arquivo novo no explorador do VS Code: primeiro só o
 * título; Enter (ou sair do campo) confirma e abre o resto no centro; Esc cancela.
 */
function LinhaNova({
  natureza,
  codigo,
  nivel,
  nomeando,
  titulo,
  aoConfirmar,
  aoCancelar,
}: {
  natureza: Natureza
  codigo: string
  nivel: number
  nomeando: boolean
  titulo: string
  aoConfirmar: (titulo: string) => void
  aoCancelar: () => void
}) {
  const campoRef = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState(titulo)
  // Enter e Esc já resolvem; o blur que vem logo depois não pode decidir de novo.
  const resolvido = useRef(false)
  const agrupador = natureza === 'agrupador'

  useEffect(() => {
    if (!nomeando) return
    resolvido.current = false
    campoRef.current?.focus()
  }, [nomeando])

  function confirmar() {
    if (resolvido.current) return
    resolvido.current = true
    const limpo = texto.trim()
    if (limpo) aoConfirmar(limpo)
    else aoCancelar()
  }

  function cancelar() {
    if (resolvido.current) return
    resolvido.current = true
    aoCancelar()
  }

  return (
    <li
      className="flex min-h-11 items-center gap-(--space-100) border-b bg-(--surface-selected) py-(--space-075) pr-(--space-150)"
      style={{ paddingLeft: `${String(nivel * 16)}px` }}
    >
      <span aria-hidden="true" className="flex w-6 shrink-0 justify-center text-(--icon)">
        <Icone nome={agrupador ? 'folder' : 'file-text'} />
      </span>
      {codigo ? (
        <span className="shrink-0 font-mono text-xs text-(--text-subtle)">{codigo}</span>
      ) : null}
      {nomeando ? (
        <input
          ref={campoRef}
          aria-label={agrupador ? 'Título do novo agrupador' : 'Título da nova condicionante'}
          placeholder={agrupador ? 'Título do agrupador' : 'Título da condicionante'}
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault()
              confirmar()
            } else if (evento.key === 'Escape') {
              evento.preventDefault()
              cancelar()
            }
          }}
          onBlur={confirmar}
          className="h-7 min-w-0 flex-1 rounded-(--radius) border border-(--border-focus) bg-(--surface-input) px-(--space-075) corpo text-(--text) outline-none"
        />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-(--space-100)">
          <span className="truncate corpo-medio text-(--text-link)">{titulo}</span>
          <Selo>Nova</Selo>
        </span>
      )}
    </li>
  )
}

/** Onde o item está no PDF: o texto literal inteiro, o começo dele ou o título. */
function trechosDoItem(item: Condicionante): string[] {
  return [item.textoLiteral, item.textoLiteral.slice(0, 80), item.titulo]
}

function Editor({
  instrumentoId,
  edicao,
  item,
  pdfFechado,
  aoSalvar,
  aoVerPagina,
  aoAbrirPdf,
}: {
  instrumentoId: string
  edicao: Edicao
  item: Condicionante | undefined
  pdfFechado: boolean
  aoSalvar: (id: string) => Promise<void>
  aoVerPagina: (pagina: number, trechos: readonly string[]) => void
  aoAbrirPdf: () => void
}) {
  const textoId = useId()
  const [id] = useState(() => (edicao.tipo === 'existente' ? edicao.id : crypto.randomUUID()))
  const [codigo, setCodigo] = useState(
    item?.codigo ?? (edicao.tipo === 'nova' ? edicao.codigo : ''),
  )
  const [titulo, setTitulo] = useState(
    item?.titulo ?? (edicao.tipo === 'nova' ? edicao.titulo : ''),
  )
  const [texto, setTexto] = useState(item?.textoLiteral ?? '')
  const [natureza, setNatureza] = useState<Natureza>(
    item?.natureza ?? (edicao.tipo === 'nova' ? edicao.natureza : 'obrigacao'),
  )
  const [erroTitulo, setErroTitulo] = useState<string | null>(null)
  // Item já revisado fica travado até "Editar" (Protótipo 12); proposto e novo, não.
  const [editando, setEditando] = useState(false)
  // Texto literal que já existe só muda depois de "Editar texto".
  const [editandoTexto, setEditandoTexto] = useState(!item?.textoLiteral)

  const travado = item !== undefined && item.revisao !== 'pendente' && !editando
  const mudou =
    item !== undefined &&
    (codigo !== item.codigo ||
      titulo !== item.titulo ||
      texto !== item.textoLiteral ||
      natureza !== item.natureza)
  const textoMudou = item?.origem === 'ia' && texto !== item.textoLiteral

  // O lugar na árvore muda arrastando; aqui vale o pai atual do item (ou o do novo).
  const dados = () => ({
    paiId: item ? item.paiId : edicao.tipo === 'nova' ? edicao.paiId : null,
    codigo,
    titulo,
    textoLiteral: texto,
    natureza,
  })
  const salvar = useMutation({
    mutationFn: () => salvarCondicionante(id, instrumentoId, dados()),
    onSuccess: () => aoSalvar(id),
  })
  const revisar = useMutation({
    mutationFn: async (revisao: 'aceita' | 'descartada') => {
      // "Aceitar edição": grava o que mudou e depois aceita.
      if (revisao === 'aceita' && mudou) await salvarCondicionante(id, instrumentoId, dados())
      await revisarCondicionante(id, revisao)
    },
    onSuccess: () => aoSalvar(id),
  })

  const ocupado = salvar.isPending || revisar.isPending
  const erro = salvar.error ?? revisar.error

  function tituloValido() {
    if (titulo.trim()) return true
    setErroTitulo('Informe o título')
    return false
  }

  function cancelarEdicao(original: Condicionante) {
    setCodigo(original.codigo)
    setTitulo(original.titulo)
    setTexto(original.textoLiteral)
    setNatureza(original.natureza)
    setErroTitulo(null)
    setEditando(false)
    setEditandoTexto(!original.textoLiteral)
  }

  const paginaFonte = item?.origem === 'ia' ? item.fontePagina : null
  const fonte = paginaFonte
    ? `Página ${String(paginaFonte)}${item?.codigo ? `, item ${item.codigo}` : ''}`
    : null

  return (
    <form
      noValidate
      aria-label={item ? `Condicionante ${item.codigo || item.titulo}` : 'Nova condicionante'}
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!tituloValido()) return
        salvar.mutate()
      }}
      className="flex flex-col gap-(--space-200)"
    >
      <div className="flex min-h-8 items-center gap-(--space-100)">
        <span className="font-mono text-base text-(--text-subtle)">{codigo || '—'}</span>
        {item ? (
          <Selo tom={REVISAO[item.revisao].tom}>{REVISAO[item.revisao].texto}</Selo>
        ) : (
          <Selo>Nova</Selo>
        )}
        <span className="flex-1" />
        {item && paginaFonte && fonte ? (
          <button
            type="button"
            title="Mostrar no documento"
            aria-label={`Proposto pela IA. Mostrar no documento: ${fonte}`}
            onClick={() => {
              aoVerPagina(paginaFonte, trechosDoItem(item))
            }}
            className="inline-flex cursor-pointer items-center gap-(--space-050) rounded-(--radius) text-xs text-(--text-link) outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--border-focus)]"
          >
            <Icone nome="sparkles" tamanho={12} className="text-(--ia)" />
            {fonte}
          </button>
        ) : null}
        {pdfFechado ? (
          <BotaoIcone
            icone="file-text"
            rotulo="Abrir documento"
            tamanho="compacto"
            className="hidden xl:inline-flex"
            onClick={aoAbrirPdf}
          />
        ) : null}
      </div>
      {item?.periodicidadeIa ? (
        <p className="-mt-(--space-100) text-xs text-(--text-subtle)">
          A IA leu a periodicidade “{item.periodicidadeIa}”. O prazo só vale depois de confirmado no
          passo 4.
        </p>
      ) : null}
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      <div className="grid gap-(--space-150) sm:grid-cols-[120px_1fr]">
        <CampoTexto
          rotulo="Código"
          placeholder="4.3"
          disabled={travado}
          value={codigo}
          onChange={(evento) => {
            setCodigo(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Título"
          required
          disabled={travado}
          erro={erroTitulo ?? undefined}
          value={titulo}
          onChange={(evento) => {
            setTitulo(evento.target.value)
            setErroTitulo(null)
          }}
        />
      </div>
      <div className="flex flex-col gap-(--space-050)">
        <div className="flex min-h-6 items-center gap-(--space-100)">
          <label htmlFor={textoId} className="flex-1 rotulo">
            Texto literal da licença
          </label>
          {item?.textoLiteral && !travado ? (
            <Botao
              aparencia="link"
              tamanho="compacto"
              onClick={() => {
                setEditandoTexto((e) => !e)
              }}
            >
              {editandoTexto ? 'Concluir texto' : 'Editar texto'}
            </Botao>
          ) : null}
        </div>
        <textarea
          id={textoId}
          rows={5}
          value={texto}
          readOnly={travado || !editandoTexto}
          placeholder="Copie o texto como está no documento."
          onChange={(evento) => {
            setTexto(evento.target.value)
          }}
          className={cn(classeCampo, classeLeitura, 'min-h-28 py-(--space-150) leading-6')}
        />
        {textoMudou ? (
          <p className="text-xs text-(--text-warning)">
            Texto alterado em relação ao documento. Fica registrado no histórico.
          </p>
        ) : null}
      </div>
      <fieldset disabled={travado} className="flex flex-col gap-(--space-100)">
        <legend className="mb-(--space-050) rotulo">Natureza</legend>
        <div className="grid gap-(--space-100) sm:grid-cols-2">
          {NATUREZAS.map((n) => (
            <label
              key={n.chave}
              className="flex cursor-pointer flex-col gap-0.5 rounded-(--radius) border bg-(--surface) px-(--space-150) py-(--space-100) transicao-estado has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover) has-disabled:cursor-not-allowed has-disabled:opacity-80"
            >
              <span className="inline-flex items-center gap-(--space-100) corpo-medio">
                <input
                  type="radio"
                  name="natureza"
                  checked={natureza === n.chave}
                  onChange={() => {
                    setNatureza(n.chave)
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-circle) border border-(--border-input) bg-(--surface-input) transicao-estado peer-checked:border-(--brand) peer-checked:bg-(--brand) peer-focus-visible:shadow-[0_0_0_2px_var(--border-focus)] after:size-1.5 after:rounded-(--radius-circle) after:bg-(--text-inverse) after:opacity-0 peer-checked:after:opacity-100"
                />
                {n.rotulo}
              </span>
              <span className="pl-6 text-xs text-(--text-subtle)">{n.descricao}</span>
            </label>
          ))}
        </div>
        <p className="flex gap-(--space-075) text-xs text-(--text-subtle)">
          <Icone nome="info" tamanho={12} className="mt-0.5 shrink-0" />
          Cláusula geral (“a empresa deve manter…”) é condição contínua ou informação geral: não
          vira entrega periódica.
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-(--space-100) border-t pt-(--space-200)">
        {!item ? (
          <Botao type="submit" aparencia="primario" iconeAntes="plus" disabled={ocupado}>
            {salvar.isPending ? 'Salvando…' : 'Adicionar'}
          </Botao>
        ) : item.revisao === 'pendente' ? (
          <Botao
            aparencia="primario"
            iconeAntes="check"
            disabled={ocupado}
            onClick={() => {
              if (tituloValido()) revisar.mutate('aceita')
            }}
          >
            {revisar.isPending ? 'Aceitando…' : mudou ? 'Aceitar edição' : 'Aceitar'}
          </Botao>
        ) : editando ? (
          <>
            <Botao type="submit" aparencia="primario" iconeAntes="check" disabled={ocupado}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Botao>
            <Botao
              disabled={ocupado}
              onClick={() => {
                cancelarEdicao(item)
              }}
            >
              Cancelar
            </Botao>
          </>
        ) : item.revisao === 'aceita' ? (
          <Botao
            iconeAntes="pencil"
            onClick={() => {
              setEditando(true)
            }}
          >
            Editar
          </Botao>
        ) : null}
        {item && item.revisao !== 'descartada' ? (
          <Botao
            aparencia="link"
            className="text-(--text-danger)"
            disabled={ocupado}
            onClick={() => {
              revisar.mutate('descartada')
            }}
          >
            Descartar
          </Botao>
        ) : null}
        {item?.revisao === 'descartada' ? (
          <Botao
            disabled={ocupado}
            onClick={() => {
              revisar.mutate('aceita')
            }}
          >
            Restaurar
          </Botao>
        ) : null}
      </div>
    </form>
  )
}

/** /licencas/:id/condicionantes (Protótipo 12; LIC-02). */
export function PassoCondicionantes() {
  const { id = '' } = useParams()
  const salvamento = useSalvamento(id)
  return (
    <GuardaRascunho id={id} passo="condicionantes">
      {(instrumento) => <Condicionantes instrumento={instrumento} salvamento={salvamento} />}
    </GuardaRascunho>
  )
}

function rotuloDe(item: Condicionante | undefined): string {
  return item ? [item.codigo, item.titulo].filter(Boolean).join(' · ') : ''
}

function Condicionantes({
  instrumento,
  salvamento: { salvoEm, registrar },
}: {
  instrumento: Instrumento
  salvamento: ReturnType<typeof useSalvamento>
}) {
  const navegar = useNavigate()
  const consulta = useCondicionantes(instrumento.id)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [paginaPdf, setPaginaPdf] = useState<PedidoDePagina | null>(null)
  const [larguraLista, setLarguraLista] = useLarguraLembrada(
    'grama:condicionantes:lista',
    LISTA.padrao,
    LISTA.minimo,
    LISTA.maximo,
  )
  const [pdfPadrao] = useState(larguraPadraoDoPdf)
  const [larguraPdf, setLarguraPdf] = useLarguraLembrada(
    'grama:condicionantes:documento',
    pdfPadrao,
    PDF.minimo,
    PDF.maximo,
  )
  const [pdfAberto, setPdfAberto] = useState(true)
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set())
  // Item novo ainda na linha da árvore, esperando o título (antes de abrir no centro).
  const [nomeando, setNomeando] = useState(false)
  const dicaMoverId = useId()

  const itens = consulta.data ?? []
  const porId = new Map(itens.map((item) => [item.id, item]))
  const arvore = montarArvore(itens)
  const linhas = linhasVisiveis(arvore, recolhidos, filtro)
  const contagem = {
    todos: itens.length,
    pendente: itens.filter((i) => i.revisao === 'pendente').length,
    aceita: itens.filter((i) => i.revisao === 'aceita').length,
    descartada: itens.filter((i) => i.revisao === 'descartada').length,
  }
  const ativos = itens.length - contagem.descartada
  const podeContinuar = ativos > 0 && contagem.pendente === 0
  const selecionado = edicao?.tipo === 'existente' ? porId.get(edicao.id) : undefined
  const revisados = contagem.aceita + contagem.descartada
  // Como no explorador do VS Code: o novo entra no agrupador selecionado ou junto do item.
  const destino = destinoDoNovo(selecionado)
  const ondeEntra = destino ? ` em ${rotuloDe(porId.get(destino))}` : ''
  const agrupadoresComFilhos = (nos: readonly NoCondicionante[]): string[] =>
    nos.flatMap((no) =>
      no.filhos.length > 0 ? [no.item.id, ...agrupadoresComFilhos(no.filhos)] : [],
    )
  const recolhiveis = agrupadoresComFilhos(arvore)

  function nova(natureza: Natureza) {
    if (destino) {
      setRecolhidos((atual) => {
        const proximo = new Set(atual)
        proximo.delete(destino)
        return proximo
      })
    }
    setEdicao({
      tipo: 'nova',
      natureza,
      paiId: destino,
      codigo: proximoCodigo(itens, destino),
      titulo: '',
    })
    setNomeando(true)
  }

  function alternar(id: string, recolher?: boolean) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual)
      if (recolher ?? !atual.has(id)) proximo.add(id)
      else proximo.delete(id)
      return proximo
    })
  }

  function mostrarNoPdf(item: Condicionante) {
    // Item da IA tem a página; o cadastrado à mão é procurado pelo texto no documento.
    setPaginaPdf((anterior) => ({
      numero: item.origem === 'ia' ? item.fontePagina : null,
      vez: (anterior?.vez ?? 0) + 1,
      trechos: trechosDoItem(item),
    }))
  }

  function selecionar(item: Condicionante) {
    setNomeando(false)
    setEdicao({ tipo: 'existente', id: item.id })
    mostrarNoPdf(item)
  }

  const novaEm = edicao?.tipo === 'nova' ? edicao.paiId : null
  const posicaoDaNova = novaEm ? linhas.findIndex((l) => l.item.id === novaEm) : -1
  const linhaNova =
    edicao?.tipo === 'nova' ? (
      <LinhaNova
        key="nova"
        natureza={edicao.natureza}
        codigo={edicao.codigo}
        nivel={posicaoDaNova >= 0 ? (linhas[posicaoDaNova]?.nivel ?? 0) + 1 : 0}
        nomeando={nomeando}
        titulo={edicao.titulo}
        aoConfirmar={(titulo) => {
          setEdicao({ ...edicao, titulo })
          setNomeando(false)
        }}
        aoCancelar={() => {
          setEdicao(null)
          setNomeando(false)
        }}
      />
    ) : null

  // Mover na árvore: arrastar (soltar em agrupador entra nele; em item, fica junto dele) ou,
  // pelo teclado, Ctrl+X no item e Ctrl+V no destino, como no explorador do VS Code.
  const queryClient = useQueryClient()
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [recortado, setRecortado] = useState<string | null>(null)
  // Destino sob o cursor: id do agrupador, null para fora deles, undefined para nenhum.
  const [alvo, setAlvo] = useState<string | null | undefined>(undefined)
  const [aviso, setAviso] = useState('')
  const abrirDepois = useRef<{ id: string; timer: number } | null>(null)
  const emMovimento =
    (arrastando ?? recortado) ? porId.get(arrastando ?? recortado ?? '') : undefined
  const sobAlvo = typeof alvo === 'string' ? descendentes(arvore, alvo) : new Set<string>()
  const chaveDaLista = ['condicionantes', instrumento.id]

  const mover = useMutation({
    mutationFn: ({ id, paiId }: { id: string; paiId: string | null }) =>
      moverCondicionante(id, paiId),
    onMutate: async ({ id, paiId }) => {
      // Já aparece no lugar novo; se o banco recusar, volta.
      await queryClient.cancelQueries({ queryKey: chaveDaLista })
      const antes = queryClient.getQueryData<Condicionante[]>(chaveDaLista)
      queryClient.setQueryData<Condicionante[]>(chaveDaLista, (atual) =>
        atual?.map((i) => (i.id === id ? { ...i, paiId } : i)),
      )
      return { antes }
    },
    onError: (_erro, _dados, contexto) => {
      if (contexto?.antes) queryClient.setQueryData(chaveDaLista, contexto.antes)
      setAviso('Não foi possível mover.')
    },
    onSuccess: async (_vazio, { id, paiId }) => {
      setAviso(
        `${rotuloDe(porId.get(id))} movido para ${paiId ? rotuloDe(porId.get(paiId)) : 'fora dos agrupadores'}.`,
      )
      await registrar()
    },
  })

  function moverPara(item: Condicionante, destino: string | null) {
    setRecortado(null)
    if (destino) alternar(destino, false)
    mover.mutate({ id: item.id, paiId: destino })
  }

  function limparArraste() {
    setArrastando(null)
    setAlvo(undefined)
    if (abrirDepois.current) window.clearTimeout(abrirDepois.current.timer)
    abrirDepois.current = null
  }

  function aoPassar(evento: DragEvent, sobre: Condicionante | null) {
    const arrastado = arrastando ? porId.get(arrastando) : undefined
    if (!arrastado) return
    const destino = destinoAoSoltar(itens, arrastado, sobre)
    if (destino === undefined) {
      evento.dataTransfer.dropEffect = 'none'
      setAlvo(undefined)
      return
    }
    evento.preventDefault()
    evento.dataTransfer.dropEffect = 'move'
    setAlvo(destino)
    // Agrupador recolhido abre se o item ficar um instante sobre ele, como pasta no VS Code.
    if (typeof destino === 'string' && sobre?.id === destino && recolhidos.has(destino)) {
      if (abrirDepois.current?.id !== destino) {
        if (abrirDepois.current) window.clearTimeout(abrirDepois.current.timer)
        const id = destino
        abrirDepois.current = {
          id,
          timer: window.setTimeout(() => {
            alternar(id, false)
          }, 600),
        }
      }
    }
  }

  function aoSoltar(evento: DragEvent, sobre: Condicionante | null) {
    evento.preventDefault()
    const arrastado = arrastando ? porId.get(arrastando) : undefined
    const destino = arrastado ? destinoAoSoltar(itens, arrastado, sobre) : undefined
    limparArraste()
    if (arrastado && destino !== undefined) moverPara(arrastado, destino)
  }

  /** Ctrl+X recorta o item; Ctrl+V cola no destino (agrupador: dentro; item: junto); Esc desiste. */
  function atalhoDeMover(evento: KeyboardEvent, item: Condicionante): boolean {
    const comando = evento.ctrlKey || evento.metaKey
    const tecla = evento.key.toLowerCase()
    if (comando && tecla === 'x') {
      setRecortado(item.id)
      setAviso(`${rotuloDe(item)} recortado. Vá até o destino e tecle Ctrl+V. Esc cancela.`)
      return true
    }
    if (comando && tecla === 'v' && emMovimento && recortado) {
      const destino = destinoAoSoltar(itens, emMovimento, item)
      if (destino === undefined) setAviso('Não dá para mover para aí. Escolha outro agrupador.')
      else moverPara(emMovimento, destino)
      return true
    }
    if (evento.key === 'Escape' && recortado) {
      setRecortado(null)
      setAviso('Movimento cancelado.')
      return true
    }
    return false
  }

  const botoesVazio = (
    <>
      <Botao
        iconeAntes="plus"
        tamanho="compacto"
        aparencia={itens.length === 0 ? 'primario' : 'padrao'}
        onClick={() => {
          nova('obrigacao')
        }}
      >
        Obrigação
      </Botao>
      <Botao
        iconeAntes="plus"
        tamanho="compacto"
        onClick={() => {
          nova('agrupador')
        }}
      >
        Agrupador
      </Botao>
    </>
  )

  return (
    <MolduraCadastro
      passo="condicionantes"
      instrumentoId={instrumento.id}
      identificacao={
        instrumento.tipoSigla && instrumento.numero
          ? `${instrumento.tipoSigla} ${instrumento.numero}`
          : null
      }
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      salvoEm={salvoEm}
      larga
      rodape={
        <RodapeCadastro
          aviso={
            ativos === 0
              ? 'Adicione ao menos uma condicionante.'
              : contagem.pendente > 0
                ? `Faltam ${String(contagem.pendente)} itens para revisar.`
                : undefined
          }
          voltarPara={`/licencas/${instrumento.id}/identificacao`}
          aoContinuar={() => void navegar(`/licencas/${instrumento.id}/prazos`)}
          podeContinuar={podeContinuar}
        />
      }
    >
      <div
        className="flex min-h-0 flex-col md:h-full md:flex-row"
        style={
          {
            '--largura-lista': `${String(larguraLista)}px`,
            '--largura-pdf': `${String(larguraPdf)}px`,
          } as CSSProperties
        }
      >
        <section
          aria-label="Lista de condicionantes"
          className="flex min-h-0 flex-col border-r bg-(--surface) md:min-w-[260px] md:flex-[0_1_var(--largura-lista)]"
        >
          <div className="flex flex-col gap-(--space-100) border-b p-(--space-150)">
            <div className="flex items-center gap-(--space-050)">
              <span className="flex-1 text-xs text-(--text-subtle)">
                {revisados} de {itens.length} revisados
              </span>
              <div
                role="toolbar"
                aria-label="Ações da lista"
                className="flex items-center gap-(--space-025)"
              >
                <BotaoIcone
                  icone="file-plus"
                  rotulo="Nova condicionante"
                  title={`Nova condicionante${ondeEntra}`}
                  onClick={() => {
                    nova('obrigacao')
                  }}
                />
                <BotaoIcone
                  icone="folder-plus"
                  rotulo="Novo agrupador"
                  title={`Novo agrupador${ondeEntra}`}
                  onClick={() => {
                    nova('agrupador')
                  }}
                />
                <BotaoIcone
                  icone="chevrons-down-up"
                  rotulo="Recolher todos"
                  title="Recolher todos"
                  disabled={recolhiveis.length === 0}
                  onClick={() => {
                    setRecolhidos(new Set(recolhiveis))
                  }}
                />
              </div>
            </div>
            <div
              className="h-1 overflow-hidden rounded-(--radius) bg-(--border)"
              aria-hidden="true"
            >
              <div
                className="h-full bg-(--brand)"
                style={{
                  width: `${String(itens.length ? (revisados / itens.length) * 100 : 0)}%`,
                }}
              />
            </div>
            <div
              role="group"
              aria-label="Filtrar condicionantes"
              className="flex flex-wrap gap-(--space-050)"
            >
              {(
                [
                  ['todos', 'Todos'],
                  ['pendente', 'Para revisar'],
                  ['aceita', 'Aceitos'],
                  ['descartada', 'Descartados'],
                ] as const
              ).map(([chave, rotulo]) => (
                <button
                  key={chave}
                  type="button"
                  aria-pressed={filtro === chave}
                  onClick={() => {
                    setFiltro(chave)
                  }}
                  className={cn(
                    'inline-flex h-(--size-control-sm) cursor-pointer items-center gap-(--space-050) rounded-(--radius) border px-(--space-100) text-xs transicao-estado',
                    filtro === chave
                      ? 'border-(--border-focus) bg-(--surface-selected) text-(--text-link)'
                      : 'hover:bg-(--surface-hover)',
                  )}
                >
                  {rotulo} <span className="font-semibold">{contagem[chave]}</span>
                </button>
              ))}
            </div>
          </div>
          {recortado && emMovimento ? (
            <div className="flex items-center gap-(--space-100) border-b bg-(--surface-sunken) px-(--space-150) py-(--space-075) text-xs">
              <Icone nome="grip-vertical" tamanho={12} className="shrink-0 text-(--icon)" />
              <span className="min-w-0 flex-1">
                Movendo <span className="font-semibold">{rotuloDe(emMovimento)}</span>: selecione o
                destino e tecle Ctrl+V.
              </span>
              <Botao
                aparencia="link"
                tamanho="compacto"
                onClick={() => {
                  setRecortado(null)
                }}
              >
                Cancelar
              </Botao>
            </div>
          ) : null}
          {mover.error ? (
            <MensagemSecao role="alert" tom="perigo" className="m-(--space-150)">
              {mensagemDoErro(mover.error)}
            </MensagemSecao>
          ) : null}
          <p role="status" className="sr-only">
            {aviso}
          </p>
          <span id={dicaMoverId} hidden>
            Arraste para mover. Ctrl+X recorta e Ctrl+V cola no agrupador.
          </span>
          <div className="min-h-0 flex-1 overflow-auto">
            {consulta.isPending ? (
              <Carregando
                rotulo="Carregando condicionantes"
                linhas={4}
                className="m-(--space-150)"
              />
            ) : consulta.isError ? (
              <EstadoErro
                aoTentarDeNovo={() => void consulta.refetch()}
                className="m-(--space-150)"
              />
            ) : itens.length === 0 && edicao?.tipo !== 'nova' ? (
              <EstadoVazio
                icone="file-check"
                titulo="Adicione a primeira condicionante"
                descricao="Use obrigação para o que tem entrega e agrupador para títulos. Com um agrupador selecionado, o novo item entra dentro dele."
              />
            ) : (
              <ul aria-label="Condicionantes">
                {edicao?.tipo === 'nova' && posicaoDaNova === -1 ? linhaNova : null}
                {linhas.map(({ item, nivel, temFilhos, recolhido }, indice) => {
                  const natureza = NATUREZAS.find((n) => n.chave === item.natureza)
                  const ativo = edicao?.tipo === 'existente' && edicao.id === item.id
                  const nome = item.codigo || item.titulo
                  return [
                    // Arrastar é atalho de mouse; pelo teclado, Ctrl+X e Ctrl+V no botão da linha.
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                    <li
                      key={item.id}
                      draggable={!nomeando}
                      onDragStart={(evento) => {
                        evento.dataTransfer.effectAllowed = 'move'
                        evento.dataTransfer.setData('text/plain', item.id)
                        setRecortado(null)
                        setArrastando(item.id)
                      }}
                      onDragEnd={limparArraste}
                      onDragOver={(evento) => {
                        aoPassar(evento, item)
                      }}
                      onDrop={(evento) => {
                        aoSoltar(evento, item)
                      }}
                      className={cn(
                        'flex border-b transicao-estado hover:bg-(--surface-hover)',
                        ativo && 'bg-(--surface-selected) hover:bg-(--surface-selected-hover)',
                        sobAlvo.has(item.id) && 'bg-(--surface-selected)',
                        alvo === item.id && 'shadow-[inset_0_0_0_2px_var(--border-focus)]',
                        emMovimento?.id === item.id && 'opacity-50',
                      )}
                      style={{ paddingLeft: `${String(nivel * 16)}px` }}
                    >
                      {temFilhos ? (
                        <button
                          type="button"
                          aria-expanded={!recolhido}
                          aria-label={`${recolhido ? 'Expandir' : 'Recolher'} ${nome}`}
                          onClick={() => {
                            alternar(item.id)
                          }}
                          className="flex w-6 shrink-0 cursor-pointer items-start justify-center pt-(--space-100) text-(--icon) outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--border-focus)]"
                        >
                          <Icone
                            nome="chevron-right"
                            tamanho={12}
                            className={cn('mt-0.5 transicao-estado', !recolhido && 'rotate-90')}
                          />
                        </button>
                      ) : (
                        <span aria-hidden="true" className="w-6 shrink-0" />
                      )}
                      <button
                        type="button"
                        aria-current={ativo ? 'true' : undefined}
                        aria-expanded={temFilhos ? !recolhido : undefined}
                        aria-describedby={dicaMoverId}
                        onClick={() => {
                          selecionar(item)
                        }}
                        onKeyDown={(evento) => {
                          if (atalhoDeMover(evento, item)) {
                            evento.preventDefault()
                            return
                          }
                          // Setas como no explorador: esquerda recolhe, direita expande.
                          if (!temFilhos) return
                          if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') {
                            evento.preventDefault()
                            alternar(item.id, evento.key === 'ArrowLeft')
                          }
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer gap-(--space-100) py-(--space-100) pr-(--space-150) text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--border-focus)]"
                      >
                        <span className="shrink-0 pt-0.5 font-mono text-xs text-(--text-subtle)">
                          {item.codigo}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-(--space-050)">
                          <span
                            className={cn(
                              'truncate',
                              item.natureza === 'agrupador' || ativo ? 'corpo-medio' : 'corpo',
                              ativo && 'text-(--text-link)',
                              item.revisao === 'descartada' && 'text-(--text-subtle) line-through',
                            )}
                          >
                            {item.titulo}
                          </span>
                          <span className="flex gap-(--space-050)">
                            {item.natureza !== 'agrupador' && natureza ? (
                              <Selo>{natureza.curto}</Selo>
                            ) : null}
                            <Selo tom={REVISAO[item.revisao].tom}>
                              {REVISAO[item.revisao].texto}
                            </Selo>
                          </span>
                        </span>
                      </button>
                    </li>,
                    indice === posicaoDaNova ? linhaNova : null,
                  ]
                })}
              </ul>
            )}
            {emMovimento?.paiId ? (
              <button
                type="button"
                disabled={!recortado}
                onClick={() => {
                  moverPara(emMovimento, null)
                }}
                onDragOver={(evento) => {
                  aoPassar(evento, null)
                }}
                onDrop={(evento) => {
                  aoSoltar(evento, null)
                }}
                className={cn(
                  'm-(--space-150) flex min-h-14 w-[calc(100%-var(--space-150)*2)] items-center justify-center gap-(--space-075) rounded-(--radius) border border-dashed px-(--space-150) text-xs text-(--text-subtle) transicao-estado outline-none enabled:cursor-pointer focus-visible:shadow-[0_0_0_2px_var(--border-focus)]',
                  alvo === null &&
                    'border-(--border-focus) bg-(--surface-selected) text-(--text-link)',
                )}
              >
                <Icone nome="arrow-left" tamanho={12} />
                {recortado ? 'Colar fora dos agrupadores' : 'Solte aqui para tirar dos agrupadores'}
              </button>
            ) : null}
          </div>
        </section>

        <DivisorRedimensionavel
          rotulo="Ajustar largura da lista"
          valor={larguraLista}
          minimo={LISTA.minimo}
          maximo={LISTA.maximo}
          padrao={LISTA.padrao}
          aoMudar={setLarguraLista}
          className="hidden md:block"
        />

        <section
          aria-label="Detalhe da condicionante"
          className="min-h-0 overflow-auto bg-(--surface) p-(--space-200) md:min-w-[360px] md:flex-1 md:p-(--space-300)"
        >
          {edicao?.tipo === 'nova' && nomeando ? (
            <EstadoVazio
              icone={edicao.natureza === 'agrupador' ? 'folder' : 'file-text'}
              titulo={edicao.natureza === 'agrupador' ? 'Novo agrupador' : 'Nova condicionante'}
              descricao="Escreva o título na lista e tecle Enter. Esc cancela."
              className="h-full justify-center"
            />
          ) : edicao ? (
            <Editor
              key={
                edicao.tipo === 'existente'
                  ? edicao.id
                  : `nova:${edicao.natureza}:${edicao.paiId ?? ''}:${edicao.titulo}`
              }
              instrumentoId={instrumento.id}
              edicao={edicao}
              item={selecionado}
              pdfFechado={!pdfAberto}
              aoSalvar={async (salvoId) => {
                await registrar()
                setEdicao({ tipo: 'existente', id: salvoId })
              }}
              aoVerPagina={(numero, trechos) => {
                setPdfAberto(true)
                setPaginaPdf((anterior) => ({ numero, vez: (anterior?.vez ?? 0) + 1, trechos }))
              }}
              aoAbrirPdf={() => {
                setPdfAberto(true)
              }}
            />
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center">
              {!pdfAberto ? (
                <BotaoIcone
                  icone="file-text"
                  rotulo="Abrir documento"
                  tamanho="compacto"
                  className="absolute top-0 right-0 hidden xl:inline-flex"
                  onClick={() => {
                    setPdfAberto(true)
                  }}
                />
              ) : null}
              <EstadoVazio
                icone="file-check"
                titulo={
                  itens.length === 0
                    ? 'Adicione a primeira condicionante'
                    : 'Escolha um item da lista'
                }
                descricao={
                  itens.length === 0
                    ? 'Copie o texto literal da licença. Depois escolha a natureza: só obrigação vira prazo.'
                    : 'Ou adicione outro item.'
                }
                acaoPrincipal={
                  <div className="flex flex-wrap justify-center gap-(--space-100)">
                    {botoesVazio}
                  </div>
                }
              />
            </div>
          )}
        </section>

        {pdfAberto ? (
          <DivisorRedimensionavel
            rotulo="Ajustar largura do documento"
            valor={larguraPdf}
            minimo={PDF.minimo}
            maximo={PDF.maximo}
            padrao={pdfPadrao}
            painel="direita"
            aoMudar={setLarguraPdf}
            className="hidden xl:block"
          />
        ) : null}
        {/* Fechado, o painel só some: ao reabrir, o PDF continua na mesma página. */}
        <PainelPdf
          instrumento={instrumento}
          paginaPedida={paginaPdf}
          oculto={!pdfAberto}
          aoFechar={() => {
            setPdfAberto(false)
          }}
          className="hidden min-h-[480px] min-w-[320px] flex-[0_1_var(--largura-pdf)] xl:flex"
        />
      </div>
    </MolduraCadastro>
  )
}
