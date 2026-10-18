import { formatarCnpj, hojeNoFuso } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarUnidades, obterEmpreendimento, type Empreendimento } from '@/lib/api/empreendimentos'
import { TAMANHO_PAGINA_LICENCAS, listarLicencasDoEmpreendimento } from '@/lib/api/licencas'
import { cn } from '@/lib/utils'

import { DialogoEmpreendimento } from './DialogoEmpreendimento'
import { DialogoUnidades } from './DialogoUnidades'
import { SiglaEmpreendimento } from './SiglaEmpreendimento'
import { TabelaLicencas } from './TabelaLicencas'

function Migalhas({ nome }: { nome?: string }) {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-(--space-050) corpo">
      <Link
        to="/empreendimentos"
        aria-label="Voltar para Empreendimentos"
        title="Voltar para Empreendimentos"
        className="inline-flex size-(--size-control) items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Icone nome="chevron-left" />
      </Link>
      <Link to="/empreendimentos">Empreendimentos</Link>
      {nome ? (
        <>
          <span className="text-(--text-subtle)" aria-hidden="true">
            /
          </span>
          <span className="text-(--text-subtle)" aria-current="page">
            {nome}
          </span>
        </>
      ) : null}
    </nav>
  )
}

function Cabecalho({
  empreendimento,
  aoEditar,
  cadastrarPara,
}: {
  empreendimento: Empreendimento
  aoEditar: () => void
  /** Só a Gestão cadastra licença; sem destino, o botão não aparece. */
  cadastrarPara: string | null
}) {
  const cnpj = formatarCnpj(empreendimento.cnpj)
  return (
    <div className="flex flex-wrap items-start gap-(--space-150)">
      <SiglaEmpreendimento nome={empreendimento.nome} grande />
      <div className="flex min-w-0 flex-1 flex-col gap-(--space-025)">
        <h1 className="titulo-tela text-(--text)">{empreendimento.nome}</h1>
        <p className="flex flex-wrap gap-x-(--space-050) corpo text-(--text-subtle)">
          <span className={empreendimento.clienteNome ? undefined : 'text-(--text-subtlest)'}>
            {empreendimento.clienteNome ?? 'Cliente contratante não informado'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            CNPJ{' '}
            {cnpj ? (
              <span className="font-mono text-(--text)">{cnpj}</span>
            ) : (
              <span className="text-(--text-subtlest)">não informado</span>
            )}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-(--space-100)">
        <Botao iconeAntes="settings" onClick={aoEditar}>
          Editar
        </Botao>
        {cadastrarPara ? (
          <Botao aparencia="primario" asChild>
            <Link to={cadastrarPara}>
              <Icone nome="plus" />
              Cadastrar licença
            </Link>
          </Botao>
        ) : null}
      </div>
    </div>
  )
}

/**
 * /empreendimentos/:id (Protótipo 09, onda 1 "só licenças"; EMP-02). Cabeçalho, filtro rápido por
 * unidade, busca e a lista de licenças com validade e situação calculada.
 */
export function PaginaEmpreendimento() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const local = useLocation()
  const queryClient = useQueryClient()
  const aviso = (local.state as { aviso?: string } | null)?.aviso
  const [editarAberto, setEditarAberto] = useState(false)
  const [unidadesAberto, setUnidadesAberto] = useState(false)
  const [unidadeFiltro, setUnidadeFiltro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const empreendimento = useQuery({
    queryKey: ['empreendimento', id],
    queryFn: () => obterEmpreendimento(id),
  })
  const unidades = useQuery({
    queryKey: ['unidades', id],
    queryFn: () => listarUnidades(id),
    enabled: Boolean(empreendimento.data),
  })
  const [ordemDecrescente, setOrdemDecrescente] = useState(true)
  const licencas = useInfiniteQuery({
    queryKey: ['licencas', id],
    queryFn: ({ pageParam }) => listarLicencasDoEmpreendimento(id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_LICENCAS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    enabled: Boolean(empreendimento.data),
  })

  const nome = empreendimento.data?.nome
  useEffect(() => {
    document.title = `${nome ?? 'Empreendimento'} · Grama`
  }, [nome])

  if (empreendimento.isPending) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        <Carregando rotulo="Carregando o empreendimento" linhas={4} />
      </div>
    )
  }
  if (empreendimento.isError) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        <EstadoErro
          titulo="Não foi possível carregar o empreendimento."
          aoTentarDeNovo={() => void empreendimento.refetch()}
        />
      </div>
    )
  }
  if (!empreendimento.data) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Migalhas />
        <h1 className="sr-only">Empreendimento não encontrado</h1>
        <EstadoVazio
          icone="briefcase"
          titulo="Empreendimento não encontrado"
          descricao={`Ele não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Voltar para Empreendimentos</Link>
            </Botao>
          }
        />
      </div>
    )
  }

  const dados = empreendimento.data
  const listaUnidades = unidades.data ?? []
  const todasLicencas = licencas.data?.pages.flatMap((p) => p.itens) ?? []
  const termo = busca.trim().toLowerCase()
  const daBusca = todasLicencas.filter(
    (l) =>
      !termo ||
      [l.numero, l.orgao, l.sigla, l.tipoNome, l.unidadeNome].some((v) =>
        v?.toLowerCase().includes(termo),
      ),
  )
  const filtradas = daBusca
    .filter((l) => !unidadeFiltro || l.unidadeId === unidadeFiltro)
    .sort(
      (a, b) =>
        (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0) *
        (ordemDecrescente ? -1 : 1),
    )
  const chips = [
    { id: null, rotulo: 'Todos', contagem: daBusca.length },
    ...listaUnidades.map((u) => ({
      id: u.id,
      rotulo: u.nome,
      contagem: daBusca.filter((l) => l.unidadeId === u.id).length,
    })),
  ]
  const ehGestao = atual.papel === 'gestao'
  const cadastrarPara = ehGestao
    ? `/licencas/nova?empreendimento=${id}${unidadeFiltro ? `&unidade=${unidadeFiltro}` : ''}`
    : null
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const filtrando = Boolean(termo || unidadeFiltro)

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Migalhas nome={dados.nome} />
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}
      <Cabecalho
        empreendimento={dados}
        cadastrarPara={cadastrarPara}
        aoEditar={() => {
          setEditarAberto(true)
        }}
      />

      <div className="flex flex-wrap items-center gap-(--space-100)">
        <label className="relative flex items-center">
          <span className="sr-only">Buscar neste empreendimento</span>
          <Icone
            nome="search"
            className="pointer-events-none absolute left-(--space-100) text-(--icon-subtle)"
          />
          <input
            type="search"
            value={busca}
            placeholder="Buscar por número, nome ou órgão"
            onChange={(evento) => {
              setBusca(evento.target.value)
            }}
            className="h-(--size-control) w-[260px] max-w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) pr-(--space-100) pl-(--space-400) corpo text-(--text) outline-none transicao-estado focus:border-(--border-focus) focus:bg-(--surface-input-focus)"
          />
        </label>
        <div
          role="group"
          aria-label="Filtrar por unidade"
          className="flex max-w-full items-center gap-(--space-050) overflow-x-auto"
        >
          <span className="text-xs text-(--text-subtle)">Documentos</span>
          {unidades.isPending
            ? null
            : chips.map((chip) => {
                const ligado = unidadeFiltro === chip.id
                return (
                  <button
                    key={chip.id ?? 'todos'}
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => {
                      setUnidadeFiltro(chip.id)
                    }}
                    className={cn(
                      'inline-flex h-(--size-control) shrink-0 cursor-pointer items-center gap-(--space-050) rounded-(--radius) border px-(--space-100) corpo whitespace-nowrap transicao-estado',
                      ligado
                        ? 'border-(--border-focus) bg-(--surface-selected) text-(--text-link)'
                        : 'border-(--border) hover:bg-(--surface-hover)',
                    )}
                  >
                    {chip.rotulo}
                    <span className="text-xs text-(--text-subtle)">{chip.contagem}</span>
                  </button>
                )
              })}
        </div>
        <Botao
          aparencia="sutil"
          iconeAntes="list"
          className="ml-auto"
          onClick={() => {
            setUnidadesAberto(true)
          }}
        >
          Gerenciar unidades
        </Botao>
      </div>

      {unidades.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar as unidades."
          aoTentarDeNovo={() => void unidades.refetch()}
        />
      ) : null}

      <section
        aria-label="Licenças"
        className="flex flex-col overflow-hidden rounded-(--radius) border bg-(--surface)"
      >
        {licencas.isPending ? (
          <Carregando rotulo="Carregando licenças" linhas={3} className="border-0" />
        ) : licencas.isError ? (
          <EstadoErro
            titulo="Não foi possível carregar as licenças."
            aoTentarDeNovo={() => void licencas.refetch()}
            className="m-(--space-150)"
          />
        ) : (
          <TabelaLicencas
            itens={filtradas}
            totalSemFiltro={todasLicencas.length}
            hoje={hoje}
            fuso={atual.fuso}
            podeEditar={ehGestao}
            ordemDecrescente={ordemDecrescente}
            aoInverterOrdem={() => {
              setOrdemDecrescente((d) => !d)
            }}
            aoLimparFiltros={() => {
              setBusca('')
              setUnidadeFiltro(null)
            }}
          />
        )}
        <div className="flex items-center gap-(--space-100) border-t px-(--space-150) py-(--space-100)">
          <p className="flex-1 text-xs text-(--text-subtle)">
            {todasLicencas.length === 0
              ? 'Nenhum item'
              : filtrando
                ? `${String(filtradas.length)} de ${String(todasLicencas.length)} itens`
                : `${String(todasLicencas.length)} ${todasLicencas.length === 1 ? 'item' : 'itens'} · ${ordemDecrescente ? 'do mais recente para o mais antigo' : 'do mais antigo para o mais recente'}`}
          </p>
          {licencas.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={licencas.isFetchingNextPage}
              onClick={() => void licencas.fetchNextPage()}
            >
              Mostrar mais licenças
            </Botao>
          ) : null}
        </div>
      </section>

      <DialogoEmpreendimento
        aberto={editarAberto}
        aoMudar={setEditarAberto}
        consultoriaId={atual.consultoriaId}
        existente={dados}
        aoSalvar={() => {
          void queryClient.invalidateQueries({ queryKey: ['empreendimento', id] })
          void queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
        }}
      />
      <DialogoUnidades
        aberto={unidadesAberto}
        aoMudar={setUnidadesAberto}
        empreendimentoId={id}
        unidades={listaUnidades}
      />
    </div>
  )
}
