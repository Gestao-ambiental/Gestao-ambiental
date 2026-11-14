import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_SITUACAO_CONSULTORIA,
  SITUACOES_CONSULTORIA,
  TAMANHO_PAGINA_CENTRAL,
  listarConsultoriasDaCentral,
  situacaoConsultoriaOuNula,
  type ConsultoriaNaCentral,
  type SituacaoConsultoria,
} from '@/lib/api/central'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { AlertasDeSemUso, ResumoDeUsoNaCentral } from './UsoNaCentral'
import { TOM_DA_SITUACAO, classeCabecalho, classeCelula, plural, ultimoUsoComoData } from './comum'

const classeCampoFiltro =
  'h-(--size-control) rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) corpo text-(--text) outline-none transicao-estado focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)] focus:bg-(--surface-input-focus)'

function Gestao({ item }: { item: ConsultoriaNaCentral }) {
  if (item.gestao.length === 0)
    return <span className="text-(--text-subtle)">Sem Gestão ativa</span>
  return (
    <ul className="flex flex-col gap-(--space-025)">
      {item.gestao.map((pessoa) => (
        <li key={pessoa.email} className="flex min-w-0 flex-col">
          <span className="truncate">{pessoa.nome}</span>
          <span className="truncate text-xs text-(--text-subtle)">{pessoa.email}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * /admin (ADM-01; ADR-0022 e ADR-0024): uso da plataforma (ativas agora, em 7 e 30 dias), alertas
 * de consultorias sem uso e as consultorias, paginadas (50), com busca por nome, filtro por
 * situação (?situacao=…) e último uso. Só contagens: nada de documentos, licenças ou orçamentos.
 */
export function PaginaCentral() {
  const navegar = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const situacao = situacaoConsultoriaOuNula(parametros.get('situacao'))
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const campoBusca = useRef<HTMLInputElement>(null)

  const consulta = useInfiniteQuery({
    queryKey: ['central', 'consultorias', buscaAdiada, situacao],
    queryFn: ({ pageParam }) => listarConsultoriasDaCentral(buscaAdiada, situacao, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_CENTRAL && carregados < ultima.total
        ? todas.length
        : undefined
    },
    placeholderData: (anterior) => anterior,
  })

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const filtrando = buscaAdiada !== '' || situacao !== null
  const agora = new Date()

  function escolherSituacao(nova: SituacaoConsultoria | null) {
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

  function limparFiltros() {
    setBusca('')
    escolherSituacao(null)
    campoBusca.current?.focus()
  }

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando consultorias" linhas={6} />
  } else if (consulta.isError && ehDoisFatoresNecessarios(consulta.error)) {
    conteudo = <RelerDoisFatores />
  } else if (consulta.isError && ehSemPermissao(consulta.error)) {
    conteudo = <SemPermissao descricao={null} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar as consultorias."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0 && !filtrando) {
    conteudo = <EstadoVazio icone="briefcase" titulo="Nenhuma consultoria ainda" />
  } else if (itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="search"
        titulo="Nenhuma consultoria encontrada"
        acaoPrincipal={
          <Botao aparencia="sutil" iconeAntes="x" onClick={limparFiltros}>
            Limpar filtros
          </Botao>
        }
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
                  Consultoria
                </th>
                <th scope="col" className={classeCabecalho}>
                  Gestão
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Pessoas
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Orçamentos
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Empreendimentos
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Licenças
                </th>
                <th scope="col" className={classeCabecalho}>
                  Último uso
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transicao-estado hover:bg-(--surface-hover) last:[&>td]:border-b-0"
                  onClick={() => {
                    void navegar(`/admin/consultorias/${item.id}`)
                  }}
                >
                  <td className={`${classeCelula} py-(--space-100)`}>
                    <Link
                      to={`/admin/consultorias/${item.id}`}
                      className="corpo-medio text-(--text) hover:text-(--text)"
                      onClick={(evento) => {
                        evento.stopPropagation()
                      }}
                    >
                      {item.nome}
                    </Link>
                    <span className="block text-xs text-(--text-subtle)">
                      Criada em {formatarInstanteComoData(item.criadaEm, item.fuso)}
                    </span>
                  </td>
                  <td className={`${classeCelula} max-w-64 py-(--space-100)`}>
                    <Gestao item={item} />
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {item.pessoasAtivas}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>{item.orcamentos}</td>
                  <td className={`${classeCelula} text-right tabular-nums`}>
                    {item.empreendimentos}
                  </td>
                  <td className={`${classeCelula} text-right tabular-nums`}>{item.licencas}</td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    {ultimoUsoComoData(item.ultimoUsoEm, item.fuso, agora)}
                  </td>
                  <td className={classeCelula}>
                    <Selo tom={TOM_DA_SITUACAO[item.situacao]}>
                      {ROTULO_SITUACAO_CONSULTORIA[item.situacao]}
                    </Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-(--space-150) py-(--space-100) text-xs text-(--text-subtle)">
            {plural(total, 'consultoria', 'consultorias')}
          </p>
        </div>

        <ul className="flex flex-col gap-(--space-100) md:hidden" aria-label="Consultorias">
          {itens.map((item) => (
            <li
              key={item.id}
              className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao"
            >
              <Link
                to={`/admin/consultorias/${item.id}`}
                className="flex flex-col gap-(--space-075) rounded-(--radius-large) p-(--space-150) text-(--text) no-underline hover:bg-(--surface-hover) hover:text-(--text) hover:no-underline"
              >
                <span className="flex items-center justify-between gap-(--space-100)">
                  <Selo tom={TOM_DA_SITUACAO[item.situacao]}>
                    {ROTULO_SITUACAO_CONSULTORIA[item.situacao]}
                  </Selo>
                  <Icone nome="chevron-right" className="text-(--icon)" />
                </span>
                <span className="corpo-medio">{item.nome}</span>
                <span className="text-xs text-(--text-subtle)">
                  {item.gestao.length > 0
                    ? item.gestao.map((p) => `${p.nome} · ${p.email}`).join(', ')
                    : 'Sem Gestão ativa'}
                </span>
                <span className="text-xs text-(--text)">
                  {plural(item.pessoasAtivas, 'pessoa', 'pessoas')} ·{' '}
                  {plural(item.orcamentos, 'orçamento', 'orçamentos')} ·{' '}
                  {plural(item.empreendimentos, 'empreendimento', 'empreendimentos')} ·{' '}
                  {plural(item.licencas, 'licença', 'licenças')}
                </span>
                <span className="text-xs text-(--text-subtle)">
                  Criada em {formatarInstanteComoData(item.criadaEm, item.fuso)} · Último uso:{' '}
                  {ultimoUsoComoData(item.ultimoUsoEm, item.fuso, agora)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-(--text-subtle) md:hidden">
          {plural(total, 'consultoria', 'consultorias')}
        </p>

        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais consultorias
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-300)">
      <Pagina titulo="Consultorias">{null}</Pagina>
      <ResumoDeUsoNaCentral />
      <AlertasDeSemUso />
      <section aria-labelledby="central-lista" className="flex flex-col gap-(--space-150)">
        <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
          <h2 id="central-lista" className="titulo-secao text-(--text)">
            Todas as consultorias
          </h2>
          <div className="flex w-full flex-wrap items-center gap-(--space-100) sm:w-auto">
            <label className="relative flex min-w-0 flex-1 items-center sm:flex-none">
              <span className="sr-only">Buscar consultoria pelo nome</span>
              <Icone
                nome="search"
                className="pointer-events-none absolute left-(--space-100) text-(--icon-subtle)"
              />
              <input
                ref={campoBusca}
                type="search"
                value={busca}
                placeholder="Buscar pelo nome"
                onChange={(evento) => {
                  setBusca(evento.target.value)
                }}
                className={`${classeCampoFiltro} w-full pr-(--space-100) pl-(--space-400) sm:w-[260px]`}
              />
            </label>
            <label className="flex min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Situação</span>
              <select
                value={situacao ?? ''}
                onChange={(evento) => {
                  escolherSituacao(situacaoConsultoriaOuNula(evento.target.value))
                }}
                className={`${classeCampoFiltro} w-full px-(--space-100) sm:w-auto`}
              >
                <option value="">Todas as situações</option>
                {SITUACOES_CONSULTORIA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO_CONSULTORIA[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {conteudo}
      </section>
    </div>
  )
}
