import { formatarCentavos } from '@gestao-ambiental/domain'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import { TAMANHO_PAGINA_ORCAMENTOS, listarOrcamentos } from '@/lib/api/orcamentos'
import { formatarInstanteComoData } from '@/lib/datas'

import { classeCabecalho, classeCelula, numeroComRevisao } from './comum'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'
import { DialogoNovoOrcamento } from './DialogoNovoOrcamento'

/**
 * /orcamentos (onda 5; ORC-04). Lista paginada com busca. Nesta fatia o módulo é só da Gestão:
 * custo e margem são dados restritos (RNF). A Equipe vê "sem permissão"; o banco recusaria.
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
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const [novoAberto, setNovoAberto] = useState(false)

  const consulta = useInfiniteQuery({
    queryKey: ['orcamentos', cid, buscaAdiada],
    queryFn: ({ pageParam }) => listarOrcamentos(cid, buscaAdiada, pageParam),
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
                  Atualizado
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
                    {formatarInstanteComoData(item.atualizadoEm, atual.fuso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-(--space-150) py-(--space-100) text-xs text-(--text-subtle)">
            {`${String(total)} ${total === 1 ? 'orçamento' : 'orçamentos'}`}
          </p>
        </div>

        <ul className="flex flex-col gap-(--space-100) md:hidden" aria-label="Orçamentos">
          {itens.map((item) => (
            <li key={item.id}>
              <Link
                to={`/orcamentos/${item.id}`}
                className="flex flex-col gap-(--space-050) rounded-(--radius-large) border bg-(--surface) shadow-cartao p-(--space-150) text-(--text) no-underline hover:bg-(--surface-hover) hover:text-(--text) hover:no-underline"
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
        <Pagina titulo="Orçamentos">{null}</Pagina>
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
          <Link
            to="/configuracoes/custos"
            className="corpo-medio text-(--text-link) no-underline hover:underline"
          >
            Custos e taxas
          </Link>
          {botaoNovo}
        </div>
      </div>

      {conteudo}

      <DialogoNovoOrcamento
        aberto={novoAberto}
        aoMudar={setNovoAberto}
        consultoriaId={cid}
        aoCriar={(id) => {
          void navegar(`/orcamentos/${id}`)
        }}
      />
    </div>
  )
}
