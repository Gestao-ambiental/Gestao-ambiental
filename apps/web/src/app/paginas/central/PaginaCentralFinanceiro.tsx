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
import { classeSelecao } from '@/components/ui/estilos-campo'
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
import { Placar } from './Placar'
import { classeCabecalho, classeCelula, classeLinha, classePainel, plural } from './comum'

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

function Numeros({ r, catalogo }: { r: ResumoFinanceiro; catalogo: CatalogoComercial }) {
  return (
    <section aria-label="Números do Financeiro" className="flex flex-col gap-(--e-6)">
      <div className="flex flex-col gap-(--e-3)">
        <Placar
          rotulo="Receita"
          colunas={4}
          casas={[
            { rotulo: 'MRR', valor: formatarReais(r.mrrCentavos) },
            { rotulo: 'Ticket médio', valor: formatarReais(r.ticketMedioCentavos) },
            { rotulo: 'Mensal × anual', valor: `${String(r.mensais)} × ${String(r.anuais)}` },
            { rotulo: 'Pagantes', valor: r.pagantes },
          ]}
        />
        <Placar
          rotulo="Consultorias por situação"
          colunas={5}
          casas={[
            { rotulo: 'Em teste', valor: r.emTeste },
            { rotulo: 'Teste acabando', valor: r.testeAcabando },
            { rotulo: 'Beta', valor: r.beta },
            { rotulo: 'Contas internas', valor: r.internas },
            { rotulo: 'Por contrato', valor: r.porContrato },
            { rotulo: 'Em atraso', valor: r.emAtraso },
            { rotulo: 'Somente leitura', valor: r.bloqueadas },
            { rotulo: 'Cancelados', valor: r.cancelados },
            { rotulo: 'Teste encerrado', valor: r.testeEncerrado },
          ]}
        />
      </div>
      <section aria-labelledby="receita-por-plano" className="flex flex-col gap-(--e-3)">
        <h2 id="receita-por-plano" className="titulo-secao text-(--tinta)">
          Receita mensal por plano
        </h2>
        <Placar
          rotulo="Receita mensal por plano"
          colunas={3}
          casas={(['essencial', 'equipe', 'escala'] as const).map((p) => ({
            rotulo: catalogo.planos[p].nome,
            valor: formatarReais(r.receitaPorPlano[p]),
          }))}
        />
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
    <div className={`flex flex-col overflow-hidden ${classePainel}`}>
      <div role="region" aria-label="Consultorias do Financeiro" className="overflow-x-auto">
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
              <tr key={l.id} className={classeLinha}>
                <td className={`${classeCelula} py-(--e-1)`}>
                  <Link to={`/admin/consultorias/${l.id}`} className="corpo-medio">
                    {l.nome}
                  </Link>
                  {detalheDaLinha(l) ? (
                    <span className="block rotulo numero">{detalheDaLinha(l)}</span>
                  ) : null}
                </td>
                <td className={classeCelula}>
                  {l.situacao ? (
                    <Selo tom={TOM_DA_SITUACAO_COMERCIAL[l.situacao]}>
                      {ROTULO_CURTO_DA_SITUACAO[l.situacao]}
                    </Selo>
                  ) : null}
                </td>
                <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2)`}>
                  {l.plano && l.ciclo
                    ? `${catalogo.planos[l.plano].nome} · ${ROTULO_DO_CICLO[l.ciclo]}`
                    : '—'}
                </td>
                <td className={`${classeCelula} text-right numero`}>
                  {l.mensalCentavos > 0 ? formatarReais(l.mensalCentavos) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
        <span className="flex-1 rotulo numero">{plural(total, 'consultoria', 'consultorias')}</span>
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
                className={`${classeSelecao} max-sm:w-full max-sm:max-w-none`}
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

  return <Pagina titulo="Financeiro">{conteudo}</Pagina>
}
