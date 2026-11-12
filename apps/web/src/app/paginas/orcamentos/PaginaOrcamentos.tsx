import { formatarCentavos } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_ORCAMENTOS,
  excluirOrcamento,
  listarOrcamentos,
  restaurarOrcamento,
  type OrcamentoNaLista,
} from '@/lib/api/orcamentos'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCabecalho, classeCelula, numeroComRevisao } from './comum'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'
import { DialogoNovoOrcamento } from './DialogoNovoOrcamento'

/**
 * /orcamentos (onda 5; ORC-04). Lista paginada com busca. Nesta fatia o módulo é só da Gestão:
 * custo e margem são dados restritos (RNF). A Equipe vê "sem permissão"; o banco recusaria.
 *
 * Lixeira (12/11/2026): excluir manda para a lixeira (exclusão lógica), menos o aprovado; na
 * lixeira dá para restaurar. ?lixeira=1 na URL mostra a lixeira.
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
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const [novoAberto, setNovoAberto] = useState(false)
  const [aExcluir, setAExcluir] = useState<OrcamentoNaLista | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const consulta = useInfiniteQuery({
    queryKey: ['orcamentos', cid, buscaAdiada, lixeira],
    queryFn: ({ pageParam }) => listarOrcamentos(cid, buscaAdiada, pageParam, lixeira),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_ORCAMENTOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    placeholderData: (anterior) => anterior,
  })

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const filtrando = buscaAdiada !== ''

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
      <span className="inline-flex items-center gap-(--space-050)">
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
    conteudo = (
      <EstadoVazio
        icone="search"
        titulo="Nenhum orçamento encontrado"
        descricao={`Nada com “${buscaAdiada}”. Busque pelo empreendimento ou pelo objeto.`}
      />
    )
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--space-100)">
        <div className="hidden overflow-x-auto rounded-(--radius-large) border bg-(--surface) shadow-cartao md:block">
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
                  className="cursor-pointer transicao-estado hover:bg-(--surface-hover)"
                  onClick={() => {
                    void navegar(`/orcamentos/${item.id}`)
                  }}
                >
                  <td className={classeCelula}>
                    <Link
                      to={`/orcamentos/${item.id}`}
                      className="corpo-medio text-(--text) hover:text-(--text)"
                      onClick={(evento) => {
                        evento.stopPropagation()
                      }}
                    >
                      {item.empreendimentoNome}
                    </Link>
                    {item.deProspecto ? (
                      <Selo tom="revisao" className="ml-(--space-100) align-middle">
                        Prospecto
                      </Selo>
                    ) : null}
                    <span className="block text-xs text-(--text-subtle)">{item.objeto}</span>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap tabular-nums`}>
                    {numeroComRevisao(item.ano, item.sequencia, item.revisao)}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {item.totalCentavos === null ? (
                      <span className="text-(--text-subtle)">pendente</span>
                    ) : (
                      formatarCentavos(item.totalCentavos)
                    )}
                  </td>
                  <td className={classeCelula}>
                    <SeloSituacaoOrcamento situacao={item.situacao} />
                  </td>
                  <td className={`${classeCelula} text-right text-(--text-subtle)`}>
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
          <p className="border-t px-(--space-150) py-(--space-100) text-xs text-(--text-subtle)">
            {lixeira
              ? `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'} na lixeira`
              : `${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'}`}
          </p>
        </div>

        <ul className="flex flex-col gap-(--space-100) md:hidden" aria-label="Orçamentos">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao"
            >
              <Link
                to={`/orcamentos/${item.id}`}
                className="flex flex-col gap-(--space-050) rounded-t-(--radius-large) p-(--space-150) text-(--text) no-underline hover:bg-(--surface-hover) hover:text-(--text) hover:no-underline"
              >
                <span className="flex items-center justify-between gap-(--space-100)">
                  <SeloSituacaoOrcamento situacao={item.situacao} />
                  <Icone nome="chevron-right" className="text-(--icon)" />
                </span>
                <span className="flex min-w-0 items-center gap-(--space-100)">
                  <span className="truncate corpo-medio">{item.empreendimentoNome}</span>
                  {item.deProspecto ? <Selo tom="revisao">Prospecto</Selo> : null}
                </span>
                <span className="text-xs text-(--text-subtle)">
                  {item.objeto} ·{' '}
                  {item.totalCentavos === null
                    ? 'preço pendente'
                    : `R$ ${formatarCentavos(item.totalCentavos)}`}
                </span>
              </Link>
              <div className="flex justify-end border-t px-(--space-100) py-(--space-050)">
                {acoes(item)}
              </div>
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
    <div className="flex flex-col gap-(--space-200)">
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <Pagina titulo={lixeira ? 'Lixeira de orçamentos' : 'Orçamentos'}>{null}</Pagina>
        <div className="flex flex-wrap items-center gap-(--space-100)">
          <label className="relative flex items-center">
            <span className="sr-only">Buscar orçamentos</span>
            <Icone
              nome="search"
              className="pointer-events-none absolute left-(--space-100) text-(--icon-subtle)"
            />
            <input
              type="search"
              value={busca}
              placeholder="Buscar empreendimento ou objeto"
              onChange={(evento) => {
                setBusca(evento.target.value)
              }}
              className="h-(--size-control) w-[280px] max-w-full rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) pr-(--space-100) pl-(--space-400) corpo text-(--text) outline-none transicao-estado focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)] focus:bg-(--surface-input-focus)"
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
                to="/configuracoes/custos"
                className="corpo-medio text-(--text-link) no-underline hover:underline"
              >
                Custos e taxas
              </Link>
              {botaoNovo}
            </>
          )}
        </div>
      </div>

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

      {conteudo}

      <DialogoNovoOrcamento
        aberto={novoAberto}
        aoMudar={setNovoAberto}
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
