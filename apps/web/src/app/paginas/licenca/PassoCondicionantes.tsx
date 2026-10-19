import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import type { PedidoDePagina } from '@/components/pdf/VisualizadorPdf'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
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
import { MarcaIa } from './MarcaIa'
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

type Edicao =
  { tipo: 'existente'; id: string } | { tipo: 'nova'; natureza: Natureza; paiId: string | null }

function Editor({
  instrumentoId,
  edicao,
  item,
  agrupadores,
  aoSalvar,
  aoVerPagina,
}: {
  instrumentoId: string
  edicao: Edicao
  item: Condicionante | undefined
  agrupadores: readonly Condicionante[]
  aoSalvar: (id: string) => Promise<void>
  aoVerPagina: (pagina: number) => void
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

  const salvar = useMutation({
    mutationFn: () =>
      salvarCondicionante(id, instrumentoId, {
        paiId: natureza === 'agrupador' ? null : paiId,
        codigo,
        titulo,
        textoLiteral: texto,
        natureza,
      }),
    onSuccess: () => aoSalvar(id),
  })
  const revisar = useMutation({
    mutationFn: (revisao: 'aceita' | 'descartada') => revisarCondicionante(id, revisao),
    onSuccess: () => aoSalvar(id),
  })

  const ocupado = salvar.isPending || revisar.isPending
  const erro = salvar.error ?? revisar.error

  return (
    <form
      noValidate
      aria-label={item ? `Condicionante ${item.codigo || item.titulo}` : 'Nova condicionante'}
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!titulo.trim()) {
          setErroTitulo('Informe o título')
          return
        }
        salvar.mutate()
      }}
      className="flex flex-col gap-(--space-200)"
    >
      <div className="flex items-center gap-(--space-100)">
        <span className="font-mono text-(--text-subtle)">{codigo || '—'}</span>
        {item ? (
          <Selo tom={REVISAO[item.revisao].tom}>{REVISAO[item.revisao].texto}</Selo>
        ) : (
          <Selo>Nova</Selo>
        )}
      </div>
      {item?.origem === 'ia' ? (
        <div className="flex flex-col gap-(--space-050)">
          <MarcaIa pagina={item.fontePagina} aoVerPagina={aoVerPagina} />
          {item.periodicidadeIa ? (
            <p className="text-xs text-(--text-subtle)">
              A IA leu a periodicidade “{item.periodicidadeIa}”. O prazo só vale depois de
              confirmado no passo 4.
            </p>
          ) : null}
        </div>
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
          value={codigo}
          onChange={(evento) => {
            setCodigo(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Título"
          required
          erro={erroTitulo ?? undefined}
          value={titulo}
          onChange={(evento) => {
            setTitulo(evento.target.value)
            setErroTitulo(null)
          }}
        />
      </div>
      <label htmlFor={textoId} className="flex flex-col gap-(--space-050)">
        <span className="rotulo">Texto literal da licença</span>
        <textarea
          id={textoId}
          rows={5}
          value={texto}
          placeholder="Copie o texto como está no documento."
          onChange={(evento) => {
            setTexto(evento.target.value)
          }}
          className={cn(classeCampo, 'min-h-28 py-(--space-100)')}
        />
      </label>
      <fieldset className="flex flex-col gap-(--space-100)">
        <legend className="mb-(--space-050) rotulo">Natureza</legend>
        <div className="grid gap-(--space-100) sm:grid-cols-2">
          {NATUREZAS.map((n) => (
            <label
              key={n.chave}
              className="flex cursor-pointer flex-col gap-0.5 rounded-(--radius) border px-(--space-150) py-(--space-100) transicao-estado has-checked:border-(--border-focus) has-checked:bg-(--surface-selected) hover:bg-(--surface-hover)"
            >
              <span className="inline-flex items-center gap-(--space-100) corpo">
                <input
                  type="radio"
                  name="natureza"
                  checked={natureza === n.chave}
                  onChange={() => {
                    setNatureza(n.chave)
                  }}
                  className="size-4 accent-(--brand)"
                />
                {n.rotulo}
              </span>
              <span className="pl-6 text-xs text-(--text-subtle)">{n.descricao}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-(--text-subtle)">
          Cláusula geral (“a empresa deve manter…”) é condição contínua ou informação geral: não
          vira entrega periódica.
        </p>
      </fieldset>
      {natureza !== 'agrupador' && agrupadores.length > 0 ? (
        <label className="flex flex-col gap-(--space-050)">
          <span className="rotulo">Dentro de</span>
          <select
            value={paiId ?? ''}
            onChange={(evento) => {
              setPaiId(evento.target.value || null)
            }}
            className={cn(classeCampo, 'h-(--size-control)')}
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
        <Botao type="submit" aparencia="primario" iconeAntes="check" disabled={ocupado}>
          {salvar.isPending ? 'Salvando…' : item ? 'Salvar' : 'Adicionar'}
        </Botao>
        {item?.revisao === 'pendente' ? (
          <Botao
            disabled={ocupado}
            onClick={() => {
              revisar.mutate('aceita')
            }}
          >
            Aceitar
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
            aparencia="link"
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

/** /licencas/:id/condicionantes (Protótipo 12, caminho manual; LIC-02). */
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
      <div className="grid h-full min-h-0 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,420px)]">
        <section
          aria-label="Lista de condicionantes"
          className="flex min-h-0 flex-col border-r bg-(--surface)"
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
                          ativo && 'bg-(--surface-selected)',
                          item.paiId && 'pl-(--space-400)',
                        )}
                      >
                        <span className="w-10 shrink-0 font-mono text-xs text-(--text-subtle)">
                          {item.codigo}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-(--space-050)">
                          <span
                            className={cn(
                              'truncate',
                              item.natureza === 'agrupador' ? 'corpo-medio' : 'corpo',
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

        <section
          aria-label="Detalhe da condicionante"
          className="min-h-0 overflow-auto bg-(--surface) p-(--space-200) md:p-(--space-300)"
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
              aoSalvar={async (salvoId) => {
                await registrar()
                setEdicao({ tipo: 'existente', id: salvoId })
              }}
              aoVerPagina={(numero) => {
                setPaginaPdf((anterior) => ({ numero, vez: (anterior?.vez ?? 0) + 1 }))
              }}
            />
          ) : (
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
                <div className="flex flex-wrap justify-center gap-(--space-100)">{botoesNovos}</div>
              }
            />
          )}
        </section>

        <PainelPdf
          instrumento={instrumento}
          paginaPedida={paginaPdf}
          className="hidden min-h-[480px] xl:flex"
        />
      </div>
    </MolduraCadastro>
  )
}
