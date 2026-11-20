import { formatarCentavos } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { AvisoOrcamentosForaDoPlano } from '@/app/plano/AvisoOrcamentosForaDoPlano'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_DA_SITUACAO,
  TAMANHO_PAGINA_ORCAMENTOS,
  contarOrcamentosPorSituacao,
  excluirOrcamento,
  listarOrcamentos,
  obterResumoDosOrcamentos,
  restaurarOrcamento,
  situacaoOuNula,
  type OrcamentoNaLista,
  type SituacaoOrcamento,
} from '@/lib/api/orcamentos'
import { obterConfiguracao } from '@/lib/api/primeiros-passos'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCabecalho, classeCelula, numeroComRevisao } from './comum'
import { AbasDeSituacao, IndicadoresDosOrcamentos } from './PecasDaLista'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'
import { DialogoNovoOrcamento } from './DialogoNovoOrcamento'

/**
 * /orcamentos (onda 5; ORC-04). Lista paginada com busca. Nesta fatia o módulo é só da Gestão:
 * custo e margem são dados restritos (RNF). A Equipe vê "sem permissão"; o banco recusaria.
 *
 * Lixeira (12/11/2026): excluir manda para a lixeira (exclusão lógica), menos o aprovado; na
 * lixeira dá para restaurar. ?lixeira=1 na URL mostra a lixeira.
 *
 * Primeiros passos (ADR-0020, ADR-0023): sem base publicada, só um link discreto "Calcular preço
 * pelos custos". O orçamento rápido (preço digitado) não depende dela. ?novo=1 abre o diálogo de
 * novo orçamento (fim dos primeiros passos).
 *
 * Filtros (Protótipo 19): abas por situação com a contagem de cada uma (seguem a busca), a aba em
 * ?situacao=…, busca também pelo número e indicadores do topo vindos do banco (resumo_dos_orcamentos).
 * Na lixeira, só a busca.
 */
export function PaginaOrcamentos() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Orçamentos">
        <SemPermissao descricao="Orçamentos têm custo e margem: por enquanto, só a gestão acessa." />
      </Pagina>
    )
  }
  return <ListaDaGestao />
}

