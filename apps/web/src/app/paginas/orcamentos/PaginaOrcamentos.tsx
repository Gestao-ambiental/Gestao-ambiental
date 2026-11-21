import { formatarCentavos } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { AvisoOrcamentosForaDoPlano } from '@/app/plano/AvisoOrcamentosForaDoPlano'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { BotaoMais } from '@/components/ui/botao-mais'
import { Dialogo } from '@/components/ui/dialogo'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
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
import { obterAReceber } from '@/lib/api/execucao'
import { obterConfiguracao } from '@/lib/api/primeiros-passos'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCabecalho, classeCelula, numeroComRevisao } from './comum'
import { AbasDeSituacao, IndicadoresDosOrcamentos } from './PecasDaLista'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'

/**
 * /orcamentos (onda 5; ORC-04). Lista paginada com busca. Nesta fatia o módulo é só da Gestão:
 * custo e margem são dados restritos (RNF). A Equipe vê "sem permissão"; o banco recusaria.
 *
 * Lixeira (12/11/2026): excluir manda para a lixeira (exclusão lógica), menos o aprovado; na
 * lixeira dá para restaurar. ?lixeira=1 na URL mostra a lixeira.
 *
 * Primeiros passos (ADR-0020, ADR-0023): sem base publicada, só um link discreto "Calcular preço
 * pelos custos". O orçamento rápido (preço digitado) não depende dela. Novo orçamento vai direto
 * para o editor (/orcamentos/novo); o antigo ?novo=1 leva para lá.
 *
 * Filtros (Protótipo 19): abas por situação com a contagem de cada uma (seguem a busca), a aba em
 * ?situacao=…, busca também pelo número e indicadores do topo vindos do banco (resumo_dos_orcamentos).
 * Na lixeira, só a busca.
 */
