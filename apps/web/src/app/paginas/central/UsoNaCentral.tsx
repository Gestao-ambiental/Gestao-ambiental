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
import { Placar } from './Placar'
import { plural } from './comum'

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
    conteudo = <Placar colunas={3} casas={numeros.map(([rotulo, valor]) => ({ rotulo, valor }))} />
  }

  return (
    <section aria-labelledby="central-uso" className="flex flex-col gap-(--e-3)">
      <h2 id="central-uso" className="titulo-secao text-(--tinta)">
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
    conteudo = <p className="corpo text-(--tinta-2)">Nenhum alerta</p>
  } else {
    conteudo = (
      <div className="flex flex-col gap-(--e-2)">
        <ul
          aria-label="Consultorias sem uso"
          className="flex flex-col rounded-(--raio-painel) border bg-(--folha)"
        >
          {itens.map((alerta) => (
            <li key={alerta.id} className="border-b border-(--regra-leve) last:border-b-0">
              <Link
                to={`/admin/consultorias/${alerta.id}`}
                className="flex min-h-(--linha-densa) flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1) px-(--e-4) py-(--e-2) text-(--tinta) no-underline hover:bg-(--toque) hover:text-(--tinta) hover:no-underline"
              >
                <span className="min-w-0 flex-1 truncate corpo-medio max-sm:basis-full">
                  {alerta.nome}
                </span>
                <Selo tom="atencao">{rotuloDoAlertaDeSemUso(alerta, agora)}</Selo>
                <span className="w-32 text-right rotulo numero max-sm:w-auto">
                  {plural(alerta.pessoasAtivas, 'pessoa ativa', 'pessoas ativas')}
                </span>
                <Icone nome="chevron-right" className="shrink-0 text-(--icone)" />
              </Link>
            </li>
          ))}
        </ul>
        {consulta.hasNextPage ? (
          <Botao
            aparencia="sutil"
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
    <section aria-labelledby="central-alertas" className="flex flex-col gap-(--e-2)">
      <div className="flex items-center gap-(--e-2)">
        <h2 id="central-alertas" className="titulo-secao text-(--tinta)">
          Alertas
        </h2>
        {consulta.isSuccess && total > 0 ? (
          <span className="min-w-6 rounded-(--raio-mini) bg-(--alerta-fundo) px-(--e-1) text-center text-xs font-[800] text-(--alerta-texto) numero">
            {total}
          </span>
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
      <Placar
        colunas={4}
        casas={consulta.data.map((uso) => ({
          rotulo: ROTULO_DO_MODULO_DE_USO[uso.modulo],
          valor: plural(uso.dias, 'dia', 'dias'),
        }))}
      />
    )
  }

  return (
    <section aria-labelledby="central-uso-por-area" className="flex flex-col gap-(--e-2)">
      <h2 id="central-uso-por-area" className="titulo-secao text-(--tinta)">
        Uso por área em 30 dias
      </h2>
      {conteudo}
    </section>
  )
}
