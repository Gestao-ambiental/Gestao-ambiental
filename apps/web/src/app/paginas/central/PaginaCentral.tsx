import { useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeCampo, classeSelecao } from '@/components/ui/estilos-campo'
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
import {
  TOM_DA_SITUACAO,
  classeCabecalho,
  classeCelula,
  classeLinha,
  classePainel,
  plural,
  ultimoUsoComoData,
} from './comum'

function Gestao({ item }: { item: ConsultoriaNaCentral }) {
  if (item.gestao.length === 0) return <span className="text-(--tinta-2)">Sem Gestão ativa</span>
  return (
    <ul className="flex flex-col gap-(--e-05)">
      {item.gestao.map((pessoa) => (
        <li key={pessoa.email} className="flex min-w-0 flex-col">
          <span className="truncate">{pessoa.nome}</span>
          <span className="truncate rotulo">{pessoa.email}</span>
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
      <div className={`flex flex-col overflow-hidden ${classePainel}`}>
        <div className="hidden max-h-[calc(100dvh-320px)] min-h-[240px] overflow-auto md:block">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
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
                  className={`cursor-pointer ${classeLinha}`}
                  onClick={() => {
                    void navegar(`/admin/consultorias/${item.id}`)
                  }}
                >
                  <td className={`${classeCelula} py-(--e-1)`}>
                    <Link
                      to={`/admin/consultorias/${item.id}`}
                      className="corpo-medio text-(--tinta) hover:text-(--tinta)"
                      onClick={(evento) => {
                        evento.stopPropagation()
                      }}
                    >
                      {item.nome}
                    </Link>
                    <span className="block rotulo numero">
                      Criada em {formatarInstanteComoData(item.criadaEm, item.fuso)}
                    </span>
                  </td>
                  <td className={`${classeCelula} max-w-64 py-(--e-1)`}>
                    <Gestao item={item} />
                  </td>
                  <td className={`${classeCelula} text-right numero`}>{item.pessoasAtivas}</td>
                  <td className={`${classeCelula} text-right numero`}>{item.orcamentos}</td>
                  <td className={`${classeCelula} text-right numero`}>{item.empreendimentos}</td>
                  <td className={`${classeCelula} text-right numero`}>{item.licencas}</td>
                  <td className={`${classeCelula} whitespace-nowrap numero`}>
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
        </div>

        <ul className="flex flex-col md:hidden" aria-label="Consultorias">
          {itens.map((item) => (
            <li key={item.id} className="border-b border-(--regra-leve) last:border-b-0">
              <Link
                to={`/admin/consultorias/${item.id}`}
                className="flex flex-col gap-(--e-1) px-(--e-4) py-(--e-3) text-(--tinta) no-underline hover:bg-(--toque) hover:text-(--tinta) hover:no-underline"
              >
                <span className="flex items-center justify-between gap-(--e-2)">
                  <span className="truncate corpo-medio">{item.nome}</span>
                  <Icone nome="chevron-right" className="shrink-0 text-(--icone)" />
                </span>
                <Selo tom={TOM_DA_SITUACAO[item.situacao]}>
                  {ROTULO_SITUACAO_CONSULTORIA[item.situacao]}
                </Selo>
                <span className="rotulo">
                  {item.gestao.length > 0
                    ? item.gestao.map((p) => `${p.nome} · ${p.email}`).join(', ')
                    : 'Sem Gestão ativa'}
                </span>
                <span className="corpo numero">
                  {plural(item.pessoasAtivas, 'pessoa', 'pessoas')} ·{' '}
                  {plural(item.orcamentos, 'orçamento', 'orçamentos')} ·{' '}
                  {plural(item.empreendimentos, 'empreendimento', 'empreendimentos')} ·{' '}
                  {plural(item.licencas, 'licença', 'licenças')}
                </span>
                <span className="rotulo numero">
                  Criada em {formatarInstanteComoData(item.criadaEm, item.fuso)} · Último uso:{' '}
                  {ultimoUsoComoData(item.ultimoUsoEm, item.fuso, agora)}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {itens.length < total
              ? `${String(itens.length)} de ${plural(total, 'consultoria', 'consultorias')}`
              : plural(total, 'consultoria', 'consultorias')}
          </span>
          {consulta.hasNextPage ? (
            <Botao
              aparencia="sutil"
              tamanho="compacto"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais consultorias
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Pagina titulo="Consultorias">
      <ResumoDeUsoNaCentral />
      <AlertasDeSemUso />
      <section aria-labelledby="central-lista" className="flex flex-col gap-(--e-3)">
        <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
          <h2 id="central-lista" className="titulo-secao text-(--tinta)">
            Todas as consultorias
          </h2>
          <div className="flex w-full flex-wrap items-center gap-(--e-2) sm:w-auto">
            <label className="relative flex min-w-0 basis-full items-center sm:basis-auto">
              <span className="sr-only">Buscar consultoria pelo nome</span>
              <Icone
                nome="search"
                className="pointer-events-none absolute left-(--e-2) text-(--icone-2)"
              />
              <input
                ref={campoBusca}
                type="search"
                value={busca}
                placeholder="Buscar pelo nome"
                onChange={(evento) => {
                  setBusca(evento.target.value)
                }}
                className={`${classeCampo} pl-(--e-8) sm:w-[260px]`}
              />
            </label>
            <label className="flex min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Situação</span>
              <select
                value={situacao ?? ''}
                onChange={(evento) => {
                  escolherSituacao(situacaoConsultoriaOuNula(evento.target.value))
                }}
                className={`${classeSelecao} max-sm:w-full max-sm:max-w-none`}
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
    </Pagina>
  )
}