export function PaginaOrcamentos() {
  const { atual } = useConsultoria()
  const [parametros] = useSearchParams()
  // Links antigos (?novo=1) abriam o diálogo; agora vão para o editor do orçamento novo.
  if (parametros.get('novo') === '1') return <Navigate to="/orcamentos/novo" replace />
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
  // "A receber" (P7): só volta para quem tem a permissão financeira; sem ela, não aparece.
  const aReceber = useQuery({
    queryKey: ['a-receber', cid],
    queryFn: () => obterAReceber(cid),
    enabled: !lixeira,
    retry: false,
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
        void navegar('/orcamentos/novo')
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
      <span className="inline-flex items-center gap-(--e-05)">
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

  /** Celular: as ações da linha num menu "…" (um alvo só, ao lado do valor). */
  function menuDaLinha(item: OrcamentoNaLista) {
    const numero = numeroComRevisao(item.ano, item.sequencia, item.revisao)
    if (lixeira) return acoes(item)
    return (
      <BotaoMais
        de={numero}
        itens={[
          {
            rotulo: 'Ver proposta',
            icone: 'eye',
            aoEscolher: () => {
              void navegar(`/orcamentos/${item.id}/proposta`)
            },
          },
          {
            rotulo: 'Excluir',
            icone: 'trash-2',
            perigo: true,
            oculto: item.situacao === 'aprovada',
            desabilitado: ocupado,
            aoEscolher: () => {
              setAviso(null)
              setAExcluir(item)
            },
          },
        ]}
      />
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
      <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <div className="hidden max-h-[calc(100dvh-300px)] overflow-auto md:block">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Número
                </th>
                <th scope="col" className={classeCabecalho}>
                  Empreendimento
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Valor (R$)
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  {lixeira ? 'Excluído em' : 'Atualizado'}
                </th>
                <th scope="col" className={`${classeCabecalho} w-24 text-right`}>
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
                  <td className={`${classeCelula} whitespace-nowrap corpo-medio numero`}>
                    {numeroComRevisao(item.ano, item.sequencia, item.revisao)}
                  </td>
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
                    <span className="block text-xs text-(--tinta-2)">
                      {item.deProspecto ? (
                        <>
                          <span className="corpo-medio">Prospecto</span> ·{' '}
                        </>
                      ) : null}
                      {item.objeto}
                    </span>
                  </td>
                  <td className={classeCelula}>
                    <SeloSituacaoOrcamento situacao={item.situacao} />
                  </td>
                  <td
                    className={`${classeCelula} text-right text-lg font-[750] whitespace-nowrap numero`}
                  >
                    {item.totalCentavos === null ? (
                      <span className="corpo text-(--tinta-3)">pendente</span>
                    ) : (
                      formatarCentavos(item.totalCentavos)
                    )}
                  </td>
                  <td
                    className={`${classeCelula} text-right whitespace-nowrap text-(--tinta-2) numero`}
                  >
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
        </div>

        <ul className="flex flex-col md:hidden" aria-label="Orçamentos">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-(--e-1) border-b border-(--regra-leve) pr-(--e-1)"
            >
              <Link
                to={`/orcamentos/${item.id}`}
                className="flex min-w-0 flex-1 items-start justify-between gap-(--e-3) py-(--e-3) pl-(--e-4) text-(--tinta) no-underline hover:text-(--tinta) hover:no-underline"
              >
                <span className="flex min-w-0 flex-col gap-(--e-05)">
                  <span className="truncate corpo-medio">{item.empreendimentoNome}</span>
                  <span className="truncate text-xs text-(--tinta-2)">
                    {item.deProspecto ? (
                      <>
                        <span className="corpo-medio">Prospecto</span> ·{' '}
                      </>
                    ) : null}
                    {item.objeto}
                  </span>
                  <span className="text-xs text-(--tinta-2) numero">
                    {numeroComRevisao(item.ano, item.sequencia, item.revisao)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-(--e-05)">
                  <span className="text-lg font-[750] whitespace-nowrap numero">
                    {item.totalCentavos === null ? (
                      <span className="corpo text-(--tinta-3)">preço pendente</span>
                    ) : (
                      <>
                        <span className="text-xs font-[650] text-(--tinta-2)">R$ </span>
                        {formatarCentavos(item.totalCentavos)}
                      </>
                    )}
                  </span>
                  <SeloSituacaoOrcamento situacao={item.situacao} />
                </span>
              </Link>
              {menuDaLinha(item)}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-(--e-2) px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {lixeira
              ? `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'} na lixeira`
              : `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'}`}
          </span>
          {consulta.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais orçamentos
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  const campoDeBusca = (
    <label className="relative flex w-full items-center md:w-[320px]">
      <span className="sr-only">Buscar orçamentos</span>
      <Icone nome="search" className="pointer-events-none absolute left-(--e-3) text-(--icone-2)" />
      <input
        ref={campoBusca}
        type="search"
        value={busca}
        placeholder="Buscar nome, objeto ou número"
        onChange={(evento) => {
          setBusca(evento.target.value)
        }}
        className={`${classeCampo} pl-(--e-10)`}
      />
    </label>
  )

  return (
    <Pagina
      titulo={lixeira ? 'Lixeira de orçamentos' : 'Orçamentos'}
      voltar={lixeira ? { para: '/orcamentos', rotulo: 'Orçamentos' } : undefined}
      acao={
        lixeira ? null : (
          <>
            <BotaoMais
              itens={[
                {
                  rotulo: 'Lixeira',
                  icone: 'trash-2',
                  aoEscolher: () => {
                    verLixeira(true)
                  },
                },
                {
                  rotulo: 'Primeiros passos',
                  para: '/orcamentos/primeiros-passos',
                  separadoAntes: true,
                },
              ]}
            />
            {botaoNovo}
          </>
        )
      }
    >
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
        <IndicadoresDosOrcamentos
          resumo={resumo.data}
          carregando={resumo.isPending}
          falhou={resumo.isError}
          aoTentarDeNovo={() => void resumo.refetch()}
          aReceber={aReceber.data ?? null}
        />
      )}

      <div className="flex flex-col gap-(--e-3)">
        {lixeira || semNenhum ? null : (
          <AbasDeSituacao
            situacao={situacao}
            contagem={contagem.data}
            aoEscolher={escolherSituacao}
          />
        )}
        {semNenhum ? null : (
          <div className="flex flex-wrap items-center gap-(--e-2)">
            {campoDeBusca}
            {comFiltro && !lixeira ? botaoLimpar : null}
          </div>
        )}
        {conteudo}
      </div>

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
    </Pagina>
  )
}