function ListaDaGestao() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [parametros, setParametros] = useSearchParams()
  const lixeira = parametros.get('lixeira') === '1'
  const situacao = lixeira ? null : situacaoOuNula(parametros.get('situacao'))
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const campoBusca = useRef<HTMLInputElement>(null)
  const [novoAberto, setNovoAberto] = useState(() => parametros.get('novo') === '1')
  const [aExcluir, setAExcluir] = useState<OrcamentoNaLista | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const consulta = useInfiniteQuery({
    queryKey: ['orcamentos', cid, buscaAdiada, lixeira, situacao],
    queryFn: ({ pageParam }) => listarOrcamentos(cid, buscaAdiada, pageParam, lixeira, situacao),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_ORCAMENTOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    placeholderData: (anterior) => anterior,
  })

  // Contagem das abas (segue a busca) e indicadores do topo. Fora da lixeira; o prefixo
  // ['orcamentos', cid] faz excluir e restaurar recarregarem os dois.
  const contagem = useQuery({
    queryKey: ['orcamentos', cid, 'contagem', buscaAdiada],
    queryFn: () => contarOrcamentosPorSituacao(cid, buscaAdiada),
    enabled: !lixeira,
    placeholderData: (anterior) => anterior,
  })
  const resumo = useQuery({
    queryKey: ['orcamentos', cid, 'resumo'],
    queryFn: () => obterResumoDosOrcamentos(cid),
    enabled: !lixeira,
  })

  // Link para os primeiros passos enquanto a base não foi publicada. Se a leitura falhar,
  // simplesmente não aparece (não bloqueia).
  const configuracao = useQuery({
    queryKey: ['configuracao-orcamento', cid],
    queryFn: () => obterConfiguracao(cid),
  })
  const semConfiguracao = configuracao.data ? !configuracao.data.baseConfigurada : false

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const filtrando = buscaAdiada !== '' || situacao !== null
  const comFiltro = busca.trim() !== '' || situacao !== null
  // Primeiro uso (nenhum orçamento, sem filtro): só o estado vazio, sem indicadores nem abas.
  const semNenhum = consulta.isSuccess && itens.length === 0 && !filtrando

  function escolherSituacao(nova: SituacaoOrcamento | null) {
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        if (nova) novos.set('situacao', nova)
        else novos.delete('situacao')
        return novos
      },
      { replace: true },
    )
  }

  /** Zera busca e aba; o foco vai para a busca (o botão some). */
  function limparFiltros() {
    setBusca('')
    escolherSituacao(null)
    campoBusca.current?.focus()
  }

  const botaoLimpar = (
    <Botao aparencia="sutil" iconeAntes="x" onClick={limparFiltros}>
      Limpar filtros
    </Botao>
  )

  function verLixeira(sim: boolean) {
    setFalha(null)
    setAviso(null)
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        if (sim) novos.set('lixeira', '1')
        else novos.delete('lixeira')
        return novos
      },
      { replace: false },
    )
  }

  async function confirmarExclusao() {
    if (!aExcluir) return
    setOcupado(true)
    setFalha(null)
    try {
      await excluirOrcamento(aExcluir.id, aExcluir.rowVersion)
      setAviso(
        `${numeroComRevisao(aExcluir.ano, aExcluir.sequencia, aExcluir.revisao)} foi para a lixeira.`,
      )
      setAExcluir(null)
      await queryClient.invalidateQueries({ queryKey: ['orcamentos', cid] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      setAExcluir(null)
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar(item: OrcamentoNaLista) {
    setOcupado(true)
    setFalha(null)
    try {
      await restaurarOrcamento(item.id, item.rowVersion)
      setAviso(
        `${numeroComRevisao(item.ano, item.sequencia, item.revisao)} voltou para a lista de orçamentos.`,
      )
      await queryClient.invalidateQueries({ queryKey: ['orcamentos', cid] })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setOcupado(false)
    }
  }

  const botaoNovo = (
    <Botao
      aparencia="primario"
      iconeAntes="plus"
      onClick={() => {
        setNovoAberto(true)
      }}
    >
      Novo orçamento
    </Botao>
  )

  /** Ações da linha: na lista, ver a proposta e excluir; na lixeira, restaurar. */
  function acoes(item: OrcamentoNaLista) {
    const numero = numeroComRevisao(item.ano, item.sequencia, item.revisao)
    if (lixeira) {
      return (
        <Botao
          tamanho="compacto"
          aria-label={`Restaurar ${numero}`}
          disabled={ocupado}
          onClick={(evento) => {
            evento.stopPropagation()
            void restaurar(item)
          }}
        >
          Restaurar
        </Botao>
      )
    }
    return (
      <span className="inline-flex items-center gap-(--e-1)">
        <BotaoIcone
          icone="eye"
          rotulo={`Ver proposta ${numero}`}
          onClick={(evento) => {
            evento.stopPropagation()
            void navegar(`/orcamentos/${item.id}/proposta`)
          }}
        />
        {item.situacao === 'aprovada' ? null : (
          <BotaoIcone
            icone="trash-2"
            rotulo={`Excluir orçamento ${numero}`}
            disabled={ocupado}
            onClick={(evento) => {
              evento.stopPropagation()
              setAviso(null)
              setAExcluir(item)
            }}
          />
        )}
      </span>
    )
  }

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando orçamentos" linhas={5} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar os orçamentos."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0 && !filtrando && lixeira) {
    conteudo = (
      <EstadoVazio
        icone="trash-2"
        titulo="A lixeira está vazia"
        descricao="Orçamentos excluídos aparecem aqui e podem ser restaurados."
      />
    )
  } else if (itens.length === 0 && !filtrando) {
    conteudo = (
      <EstadoVazio
        icone="file-text"
        titulo="Nenhum orçamento ainda"
        descricao="Configure custos e taxas para ter preço sugerido, depois crie o primeiro."
        acaoPrincipal={botaoNovo}
      />
    )
  } else if (itens.length === 0) {
    const naAba = situacao ? ` em “${ROTULO_DA_SITUACAO[situacao]}”` : ''
    conteudo = (
      <EstadoVazio
        icone="search"
        titulo="Nenhum orçamento encontrado"
        descricao={
          buscaAdiada
            ? `Nada com “${buscaAdiada}”${naAba}. Busque pelo empreendimento, objeto ou número.`
            : `Nenhum orçamento${naAba}.`
        }
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--e-2)">
        <div className="hidden overflow-x-auto rounded-(--raio-painel) border bg-(--folha) shadow-cartao md:block">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Empreendimento
                </th>
                <th scope="col" className={classeCabecalho}>
                  Número
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Valor (R$)
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  {lixeira ? 'Excluído em' : 'Atualizado'}
                </th>
                <th scope="col" className={`${classeCabecalho} w-28 text-right`}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transicao-estado hover:bg-(--toque)"
                  onClick={() => {
                    void navegar(`/orcamentos/${item.id}`)
                  }}
                >
                  <td className={classeCelula}>
                    <Link
                      to={`/orcamentos/${item.id}`}
                      className="corpo-medio text-(--tinta) hover:text-(--tinta)"
                      onClick={(evento) => {
                        evento.stopPropagation()
                      }}
                    >
                      {item.empreendimentoNome}
                    </Link>
                    {item.deProspecto ? (
                      <Selo tom="revisao" className="ml-(--e-2) align-middle">
                        Prospecto
                      </Selo>
                    ) : null}
                    <span className="block text-xs text-(--tinta-2)">{item.objeto}</span>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap tabular-nums`}>
                    {numeroComRevisao(item.ano, item.sequencia, item.revisao)}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {item.totalCentavos === null ? (
                      <span className="text-(--tinta-2)">pendente</span>
                    ) : (
                      formatarCentavos(item.totalCentavos)
                    )}
                  </td>
                  <td className={classeCelula}>
                    <SeloSituacaoOrcamento situacao={item.situacao} />
                  </td>
                  <td className={`${classeCelula} text-right text-(--tinta-2)`}>
                    {formatarInstanteComoData(
                      lixeira && item.excluidoEm ? item.excluidoEm : item.atualizadoEm,
                      atual.fuso,
                    )}
                  </td>
                  <td className={`${classeCelula} text-right`}>{acoes(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-(--e-3) py-(--e-2) text-xs text-(--tinta-2)">
            {lixeira
              ? `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'} na lixeira`
              : `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'}`}
          </p>
        </div>

        <ul className="flex flex-col gap-(--e-2) md:hidden" aria-label="Orçamentos">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex flex-col rounded-(--raio-painel) border bg-(--folha) shadow-cartao"
            >
              <Link
                to={`/orcamentos/${item.id}`}
                className="flex flex-col gap-(--e-1) rounded-t-(--raio-painel) p-(--e-3) text-(--tinta) no-underline hover:bg-(--toque) hover:text-(--tinta) hover:no-underline"
              >
                <span className="flex items-center justify-between gap-(--e-2)">
                  <SeloSituacaoOrcamento situacao={item.situacao} />
                  <Icone nome="chevron-right" className="text-(--icone)" />
                </span>
                <span className="flex min-w-0 items-center gap-(--e-2)">
                  <span className="truncate corpo-medio">{item.empreendimentoNome}</span>
                  {item.deProspecto ? <Selo tom="revisao">Prospecto</Selo> : null}
                </span>
                <span className="text-xs text-(--tinta-2)">
                  {item.objeto} ·{' '}
                  {item.totalCentavos === null
                    ? 'preço pendente'
                    : `R$ ${formatarCentavos(item.totalCentavos)}`}
                </span>
              </Link>
              <div className="flex justify-end border-t px-(--e-2) py-(--e-1)">{acoes(item)}</div>
            </li>
          ))}
        </ul>

        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais orçamentos
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-4)">
      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <Pagina titulo={lixeira ? 'Lixeira de orçamentos' : 'Orçamentos'}>{null}</Pagina>
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <label className="relative flex items-center">
            <span className="sr-only">Buscar orçamentos</span>
            <Icone
              nome="search"
              className="pointer-events-none absolute left-(--e-2) text-(--icone-2)"
            />
            <input
              ref={campoBusca}
              type="search"
              value={busca}
              placeholder="Buscar nome, objeto ou número"
              onChange={(evento) => {
                setBusca(evento.target.value)
              }}
              className="h-(--controle) w-[280px] max-w-full rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) pr-(--e-2) pl-(--e-8) corpo text-(--tinta) outline-none transicao-estado focus:border-b-(--campo-borda-ativa) focus:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)] focus:bg-(--campo-foco)"
            />
          </label>
          {lixeira ? (
            <Botao
              iconeAntes="arrow-left"
              onClick={() => {
                verLixeira(false)
              }}
            >
              Voltar aos orçamentos
            </Botao>
          ) : (
            <>
              <Botao
                aparencia="sutil"
                iconeAntes="trash-2"
                onClick={() => {
                  verLixeira(true)
                }}
              >
                Lixeira
              </Botao>
              <Link
                to="/orcamentos/primeiros-passos"
                className="corpo-medio text-(--link) no-underline hover:underline"
              >
                Primeiros passos
              </Link>
              <Link
                to="/configuracoes/custos"
                className="corpo-medio text-(--link) no-underline hover:underline"
              >
                Custos e taxas
              </Link>
              <Link
                to="/configuracoes/proposta"
                className="corpo-medio text-(--link) no-underline hover:underline"
              >
                Dados da proposta
              </Link>
              {botaoNovo}
            </>
          )}
        </div>
      </div>
      <AvisoOrcamentosForaDoPlano />

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}

      {!lixeira && semConfiguracao ? (
        <Link
          to="/orcamentos/primeiros-passos"
          className="inline-flex items-center gap-(--e-1) self-start corpo-medio text-(--link) no-underline hover:underline"
        >
          Calcular preço pelos custos
          <Icone nome="arrow-right" />
        </Link>
      ) : null}

      {lixeira || semNenhum ? null : (
        <>
          <IndicadoresDosOrcamentos
            resumo={resumo.data}
            carregando={resumo.isPending}
            falhou={resumo.isError}
            aoTentarDeNovo={() => void resumo.refetch()}
          />
          <div className="flex flex-wrap items-end justify-between gap-(--e-2)">
            <AbasDeSituacao
              situacao={situacao}
              contagem={contagem.data}
              aoEscolher={escolherSituacao}
            />
            {comFiltro ? botaoLimpar : null}
          </div>
        </>
      )}

      {conteudo}

      <DialogoNovoOrcamento
        aberto={novoAberto}
        aoMudar={(aberto) => {
          setNovoAberto(aberto)
          // O ?novo=1 dos primeiros passos sai da URL ao fechar, para não reabrir ao voltar.
          if (!aberto && parametros.has('novo')) {
            setParametros(
              (atuais) => {
                const novos = new URLSearchParams(atuais)
                novos.delete('novo')
                return novos
              },
              { replace: true },
            )
          }
        }}
        consultoriaId={cid}
        aoCriar={(id) => {
          void navegar(`/orcamentos/${id}`)
        }}
      />

      <Dialogo
        aberto={aExcluir !== null}
        aoMudar={(aberto) => {
          if (!aberto) setAExcluir(null)
        }}
        titulo="Excluir orçamento?"
        descricao={
          aExcluir
            ? `${numeroComRevisao(aExcluir.ano, aExcluir.sequencia, aExcluir.revisao)} · ${aExcluir.empreendimentoNome} vai para a lixeira. Dá para restaurar depois.`
            : null
        }
        acoes={
          <>
            <Botao
              onClick={() => {
                setAExcluir(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={ocupado}
              aria-busy={ocupado || undefined}
              onClick={() => void confirmarExclusao()}
            >
              {ocupado ? 'Excluindo…' : 'Excluir'}
            </Botao>
          </>
        }
      />
    </div>
  )
}
