import {
  ROTULO_DO_CICLO,
  formatarDataCivil,
  formatarReais,
  type CatalogoComercial,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { useCatalogoComercial } from '@/app/plano/catalogo'
import { TOM_DA_SITUACAO_COMERCIAL } from '@/app/plano/situacao'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Selo } from '@/components/ui/selo'
import {
  GRUPOS_FINANCEIROS,
  ROTULO_DO_GRUPO,
  grupoOuNulo,
  listarFinanceiro,
  obterResumoFinanceiro,
  type GrupoFinanceiro,
  type LinhaFinanceira,
  type ResumoFinanceiro,
} from '@/lib/api/plano'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, plural } from './comum'

const ROTULO_CURTO_DA_SITUACAO: Record<string, string> = {
  interna: 'Conta interna',
  beta: 'Beta',
  teste: 'Em teste',
  ativa: 'Ativa',
  em_atraso: 'Em atraso',
  bloqueada: 'Somente leitura',
  teste_encerrado: 'Teste encerrado',
  cancelada: 'Cancelada',
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-(--e-05) rounded-(--raio-painel) border bg-(--folha) p-(--e-3) shadow-cartao">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="titulo-secao text-(--tinta) tabular-nums">{valor}</dd>
    </div>
  )
}

function Numeros({ r, catalogo }: { r: ResumoFinanceiro; catalogo: CatalogoComercial }) {
  return (
    <section aria-label="Números do Financeiro" className="flex flex-col gap-(--e-3)">
      <dl className="grid grid-cols-2 gap-(--e-2) md:grid-cols-4">
        <Cartao rotulo="MRR" valor={formatarReais(r.mrrCentavos)} />
        <Cartao rotulo="Ticket médio" valor={formatarReais(r.ticketMedioCentavos)} />
        <Cartao rotulo="Mensal × anual" valor={`${String(r.mensais)} × ${String(r.anuais)}`} />
        <Cartao rotulo="Pagantes" valor={String(r.pagantes)} />
        <Cartao rotulo="Em teste" valor={String(r.emTeste)} />
        <Cartao rotulo="Teste acabando" valor={String(r.testeAcabando)} />
        <Cartao rotulo="Beta" valor={String(r.beta)} />
        <Cartao rotulo="Contas internas" valor={String(r.internas)} />
        <Cartao rotulo="Por contrato" valor={String(r.porContrato)} />
        <Cartao rotulo="Em atraso" valor={String(r.emAtraso)} />
        <Cartao rotulo="Somente leitura" valor={String(r.bloqueadas)} />
        <Cartao rotulo="Cancelados" valor={String(r.cancelados)} />
        <Cartao rotulo="Teste encerrado" valor={String(r.testeEncerrado)} />
      </dl>
      <section aria-labelledby="receita-por-plano" className="flex flex-col gap-(--e-15)">
        <h2 id="receita-por-plano" className="titulo-secao text-(--tinta)">
          Receita mensal por plano
        </h2>
        <dl className="grid grid-cols-1 gap-(--e-2) sm:grid-cols-3">
          {(['essencial', 'equipe', 'escala'] as const).map((p) => (
            <Cartao
              key={p}
              rotulo={catalogo.planos[p].nome}
              valor={formatarReais(r.receitaPorPlano[p])}
            />
          ))}
        </dl>
      </section>
    </section>
  )
}

function detalheDaLinha(l: LinhaFinanceira): string {
  if (l.emAtrasoDesde) return `Vencida em ${formatarDataCivil(l.emAtrasoDesde as DataCivil)}`
  if (l.situacao === 'teste' && l.testeAte)
    return `Teste até ${formatarDataCivil(l.testeAte as DataCivil)}`
  return ''
}

