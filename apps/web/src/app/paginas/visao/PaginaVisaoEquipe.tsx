import { hojeNoFuso, situacaoDoPrazo } from '@gestao-ambiental/domain'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { SiglaEmpreendimento } from '@/app/paginas/empreendimentos/SiglaEmpreendimento'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import {
  TAMANHO_PAGINA_PRAZOS,
  atribuirOcorrencia,
  contarPrazos,
  listarPrazos,
  listarTiposEmUso,
  type Aba,
  type Faixa,
  type Filtros,
  type LinhaDePrazo,
  type Ordem,
} from '@/lib/api/prazos'
import { formatarDataCurta } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { SeloSituacaoPrazo } from './SeloSituacaoPrazo'

const SEM_RESPONSAVEL = '__sem'
const ATUALIZAR_A_CADA = 60_000

const classeSelect =
  'h-(--size-control) max-w-[220px] rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus)'
const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

const COLUNAS: { chave: Ordem; rotulo: string }[] = [
  { chave: 'prazo', rotulo: 'Prazo' },
  { chave: 'demanda', rotulo: 'Demanda' },
  { chave: 'empreendimento', rotulo: 'Empreendimento' },
  { chave: 'licenca', rotulo: 'Licença' },
  { chave: 'responsavel', rotulo: 'Responsável' },
]

function Demanda({ linha }: { linha: LinhaDePrazo }) {
  if (linha.tipo !== 'ocorrencia') {
    return (
      <span>
        <span className="corpo-medio">{linha.titulo}</span>
        {linha.licenca ? <span className="text-(--text-subtle)"> · {linha.licenca}</span> : null}
      </span>
    )
  }
  return (
    <span className="block max-w-[360px] truncate" title={linha.titulo}>
      {linha.codigo ? (
        <span className="font-mono text-xs text-(--text-subtle)">{linha.codigo} · </span>
      ) : null}
      {linha.titulo}
    </span>
  )
}

