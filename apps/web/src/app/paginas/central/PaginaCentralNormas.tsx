import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_SITUACAO_DA_MUDANCA,
  ROTULO_TIPO_DE_MUDANCA,
  SITUACOES_DA_MUDANCA,
  TAMANHO_PAGINA_NORMAS,
  listarMudancasDeNorma,
  usoDeIaDaPlataforma,
  type SituacaoDaMudanca,
} from '@/lib/api/central-normas'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, classeLinha, classePainel, plural } from './comum'
import { FUSO_DA_CENTRAL, TOM_DA_SITUACAO_DA_MUDANCA, formatarDolar } from './normas'

/** Resumos de hoje e custo do mês da IA da plataforma (fora da cota das consultorias). */
function UsoDaIa() {
  const uso = useQuery({
    queryKey: ['central', 'normas', 'uso-de-ia'],
    queryFn: usoDeIaDaPlataforma,
  })
  if (!uso.data) return null
  const { resumosHoje, limiteDia, custoMesMicros, limiteMesMicros } = uso.data
  return (
    <dl aria-label="Uso da IA" className="flex flex-wrap gap-x-(--e-6) gap-y-(--e-1) corpo">
      <div className="flex items-baseline gap-(--e-2)">
        <dt className="rotulo">Resumos hoje</dt>
        <dd className="corpo-medio text-(--tinta) numero">
          {String(resumosHoje)} / {String(limiteDia)}
        </dd>
      </div>
      <div className="flex items-baseline gap-(--e-2)">
        <dt className="rotulo">Custo do mês</dt>
        <dd className="corpo-medio text-(--tinta) numero">
          {formatarDolar(custoMesMicros)} / {formatarDolar(limiteMesMicros)}
        </dd>
      </div>
    </dl>
  )
}

/**
 * /admin/normas (LEG-04; ADR-0050, itens 14 a 16): mudanças de norma detectadas pela coleta, para o
 * operador revisar. Sem filtro, só as que faltam revisar (detectada e resumida), mais antigas
 * primeiro. Paginada (25).
 */
export function PaginaCentralNormas() {
  const idFiltro = useId()
  const [situacao, setSituacao] = useState<SituacaoDaMudanca | null>(null)

  const consulta = useInfiniteQuery({
    queryKey: ['central', 'normas', 'fila', situacao],
    queryFn: ({ pageParam }) => listarMudancasDeNorma(pageParam, situacao),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_NORMAS && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando as mudanças de norma" linhas={6} />
  } else if (consulta.isError && ehDoisFatoresNecessarios(consulta.error)) {
    conteudo = <RelerDoisFatores />
  } else if (consulta.isError && ehSemPermissao(consulta.error)) {
    conteudo = <SemPermissao descricao={null} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar as mudanças de norma."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="file-text"
        titulo={
          situacao === null ? 'Nenhuma mudança para revisar' : 'Nenhuma mudança nesta situação'
        }
      />
    )
  } else {
    conteudo = (
      <div className={`flex flex-col overflow-hidden ${classePainel}`}>
        <div className="max-h-[calc(100dvh-300px)] min-h-[240px] overflow-auto">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Norma
                </th>
                <th scope="col" className={classeCabecalho}>
                  Mudança
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  Detectada em
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className={classeLinha}>
                  <td className={`${classeCelula} corpo-medio`}>
                    <Link to={`/admin/normas/${item.id}`}>{item.normaTitulo}</Link>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    {ROTULO_TIPO_DE_MUDANCA[item.tipo]}
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    <Selo tom={TOM_DA_SITUACAO_DA_MUDANCA[item.situacao]}>
                      {ROTULO_SITUACAO_DA_MUDANCA[item.situacao]}
                    </Selo>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                    {formatarInstanteComoData(item.detectadaEm, FUSO_DA_CENTRAL)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero">{plural(total, 'mudança', 'mudanças')}</span>
          {consulta.hasNextPage ? (
            <Botao
              aparencia="sutil"
              tamanho="compacto"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Pagina
      titulo="Normas"
      meta={<UsoDaIa />}
      acao={
        <label htmlFor={idFiltro} className="flex items-center gap-(--e-2)">
          <span className="rotulo">Situação</span>
          <select
            id={idFiltro}
            value={situacao ?? ''}
            onChange={(evento) => {
              setSituacao(SITUACOES_DA_MUDANCA.find((s) => s === evento.target.value) ?? null)
            }}
            className={classeSelecao}
          >
            <option value="">Para revisar</option>
            {SITUACOES_DA_MUDANCA.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SITUACAO_DA_MUDANCA[s]}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {conteudo}
    </Pagina>
  )
}
