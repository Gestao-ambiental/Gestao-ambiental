import { useMutation } from '@tanstack/react-query'
import { useId, useState, type CSSProperties } from 'react'
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
  revisarCondicionante,
  salvarCondicionante,
  type Condicionante,
  type Instrumento,
  type Natureza,
  type Revisao,
} from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

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
const PDF = { padrao: 420, minimo: 320, maximo: 960 }

/** Pais na ordem de cadastro, cada um seguido dos seus subitens. */
function emArvore(itens: readonly Condicionante[]): Condicionante[] {
  const filhos = new Map<string, Condicionante[]>()
  for (const item of itens) {
    if (item.paiId) filhos.set(item.paiId, [...(filhos.get(item.paiId) ?? []), item])
  }
  return itens.filter((item) => !item.paiId).flatMap((pai) => [pai, ...(filhos.get(pai.id) ?? [])])
}

const classeCampo =
  'w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus) focus:bg-(--surface-input-focus)'

/** Texto fora de edição: caixa cinza de leitura, como no Protótipo 12. */
const classeLeitura =
  'read-only:border-transparent read-only:bg-(--surface-sunken) read-only:focus:border-(--border-focus)'

type Edicao =
  { tipo: 'existente'; id: string } | { tipo: 'nova'; natureza: Natureza; paiId: string | null }

/** Onde o item está no PDF: o texto literal inteiro, o começo dele ou o título. */
function trechosDoItem(item: Condicionante): string[] {
  return [item.textoLiteral, item.textoLiteral.slice(0, 80), item.titulo]
}

function Editor({
  instrumentoId,
  edicao,
  item,
  agrupadores,
  pdfFechado,
  aoSalvar,
  aoVerPagina,
  aoAbrirPdf,
}: {
  instrumentoId: string
  edicao: Edicao
  item: Condicionante | undefined
  agrupadores: readonly Condicionante[]
  pdfFechado: boolean
  aoSalvar: (id: string) => Promise<void>
  aoVerPagina: (pagina: number, trechos: readonly string[]) => void
  aoAbrirPdf: () => void
}) {
  const textoId = useId()
  const [id] = useState(() => (edicao.tipo === 'existente' ? edicao.id : crypto.randomUUID()))
  const [codigo, setCodigo] = useState(item?.codigo ?? '')
  const [titulo, setTitulo] = useState(item?.titulo ?? '')
  const [texto, setTexto] = useState(item?.textoLiteral ?? '')
  const [natureza, setNatureza] = useState<Natureza>(
    item?.natureza ?? (edicao.tipo === 'nova' ? edicao.natureza : 'obrigacao'),
  )
  const [paiId, setPaiId] = useState<string | null>(
    item?.paiId ?? (edicao.tipo === 'nova' ? edicao.paiId : null),
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
      natureza !== item.natureza ||
      paiId !== item.paiId)
  const textoMudou = item?.origem === 'ia' && texto !== item.textoLiteral

  const dados = () => ({
    paiId: natureza === 'agrupador' ? null : paiId,
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
    setPaiId(original.paiId)
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
      {natureza !== 'agrupador' && agrupadores.length > 0 ? (
        <label className="flex flex-col gap-(--space-050)">
          <span className="rotulo">Dentro de</span>
          <select
            value={paiId ?? ''}
            disabled={travado}
            onChange={(evento) => {
              setPaiId(evento.target.value || null)
            }}
            className={cn(classeCampo, 'h-(--size-control) disabled:bg-(--surface-sunken)')}
          >
            <option value="">Nenhum agrupador</option>
            {agrupadores
              .filter((a) => a.id !== id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {[a.codigo, a.titulo].filter(Boolean).join(' · ')}
                </option>
              ))}
          </select>
        </label>
      ) : null}
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
  const [larguraLista, setLarguraLista] = useState(LISTA.padrao)
  const [larguraPdf, setLarguraPdf] = useState(PDF.padrao)
  const [pdfAberto, setPdfAberto] = useState(true)

  const itens = consulta.data ?? []
  const ordem = emArvore(itens)
  const contagem = {
    todos: itens.length,
    pendente: itens.filter((i) => i.revisao === 'pendente').length,
    aceita: itens.filter((i) => i.revisao === 'aceita').length,
    descartada: itens.filter((i) => i.revisao === 'descartada').length,
  }
  const visiveis = ordem.filter((i) => filtro === 'todos' || i.revisao === filtro)
  const agrupadores = itens.filter((i) => i.natureza === 'agrupador' && i.revisao !== 'descartada')
  const ativos = itens.length - contagem.descartada
  const podeContinuar = ativos > 0 && contagem.pendente === 0
  const selecionado =
    edicao?.tipo === 'existente' ? itens.find((i) => i.id === edicao.id) : undefined
  const revisados = contagem.aceita + contagem.descartada

  function nova(natureza: Natureza, paiId: string | null = null) {
    setEdicao({ tipo: 'nova', natureza, paiId })
  }

  const ultimoAgrupador = agrupadores.at(-1)
  const botoesNovos = (
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
      <Botao
        iconeAntes="plus"
        tamanho="compacto"
        disabled={!ultimoAgrupador}
        title={ultimoAgrupador ? undefined : 'Subitem fica disponível depois do primeiro agrupador'}
        onClick={() => {
          nova(
            'obrigacao',
            selecionado?.natureza === 'agrupador' ? selecionado.id : (ultimoAgrupador?.id ?? null),
          )
        }}
      >
        Subitem
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
            <div className="flex flex-col gap-(--space-050)">
              <span className="self-end text-xs text-(--text-subtle)">
                {revisados} de {itens.length} revisados
              </span>
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
            ) : itens.length === 0 ? (
              <EstadoVazio
                icone="file-check"
                titulo="Adicione a primeira condicionante"
                descricao="Use obrigação para o que tem entrega, agrupador para títulos e subitem para o que fica dentro de um agrupador."
              />
            ) : (
              <ul aria-label="Condicionantes">
                {visiveis.map((item) => {
                  const natureza = NATUREZAS.find((n) => n.chave === item.natureza)
                  const ativo = edicao?.tipo === 'existente' && edicao.id === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={ativo ? 'true' : undefined}
                        onClick={() => {
                          setEdicao({ tipo: 'existente', id: item.id })
                        }}
                        className={cn(
                          'flex w-full cursor-pointer gap-(--space-100) border-b px-(--space-150) py-(--space-100) text-left transicao-estado hover:bg-(--surface-hover)',
                          ativo && 'bg-(--surface-selected) hover:bg-(--surface-selected-hover)',
                          item.paiId && 'pl-(--space-400)',
                        )}
                      >
                        <span className="w-10 shrink-0 pt-0.5 font-mono text-xs text-(--text-subtle)">
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
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-(--space-050) border-t p-(--space-150)">
            {botoesNovos}
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
          {edicao ? (
            <Editor
              key={
                edicao.tipo === 'existente'
                  ? edicao.id
                  : `nova:${edicao.natureza}:${edicao.paiId ?? ''}`
              }
              instrumentoId={instrumento.id}
              edicao={edicao}
              item={selecionado}
              agrupadores={agrupadores}
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
                  <div className="flex flex-col items-center gap-(--space-100)">
                    <div className="flex flex-wrap justify-center gap-(--space-100)">
                      {botoesNovos}
                    </div>
                    {!ultimoAgrupador ? (
                      <p className="text-xs text-(--text-subtle)">
                        Subitem fica disponível depois do primeiro agrupador.
                      </p>
                    ) : null}
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
            padrao={PDF.padrao}
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