function Lista({
  grupo,
  catalogo,
}: {
  grupo: GrupoFinanceiro | null
  catalogo: CatalogoComercial
}) {
  const consulta = useInfiniteQuery({
    queryKey: ['central', 'financeiro', 'lista', grupo],
    queryFn: ({ pageParam }) => listarFinanceiro(grupo, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === 50 && carregados < ultima.total ? todas.length : undefined
    },
  })
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0

  if (consulta.isPending) return <Carregando rotulo="Carregando consultorias" linhas={4} />
  if (consulta.isError)
    return (
      <EstadoErro
        titulo="Não foi possível carregar as consultorias."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  if (itens.length === 0)
    return <EstadoVazio icone="briefcase" titulo="Nenhuma consultoria neste grupo" />

  return (
    <div className="flex flex-col gap-(--e-2)">
      <div
        role="region"
        aria-label="Consultorias do Financeiro"
        className="overflow-x-auto rounded-(--raio-painel) border bg-(--folha) shadow-cartao"
      >
        <table className="w-full border-collapse corpo">
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                Consultoria
              </th>
              <th scope="col" className={classeCabecalho}>
                Situação
              </th>
              <th scope="col" className={classeCabecalho}>
                Plano
              </th>
              <th scope="col" className={`${classeCabecalho} text-right`}>
                Valor mensal
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((l) => (
              <tr key={l.id} className="last:[&>td]:border-b-0">
                <td className={`${classeCelula} py-(--e-2)`}>
                  <Link to={`/admin/consultorias/${l.id}`} className="corpo-medio">
                    {l.nome}
                  </Link>
                  {detalheDaLinha(l) ? (
                    <span className="block text-xs">{detalheDaLinha(l)}</span>
                  ) : null}
                </td>
                <td className={classeCelula}>
                  {l.situacao ? (
                    <Selo tom={TOM_DA_SITUACAO_COMERCIAL[l.situacao]}>
                      {ROTULO_CURTO_DA_SITUACAO[l.situacao]}
                    </Selo>
                  ) : null}
                </td>
                <td className={`${classeCelula} whitespace-nowrap`}>
                  {l.plano && l.ciclo
                    ? `${catalogo.planos[l.plano].nome} · ${ROTULO_DO_CICLO[l.ciclo]}`
                    : '—'}
                </td>
                <td className={`${classeCelula} text-right tabular-nums`}>
                  {l.mensalCentavos > 0 ? formatarReais(l.mensalCentavos) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs">{plural(total, 'consultoria', 'consultorias')}</p>
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

/**
 * Financeiro da central (ADR-0026): pagantes, em teste, beta, internas, em atraso, cancelados, MRR
 * (anual / 12, com adicionais), ticket médio, receita por plano, mensal × anual e teste acabando
 * (próximos 3 dias úteis). Lista paginada por grupo (?grupo=…). Operador com dois fatores.
 */
export function PaginaCentralFinanceiro() {
  const [parametros, setParametros] = useSearchParams()
  const grupo = grupoOuNulo(parametros.get('grupo'))
  const resumo = useQuery({
    queryKey: ['central', 'financeiro', 'resumo'],
    queryFn: obterResumoFinanceiro,
  })
  const catalogo = useCatalogoComercial()

  let conteudo
  if (resumo.isPending || catalogo.isPending)
    conteudo = <Carregando rotulo="Carregando o Financeiro" linhas={4} />
  else if (resumo.isError && ehDoisFatoresNecessarios(resumo.error)) conteudo = <RelerDoisFatores />
  else if (resumo.isError && ehSemPermissao(resumo.error))
    conteudo = <SemPermissao descricao={null} />
  else if (resumo.isError || catalogo.isError)
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o Financeiro."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => {
          void resumo.refetch()
          void catalogo.refetch()
        }}
      />
    )
  else
    conteudo = (
      <>
        <Numeros r={resumo.data} catalogo={catalogo.data} />
        <section aria-labelledby="financeiro-lista" className="flex flex-col gap-(--e-3)">
          <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
            <h2 id="financeiro-lista" className="titulo-secao text-(--tinta)">
              Consultorias
            </h2>
            <label className="flex min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Grupo</span>
              <select
                value={grupo ?? ''}
                onChange={(evento) => {
                  const novo = grupoOuNulo(evento.target.value)
                  setParametros(novo ? { grupo: novo } : {}, { replace: true })
                }}
                className="h-(--controle) w-full rounded-(--raio) border border-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) sm:w-auto"
              >
                <option value="">Todas</option>
                {GRUPOS_FINANCEIROS.map((g) => (
                  <option key={g} value={g}>
                    {ROTULO_DO_GRUPO[g]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Lista grupo={grupo} catalogo={catalogo.data} />
        </section>
      </>
    )

  return (
    <div className="flex flex-col gap-(--e-6)">
      <Pagina titulo="Financeiro">{null}</Pagina>
      {conteudo}
    </div>
  )
}