function Responsavel({
  linha,
  podeAtribuir,
  membros,
  aoAtribuir,
}: {
  linha: LinhaDePrazo
  podeAtribuir: boolean
  membros: readonly { id: string; nome: string }[]
  aoAtribuir: (membroId: string) => void
}) {
  if (linha.tipo !== 'ocorrencia') return <span className="text-(--text-subtle)">—</span>
  if (linha.responsavelNome) {
    return (
      <span className="flex items-center gap-(--space-100)">
        <Avatar nome={linha.responsavelNome} />
        <span className="truncate">{linha.responsavelNome}</span>
      </span>
    )
  }
  // "Sem responsável" não é segunda situação de atraso: é uma ação (EQ-03).
  if (!podeAtribuir) return <span className="text-(--text-subtle)">Sem responsável</span>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Botao
          tamanho="compacto"
          iconeAntes="plus"
          aria-label={`Atribuir ${linha.codigo ?? ''} ${linha.titulo}`}
        >
          Atribuir
        </Botao>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
        {membros.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => {
              aoAtribuir(m.id)
            }}
          >
            {m.nome}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Contador({
  rotulo,
  valor,
  ativo,
  perigo,
  aoClicar,
}: {
  rotulo: string
  valor: number
  ativo: boolean
  perigo?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={cn(
        'flex min-w-[150px] flex-1 cursor-pointer items-baseline gap-(--space-100) rounded-(--radius) border bg-(--surface) px-(--space-150) py-(--space-150) text-left transicao-estado hover:bg-(--surface-hover)',
        ativo && 'border-(--border-focus) bg-(--surface-selected)',
      )}
    >
      <span
        className={cn(
          'titulo-tela',
          perigo && valor > 0 ? 'text-(--text-danger)' : 'text-(--text)',
        )}
      >
        {valor}
      </span>
      <span className="corpo">{rotulo}</span>
    </button>
  )
}

/**
 * Página inicial (Protótipo 05, versão em tabela; EQ-01 a EQ-03): contadores que filtram, abas
 * "Toda a equipe" e "Minhas ações", filtros combinados e a tabela paginada no servidor, com a
 * situação calculada. Atualiza sozinha a cada minuto.
 */
export function PaginaVisaoEquipe() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ehGestao = atual.papel === 'gestao'
  const queryClient = useQueryClient()
  const [filtros, setFiltros] = useState<Filtros>({
    aba: 'todos',
    responsavelId: null,
    semResponsavel: false,
    tipoId: null,
    empreendimentoId: null,
  })
  const [faixa, setFaixa] = useState<Faixa | null>(null)
  const [ordem, setOrdem] = useState<Ordem>('prazo')
  const [pagina, setPagina] = useState(0)

  function mudarFiltros(parcial: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...parcial }))
    setPagina(0)
  }

  const linhas = useQuery({
    queryKey: ['prazos', cid, filtros, faixa, ordem, pagina],
    queryFn: () => listarPrazos(cid, filtros, faixa, ordem, pagina),
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZAR_A_CADA,
  })
  const contadores = useQuery({
    queryKey: ['prazos-contadores', cid, filtros],
    queryFn: () => contarPrazos(cid, filtros),
    refetchInterval: ATUALIZAR_A_CADA,
  })
  const totais = useQuery({
    queryKey: ['prazos-totais', cid],
    queryFn: async () => {
      const base: Filtros = {
        ...filtros,
        aba: 'todos',
        responsavelId: null,
        semResponsavel: false,
        tipoId: null,
        empreendimentoId: null,
      }
      const [todos, minhas] = await Promise.all([
        listarPrazos(cid, base, null, 'prazo', 0, 1),
        listarPrazos(cid, { ...base, aba: 'minhas' }, null, 'prazo', 0, 1),
      ])
      return { todos: todos.total, minhas: minhas.total }
    },
    refetchInterval: ATUALIZAR_A_CADA,
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
  })
  const tipos = useQuery({ queryKey: ['tipos-em-uso', cid], queryFn: () => listarTiposEmUso(cid) })
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', cid, '', 'filtro'],
    queryFn: () => listarEmpreendimentos(cid, '', 0),
  })

  const atribuir = useMutation({
    mutationFn: ({ linha, membroId }: { linha: LinhaDePrazo; membroId: string }) =>
      atribuirOcorrencia(linha.id, membroId, linha.rowVersion),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prazos'] })
      await queryClient.invalidateQueries({ queryKey: ['prazos-contadores'] })
    },
  })

  const filtrando =
    filtros.responsavelId !== null ||
    filtros.semResponsavel ||
    filtros.tipoId !== null ||
    filtros.empreendimentoId !== null ||
    faixa !== null
  function limpar() {
    mudarFiltros({
      responsavelId: null,
      semResponsavel: false,
      tipoId: null,
      empreendimentoId: null,
    })
    setFaixa(null)
  }
  function alternarFaixa(nova: Faixa) {
    setFaixa((atual) => (atual === nova ? null : nova))
    setPagina(0)
  }
  function ordenar(chave: Ordem) {
    setOrdem((atual) => (atual === chave ? (`-${chave}` as Ordem) : chave))
    setPagina(0)
  }

  const dados = linhas.data
  const itens = dados?.itens ?? []
  const total = dados?.total ?? 0
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const inicio = pagina * TAMANHO_PAGINA_PRAZOS
  const fim = Math.min(total, inicio + itens.length)
  const responsavelSelecionado = filtros.semResponsavel
    ? SEM_RESPONSAVEL
    : (filtros.responsavelId ?? '')

  let tabela
  if (linhas.isPending) {
    tabela = <Carregando rotulo="Carregando prazos" linhas={8} />
  } else if (linhas.isError) {
    tabela = (
      <EstadoErro
        titulo="Não foi possível carregar os prazos."
        aoTentarDeNovo={() => void linhas.refetch()}
      />
    )
  } else if (total === 0 && !filtrando && filtros.aba === 'todos') {
    tabela = (
      <EstadoVazio
        icone="list"
        titulo="Nenhum prazo para mostrar"
        descricao="Quando a consultoria tiver licenças com o plano ativado, os prazos da equipe aparecem aqui."
        acaoPrincipal={
          ehGestao ? (
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Ir para Empreendimentos</Link>
            </Botao>
          ) : undefined
        }
      />
    )
  } else if (total === 0) {
    tabela = (
      <EstadoVazio
        icone="search"
        titulo={
          filtros.aba === 'minhas' && !filtrando ? 'Nada com você agora' : 'Nada com estes filtros'
        }
        descricao={
          filtros.aba === 'minhas' && !filtrando
            ? 'Quando a gestão atribuir uma entrega a você, ela aparece aqui.'
            : 'Mude os filtros ou limpe para ver a equipe inteira.'
        }
        acaoPrincipal={filtrando ? <Botao onClick={limpar}>Limpar filtros</Botao> : undefined}
      />
    )
  } else {
    tabela = (
      <div className="flex flex-col overflow-hidden rounded-(--radius) border bg-(--surface)">
        <div className="hidden max-h-[calc(100dvh-340px)] min-h-[240px] overflow-auto md:block">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--surface)">
              <tr>
                {COLUNAS.map((coluna) => {
                  const ascendente = ordem === coluna.chave
                  const descendente = ordem === `-${coluna.chave}`
                  return (
                    <th
                      key={coluna.chave}
                      scope="col"
                      aria-sort={ascendente ? 'ascending' : descendente ? 'descending' : 'none'}
                      className="h-10 border-b px-(--space-100) text-left whitespace-nowrap first:pl-(--space-150)"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          ordenar(coluna.chave)
                        }}
                        className="inline-flex cursor-pointer items-center gap-(--space-050) rotulo"
                      >
                        {coluna.rotulo}
                        {ascendente || descendente ? (
                          <Icone nome={ascendente ? 'chevron-up' : 'chevron-down'} tamanho={12} />
                        ) : null}
                      </button>
                    </th>
                  )
                })}
                <th scope="col" className="h-10 border-b px-(--space-100) text-left rotulo">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((linha) => (
                <tr key={`${linha.tipo}:${linha.id}`}>
                  <td className={`${classeCelula} corpo-medio whitespace-nowrap`}>
                    {formatarDataCurta(linha.prazo, hoje)}
                  </td>
                  <td className={classeCelula}>
                    <Demanda linha={linha} />
                  </td>
                  <td className={classeCelula}>
                    <span className="flex items-center gap-(--space-100)">
                      <SiglaEmpreendimento nome={linha.empreendimentoNome} />
                      <Link
                        to={`/empreendimentos/${linha.empreendimentoId}`}
                        className="truncate text-(--text)"
                      >
                        {linha.empreendimentoNome}
                      </Link>
                    </span>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap text-(--text-subtle)`}>
                    {linha.licenca ?? '—'}
                  </td>
                  <td className={classeCelula}>
                    <Responsavel
                      linha={linha}
                      podeAtribuir={ehGestao}
                      membros={membros.data ?? []}
                      aoAtribuir={(membroId) => {
                        atribuir.mutate({ linha, membroId })
                      }}
                    />
                  </td>
                  <td className={classeCelula}>
                    <SeloSituacaoPrazo
                      situacao={situacaoDoPrazo({
                        tipo: linha.tipo,
                        dias: linha.dias,
                        emConferencia: linha.emConferencia,
                      })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col md:hidden" aria-label="Prazos">
          {itens.map((linha) => (
            <li
              key={`${linha.tipo}:${linha.id}`}
              className="flex flex-col gap-(--space-050) border-b px-(--space-150) py-(--space-100)"
            >
              <span className="flex items-center justify-between gap-(--space-100)">
                <span className="corpo-medio">{formatarDataCurta(linha.prazo, hoje)}</span>
                <SeloSituacaoPrazo
                  situacao={situacaoDoPrazo({
                    tipo: linha.tipo,
                    dias: linha.dias,
                    emConferencia: linha.emConferencia,
                  })}
                />
              </span>
              <Demanda linha={linha} />
              <span className="text-xs text-(--text-subtle)">
                {linha.empreendimentoNome}
                {linha.licenca ? ` · ${linha.licenca}` : ''}
              </span>
              <Responsavel
                linha={linha}
                podeAtribuir={ehGestao}
                membros={membros.data ?? []}
                aoAtribuir={(membroId) => {
                  atribuir.mutate({ linha, membroId })
                }}
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-(--space-100) border-t px-(--space-150) py-(--space-100)">
          <span className="flex-1 text-xs text-(--text-subtle)" aria-live="polite">
            {inicio + 1}–{fim} de {total}
          </span>
          <BotaoIcone
            icone="chevron-left"
            rotulo="Página anterior"
            disabled={pagina === 0}
            onClick={() => {
              setPagina((p) => Math.max(0, p - 1))
            }}
          />
          <BotaoIcone
            icone="chevron-right"
            rotulo="Próxima página"
            disabled={fim >= total}
            onClick={() => {
              setPagina((p) => p + 1)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-200)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Pagina titulo="Visão da equipe">{null}</Pagina>
        {ehGestao ? (
          <Botao aparencia="primario" asChild>
            <Link to="/licencas/nova">
              <Icone nome="plus" />
              Cadastrar licença
            </Link>
          </Botao>
        ) : null}
      </div>

      {/* Sem contadores quando não carregaram: zero não substitui dado ausente (Protótipo 05). */}
      {contadores.isSuccess ? (
        <div role="group" aria-label="Contadores" className="flex flex-wrap gap-(--space-100)">
          <Contador
            rotulo="Atrasadas"
            valor={contadores.data.atrasadas}
            perigo
            ativo={faixa === 'atrasadas'}
            aoClicar={() => {
              alternarFaixa('atrasadas')
            }}
          />
          <Contador
            rotulo="Vencem hoje"
            valor={contadores.data.hoje}
            ativo={faixa === 'hoje'}
            aoClicar={() => {
              alternarFaixa('hoje')
            }}
          />
          <Contador
            rotulo="Próximos 7 dias"
            valor={contadores.data.proximos7}
            ativo={faixa === 'proximos_7'}
            aoClicar={() => {
              alternarFaixa('proximos_7')
            }}
          />
          {ehGestao ? (
            <Contador
              rotulo="Sem responsável"
              valor={contadores.data.semResponsavel}
              ativo={faixa === 'sem_responsavel'}
              aoClicar={() => {
                alternarFaixa('sem_responsavel')
              }}
            />
          ) : null}
        </div>
      ) : null}

      {atribuir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(atribuir.error)}
        </MensagemSecao>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-(--space-150) border-b">
        <div role="tablist" aria-label="Recorte" className="flex gap-(--space-200)">
          {(
            [
              ['todos', 'Toda a equipe'],
              ['minhas', 'Minhas ações'],
            ] as [Aba, string][]
          ).map(([aba, rotulo]) => {
            const ativa = filtros.aba === aba
            const contagem = totais.data
              ? aba === 'todos'
                ? totais.data.todos
                : totais.data.minhas
              : null
            return (
              <button
                key={aba}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => {
                  mudarFiltros({ aba })
                }}
                className={cn(
                  '-mb-px inline-flex cursor-pointer items-center gap-(--space-075) border-b-2 pb-(--space-100) transicao-estado',
                  ativa
                    ? 'border-(--brand) corpo-medio text-(--text-link)'
                    : 'border-transparent corpo text-(--text-subtle)',
                )}
              >
                {rotulo}
                {contagem === null ? null : (
                  <span className="rounded-(--radius) bg-(--neutral-subtle-hover) px-1.5 text-xs">
                    {contagem}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-(--space-100) pb-(--space-100)">
          <label>
            <span className="sr-only">Responsável</span>
            <select
              className={classeSelect}
              value={responsavelSelecionado}
              onChange={(evento) => {
                const valor = evento.target.value
                mudarFiltros({
                  semResponsavel: valor === SEM_RESPONSAVEL,
                  responsavelId: valor && valor !== SEM_RESPONSAVEL ? valor : null,
                })
              }}
            >
              <option value="">Todos os responsáveis</option>
              <option value={SEM_RESPONSAVEL}>Sem responsável</option>
              {(membros.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Tipo de instrumento</span>
            <select
              className={classeSelect}
              value={filtros.tipoId ?? ''}
              onChange={(evento) => {
                mudarFiltros({ tipoId: evento.target.value || null })
              }}
            >
              <option value="">Todos os tipos</option>
              {(tipos.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.sigla}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Empreendimento</span>
            <select
              className={classeSelect}
              value={filtros.empreendimentoId ?? ''}
              onChange={(evento) => {
                mudarFiltros({ empreendimentoId: evento.target.value || null })
              }}
            >
              <option value="">Todos os empreendimentos</option>
              {(empreendimentos.data?.itens ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <Botao aparencia="sutil" disabled={!filtrando} onClick={limpar}>
            Limpar filtros
          </Botao>
        </div>
      </div>

      <div role="tabpanel" aria-label={filtros.aba === 'todos' ? 'Toda a equipe' : 'Minhas ações'}>
        {tabela}
      </div>
    </div>
  )
}
