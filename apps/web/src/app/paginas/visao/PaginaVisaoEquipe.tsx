import { hojeNoFuso, situacaoDoPrazo } from '@gestao-ambiental/domain'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { ProximosPrazosDeResiduos } from '@/app/paginas/residuos/prazos/ProximosPrazosDeResiduos'
import { TarefasNaVisao } from '@/app/paginas/tarefas/TarefasNaVisao'
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
import { classeSelecao } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
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

import { Contagem } from './Contagem'
import { SeloSituacaoPrazo } from './SeloSituacaoPrazo'

const SEM_RESPONSAVEL = '__sem'
const ATUALIZAR_A_CADA = 60_000

const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

const COLUNAS: { chave: Ordem; rotulo: string }[] = [
  { chave: 'prazo', rotulo: 'Prazo' },
  { chave: 'demanda', rotulo: 'Demanda' },
  { chave: 'empreendimento', rotulo: 'Empreendimento' },
  { chave: 'licenca', rotulo: 'Licença' },
  { chave: 'responsavel', rotulo: 'Responsável' },
]

function Demanda({ linha }: { linha: LinhaDePrazo }) {
  if (linha.tipo === 'limite_protocolo') {
    return (
      <Link to={`/renovacoes/${linha.instrumentoId}`} className="text-(--tinta) hover:underline">
        <span className="corpo-medio">{linha.titulo}</span>
        {linha.licenca ? <span className="text-(--tinta-2)"> · {linha.licenca}</span> : null}
      </Link>
    )
  }
  if (linha.tipo !== 'ocorrencia') {
    return (
      <span>
        <span className="corpo-medio">{linha.titulo}</span>
        {linha.licenca ? <span className="text-(--tinta-2)"> · {linha.licenca}</span> : null}
      </span>
    )
  }
  return (
    <Link
      to={`/ocorrencias/${linha.id}`}
      className="block max-w-[360px] truncate text-(--tinta) hover:underline"
      title={linha.titulo}
    >
      {linha.codigo ? (
        <span className="font-mono text-xs text-(--tinta-2)">{linha.codigo} · </span>
      ) : null}
      {linha.titulo}
    </Link>
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
  if (linha.tipo !== 'ocorrencia') return <span className="text-(--tinta-2)">—</span>
  if (linha.responsavelNome) {
    return (
      <span className="flex items-center gap-(--e-2)">
        <Avatar nome={linha.responsavelNome} />
        <span className="truncate">{linha.responsavelNome}</span>
      </span>
    )
  }
  // "Sem responsável" não é segunda situação de atraso: é uma ação (EQ-03).
  if (!podeAtribuir) return <span className="text-(--tinta-2)">Sem responsável</span>
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
      <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <div className="hidden max-h-[calc(100dvh-340px)] min-h-[240px] overflow-auto md:block">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th
                  scope="col"
                  className="h-10 w-[88px] border-b px-(--e-3) text-left rotulo-maiusculo text-(--tinta-2)"
                >
                  Faltam
                </th>
                {COLUNAS.map((coluna) => {
                  const ascendente = ordem === coluna.chave
                  const descendente = ordem === `-${coluna.chave}`
                  return (
                    <th
                      key={coluna.chave}
                      scope="col"
                      aria-sort={ascendente ? 'ascending' : descendente ? 'descending' : 'none'}
                      className={cn(
                        'h-10 border-b px-(--e-3) text-left whitespace-nowrap',
                        coluna.chave === 'licenca' && 'hidden 2xl:table-cell',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          ordenar(coluna.chave)
                        }}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-(--e-1) rounded-(--raio-mini) rotulo-maiusculo hover:text-(--tinta)',
                          ascendente || descendente ? 'text-(--tinta)' : 'text-(--tinta-2)',
                        )}
                      >
                        {coluna.rotulo}
                        {ascendente || descendente ? (
                          <Icone nome={ascendente ? 'chevron-up' : 'chevron-down'} tamanho={12} />
                        ) : null}
                      </button>
                    </th>
                  )
                })}
                <th
                  scope="col"
                  className="h-10 border-b px-(--e-3) text-left rotulo-maiusculo text-(--tinta-2)"
                >
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((linha, indice) => (
                <tr
                  key={`${linha.tipo}:${linha.id}`}
                  className={cn(
                    'transicao-estado hover:bg-(--toque)',
                    linha.dias === 0 && 'pulso bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
                  )}
                >
                  <td className={classeCelula}>
                    <Contagem dias={linha.dias} ordem={indice} />
                  </td>
                  <td className={`${classeCelula} corpo-medio whitespace-nowrap numero`}>
                    {formatarDataCurta(linha.prazo, hoje)}
                  </td>
                  <td className={classeCelula}>
                    <Demanda linha={linha} />
                  </td>
                  <td className={classeCelula}>
                    <span className="flex items-center gap-(--e-2)">
                      <Link
                        to={`/empreendimentos/${linha.empreendimentoId}`}
                        className="truncate text-(--tinta)"
                      >
                        {linha.empreendimentoNome}
                      </Link>
                    </span>
                  </td>
                  <td
                    className={`${classeCelula} hidden whitespace-nowrap text-(--tinta-2) numero 2xl:table-cell`}
                  >
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
          {itens.map((linha, indice) => (
            <li
              key={`${linha.tipo}:${linha.id}`}
              className={cn(
                'flex gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3)',
                linha.dias === 0 && 'pulso bg-(--sinal-fundo)',
              )}
            >
              <Contagem dias={linha.dias} ordem={indice} />
              <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                <span className="flex flex-wrap items-center justify-between gap-x-(--e-2) gap-y-(--e-1)">
                  <span className="corpo-medio numero">{formatarDataCurta(linha.prazo, hoje)}</span>
                  <SeloSituacaoPrazo
                    situacao={situacaoDoPrazo({
                      tipo: linha.tipo,
                      dias: linha.dias,
                      emConferencia: linha.emConferencia,
                    })}
                  />
                </span>
                <Demanda linha={linha} />
                <span className="truncate text-xs text-(--tinta-2)">
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
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
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
    <Pagina
      titulo="Visão da equipe"
      acao={
        ehGestao ? (
          <Botao aparencia="primario" asChild>
            <Link to="/licencas/nova">
              <Icone nome="plus" />
              Cadastrar licença
            </Link>
          </Botao>
        ) : null
      }
    >
      {/* Sem contadores quando não carregaram: zero não substitui dado ausente (Protótipo 05). */}
      {contadores.isSuccess ? (
        <Placar rotulo="Contadores">
          <ItemDoPlacar
            rotulo="Atrasadas"
            valor={contadores.data.atrasadas}
            tom="atraso"
            ativo={faixa === 'atrasadas'}
            aoClicar={() => {
              alternarFaixa('atrasadas')
            }}
          />
          <ItemDoPlacar
            rotulo="Vencem hoje"
            valor={contadores.data.hoje}
            tom="hoje"
            ativo={faixa === 'hoje'}
            aoClicar={() => {
              alternarFaixa('hoje')
            }}
          />
          <ItemDoPlacar
            rotulo="Próximos 7 dias"
            valor={contadores.data.proximos7}
            ativo={faixa === 'proximos_7'}
            aoClicar={() => {
              alternarFaixa('proximos_7')
            }}
          />
          {ehGestao ? (
            <ItemDoPlacar
              rotulo="Sem responsável"
              valor={contadores.data.semResponsavel}
              ativo={faixa === 'sem_responsavel'}
              aoClicar={() => {
                alternarFaixa('sem_responsavel')
              }}
            />
          ) : null}
        </Placar>
      ) : null}

      {atribuir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(atribuir.error)}
        </MensagemSecao>
      ) : null}

      <div className="flex flex-col gap-(--e-3)">
        <div className="flex flex-wrap items-end justify-between gap-(--e-3) border-b border-(--regra-forte)">
          <div role="tablist" aria-label="Recorte" className="flex gap-(--e-5)">
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
                    '-mb-px inline-flex h-11 cursor-pointer items-center gap-(--e-2) border-b-[3px] titulo-secao transicao-estado',
                    ativa
                      ? 'border-(--marca-linha) text-(--tinta)'
                      : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
                  )}
                >
                  {rotulo}
                  {contagem === null ? null : (
                    <span
                      className={cn(
                        'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                        ativa ? 'bg-(--tinta) text-(--folha)' : 'bg-(--aperto) text-(--tinta-2)',
                      )}
                    >
                      {contagem}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div className="-mx-(--e-4) flex items-center gap-(--e-2) overflow-x-auto px-(--e-4) pb-(--e-05) md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <label>
            <span className="sr-only">Responsável</span>
            <select
              className={classeSelecao}
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
              className={classeSelecao}
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
              className={classeSelecao}
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

        <div
          role="tabpanel"
          aria-label={filtros.aba === 'todos' ? 'Toda a equipe' : 'Minhas ações'}
        >
          {tabela}
        </div>
      </div>

      <TarefasNaVisao aba={filtros.aba} />

      <ProximosPrazosDeResiduos limite={5} ocultarSeVazio />
    </Pagina>
  )
}
