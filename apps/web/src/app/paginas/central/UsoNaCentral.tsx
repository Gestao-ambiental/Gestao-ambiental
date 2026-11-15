import { ROTULO_DO_MODULO_DE_USO, rotuloDoAlertaDeSemUso } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_CENTRAL,
  listarAlertasDeSemUso,
  listarUsoPorModulo,
  resumoDeUso,
} from '@/lib/api/central'
import { ehDoisFatoresNecessarios, ehSemPermissao } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { plural } from './comum'

const classeCartao =
  'flex min-w-0 flex-col gap-(--space-050) rounded-(--radius-large) border bg-(--surface) p-(--space-150) shadow-cartao sm:p-(--space-200)'

/** Erro de uma seção da central: sem permissão, dois fatores ou falha comum. */
function ErroDaSecao({
  erro,
  titulo,
  aoTentarDeNovo,
}: {
  erro: unknown
  titulo: string
  aoTentarDeNovo: () => void
}) {
  if (ehDoisFatoresNecessarios(erro)) return <RelerDoisFatores />
  if (ehSemPermissao(erro)) return <SemPermissao descricao={null} />
  return (
    <EstadoErro
      titulo={titulo}
      descricao="Verifique a conexão e tente de novo."
      aoTentarDeNovo={aoTentarDeNovo}
    />
  )
}

/** Visão geral: consultorias com uso agora (15 min), em 7 e em 30 dias. */
export function ResumoDeUsoNaCentral() {
  const consulta = useQuery({ queryKey: ['central', 'resumo-de-uso'], queryFn: resumoDeUso })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando o uso" linhas={2} />
  } else if (consulta.isError) {
    conteudo = (
      <ErroDaSecao
        erro={consulta.error}
        titulo="Não foi possível carregar o uso."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else {
    const numeros: [string, number][] = [
      ['Ativas agora', consulta.data.agora],
      ['Ativas em 7 dias', consulta.data.ultimos7Dias],
      ['Ativas em 30 dias', consulta.data.ultimos30Dias],
    ]
    conteudo = (
      <dl className="grid grid-cols-1 gap-(--space-150) sm:grid-cols-3">
        {numeros.map(([titulo, valor]) => (
          <div key={titulo} className={classeCartao}>
            <dt className="corpo text-(--text-subtle)">{titulo}</dt>
            <dd className="titulo-tela text-(--text) tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <section aria-labelledby="central-uso" className="flex flex-col gap-(--space-100)">
      <h2 id="central-uso" className="titulo-secao text-(--text)">
        Uso
      </h2>
      {conteudo}
    </section>
  )
}

/** Alerta "sem uso há 14 dias" (com pessoas ativas; inclui quem nunca usou). */
export function AlertasDeSemUso() {
  const consulta = useInfiniteQuery({
    queryKey: ['central', 'alertas-sem-uso'],
    queryFn: ({ pageParam }) => listarAlertasDeSemUso(pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_CENTRAL && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })
  const itens = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0
  const agora = new Date()

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando alertas" linhas={2} />
  } else if (consulta.isError) {
    conteudo = (
      <ErroDaSecao
        erro={consulta.error}
        titulo="Não foi possível carregar os alertas."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = <EstadoVazio icone="circle-check" titulo="Nenhum alerta" />
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--space-100)">
        <ul
          aria-label="Consultorias sem uso"
          className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao"
        >
          {itens.map((alerta) => (
            <li key={alerta.id} className="border-b last:border-b-0">
              <Link
                to={`/admin/consultorias/${alerta.id}`}
                className="flex flex-wrap items-center gap-x-(--space-150) gap-y-(--space-050) px-(--space-150) py-(--space-100) text-(--text) no-underline hover:bg-(--surface-hover) hover:text-(--text) hover:no-underline"
              >
                <Icone nome="triangle-alert" className="text-(--icon)" />
                <span className="min-w-0 flex-1 corpo-medio">{alerta.nome}</span>
                <Selo tom="atencao">{rotuloDoAlertaDeSemUso(alerta, agora)}</Selo>
                <span className="text-xs text-(--text-subtle)">
                  {plural(alerta.pessoasAtivas, 'pessoa ativa', 'pessoas ativas')}
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
            Mostrar mais alertas
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-labelledby="central-alertas" className="flex flex-col gap-(--space-100)">
      <div className="flex items-baseline gap-(--space-100)">
        <h2 id="central-alertas" className="titulo-secao text-(--text)">
          Alertas
        </h2>
        {consulta.isSuccess && total > 0 ? (
          <span className="text-(--text-subtle) tabular-nums">{total}</span>
        ) : null}
      </div>
      {conteudo}
    </section>
  )
}

/** Detalhe: dias com uso por área nos últimos 30 dias. */
export function UsoPorModulo({ consultoriaId }: { consultoriaId: string }) {
  const consulta = useQuery({
    queryKey: ['central', 'uso-por-modulo', consultoriaId],
    queryFn: () => listarUsoPorModulo(consultoriaId),
  })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando o uso por área" linhas={2} />
  } else if (consulta.isError) {
    conteudo = (
      <ErroDaSecao
        erro={consulta.error}
        titulo="Não foi possível carregar o uso por área."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (consulta.data.length === 0) {
    conteudo = <EstadoVazio icone="chart-column" titulo="Sem uso registrado" />
  } else {
    conteudo = (
      <dl className="grid grid-cols-1 gap-(--space-150) sm:grid-cols-2 lg:grid-cols-4">
        {consulta.data.map((uso) => (
          <div key={uso.modulo} className={classeCartao}>
            <dt className="corpo text-(--text-subtle)">{ROTULO_DO_MODULO_DE_USO[uso.modulo]}</dt>
            <dd className="titulo-tela text-(--text) tabular-nums">
              {plural(uso.dias, 'dia', 'dias')}
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <section aria-labelledby="central-uso-por-area" className="flex flex-col gap-(--space-100)">
      <h2 id="central-uso-por-area" className="titulo-secao text-(--text)">
        Uso por área em 30 dias
      </h2>
      {conteudo}
    </section>
  )
}
