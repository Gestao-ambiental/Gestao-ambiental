import {
  GRUPOS_DA_VISTORIA,
  ROTULO_DO_GRUPO,
  diferencaEmDias,
  formatarDataCivil,
  grupoDaVistoria,
  hojeNoFuso,
  nomeDoDiaDaSemana,
  rotuloDoDiaDaVistoria,
  type DataCivil,
  type GrupoDaVistoria,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Contagem } from '@/app/paginas/visao/Contagem'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/segmentado'
import { listarVistorias, type VistoriaDaLista } from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { classePainel } from './estilos'
import { SeloDaVistoria } from './pecas'

function plural(n: number, um: string, varios: string) {
  return `${String(n)} ${n === 1 ? um : varios}`
}

/** Colunas do quadro no desktop: Faltam, Quando, Vistoria, Itens, Responsável, Situação, ação. */
const GRADE =
  'md:grid md:grid-cols-[64px_minmax(120px,160px)_minmax(0,1fr)_88px_minmax(0,160px)_128px_96px] md:items-center md:gap-x-(--e-3)'

/** Atrasadas da mais antiga; Hoje e Próximas por data e hora; Enviadas da mais recente. */
function ordenar(grupo: GrupoDaVistoria, lista: VistoriaDaLista[]): VistoriaDaLista[] {
  const chave = (v: VistoriaDaLista) => `${v.dataPlanejada} ${v.horaPlanejada ?? '99:99'}`
  const ordenada = [...lista].sort((a, b) => chave(a).localeCompare(chave(b)))
  if (grupo !== 'enviadas') return ordenada
  return ordenada.sort((a, b) => (b.enviadaEm ?? '').localeCompare(a.enviadaEm ?? ''))
}

/**
 * Linha do quadro. Uma estrutura só para os dois tamanhos: no celular, a contagem à esquerda e o
 * resto empilhado; no desktop, `md:contents` solta as peças nas colunas da grade. A linha inteira
 * abre a vistoria (o link do título se estende sobre ela).
 */
function LinhaDaVistoria({
  vistoria,
  grupo,
  hoje,
  fuso,
  ordem,
  proxima,
}: {
  vistoria: VistoriaDaLista
  grupo: GrupoDaVistoria
  hoje: DataCivil
  fuso: string
  ordem: number
  /** A primeira de hoje: o único "Abrir" verde da lista (um primário por tela). */
  proxima: boolean
}) {
  const dias = diferencaEmDias(vistoria.dataPlanejada, hoje)
  const enviada = grupo === 'enviadas'
  const quando =
    enviada && vistoria.enviadaEm
      ? `Enviada ${formatarInstanteComHora(vistoria.enviadaEm, fuso)}`
      : grupo === 'hoje' && vistoria.horaPlanejada
        ? '' // a plaqueta "Hoje" já diz o dia; fica só a hora
        : [
            rotuloDoDiaDaVistoria(vistoria.dataPlanejada, hoje),
            grupo === 'proximas' ? nomeDoDiaDaSemana(vistoria.dataPlanejada) : null,
          ]
            .filter(Boolean)
            .join(' · ')
  const local = [
    vistoria.empreendimentoNome,
    vistoria.unidadeNome,
    vistoria.licenca,
    vistoria.duracaoMinutos ? `${String(vistoria.duracaoMinutos)} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className={cn(
        'relative flex gap-(--e-3) border-t border-(--regra-leve) px-(--e-4) py-(--e-3) transicao-estado hover:bg-(--toque)',
        'md:min-h-(--linha) md:py-(--e-2)',
        GRADE,
        grupo === 'hoje' && 'bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
      )}
    >
      <span className="w-[56px] shrink-0 md:col-start-1 md:row-start-1 md:w-auto">
        {enviada ? null : <Contagem dias={dias} ordem={ordem} />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-(--e-1) md:contents">
        <div className="flex flex-wrap items-center justify-between gap-x-(--e-2) gap-y-(--e-1) md:contents">
          <span className="corpo-medio numero text-(--tinta) md:col-start-2 md:row-start-1">
            {quando}
            {vistoria.horaPlanejada && !enviada ? (
              <span className={quando ? 'text-(--tinta-2)' : undefined}>
                {quando ? ' · ' : ''}
                {vistoria.horaPlanejada}
              </span>
            ) : null}
            {grupo === 'atrasadas' ? (
              <span className="sr-only">, {plural(-dias, 'dia', 'dias')} de atraso</span>
            ) : null}
          </span>
          <span className="md:col-start-6 md:row-start-1">
            <SeloDaVistoria situacao={vistoria.situacao} />
          </span>
        </div>

        <div className="flex min-w-0 flex-col md:col-start-3 md:row-start-1">
          <Link
            to={`/campo/${vistoria.id}`}
            className="titulo-secao text-(--tinta) no-underline after:absolute after:inset-0 after:content-[''] hover:underline md:truncate md:corpo-medio"
          >
            {vistoria.titulo}
          </Link>
          <span className="corpo text-(--tinta-2) numero md:truncate">{local}</span>
        </div>

        <div className="flex flex-wrap gap-x-(--e-3) corpo text-(--tinta-2) md:contents">
          <span className="numero md:col-start-4 md:row-start-1">
            {vistoria.itensRegistrados} de {vistoria.totalItens}
            <span className="md:sr-only"> itens</span>
          </span>
          {vistoria.responsavelNome ? (
            <span className="truncate md:col-start-5 md:row-start-1">
              {vistoria.responsavelNome}
            </span>
          ) : null}
        </div>

        {grupo === 'hoje' ? (
          <Botao
            aparencia={proxima ? 'primario' : 'padrao'}
            tamanho="compacto"
            asChild
            className="relative z-[1] mt-(--e-2) w-full md:col-start-7 md:row-start-1 md:mt-0 md:w-auto"
          >
            <Link to={`/campo/${vistoria.id}`} aria-label={`Abrir vistoria ${vistoria.titulo}`}>
              Abrir
            </Link>
          </Botao>
        ) : null}
      </div>
    </li>
  )
}

/** Minhas (padrão) ou Todas: as da equipe. */
const QUAIS_VISTORIAS: readonly OpcaoSegmentada<boolean>[] = [
  { valor: true, rotulo: 'Minhas' },
  { valor: false, rotulo: 'Todas' },
]

/**
 * /campo (ADR-0033 §5): vistorias do responsável por padrão, com "Todas" para ver as da equipe.
 * Grupos pelo hoje da consultoria (nunca o fuso do aparelho): Atrasadas, Hoje, Próximas, Enviadas.
 */
export function PaginaMinhasVistorias() {
  const { atual } = useConsultoria()
  const [somenteMinhas, setSomenteMinhas] = useState(true)
  const titulo = somenteMinhas ? 'Minhas vistorias' : 'Todas as vistorias'

  const consulta = useInfiniteQuery({
    queryKey: ['vistorias', atual.consultoriaId, 'campo', somenteMinhas],
    queryFn: ({ pageParam }) =>
      listarVistorias({
        consultoriaId: atual.consultoriaId,
        ocorrenciaId: null,
        somenteMinhas,
        deslocamento: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (pagina) => pagina.proxima,
  })
  // O hoje do banco (fuso da consultoria) agrupa; sem linhas, o mesmo cálculo pelo fuso dela.
  const hoje = consulta.data?.pages[0]?.hoje ?? hojeNoFuso(new Date(), atual.fuso)
  const total = consulta.data?.pages[0]?.total ?? 0

  const vistorias = consulta.data?.pages.flatMap((p) => p.itens) ?? []
  const grupos = new Map<GrupoDaVistoria, VistoriaDaLista[]>()
  for (const vistoria of vistorias) {
    const grupo = grupoDaVistoria(vistoria.situacao, vistoria.dataPlanejada, hoje)
    if (grupo) grupos.set(grupo, [...(grupos.get(grupo) ?? []), vistoria])
  }
  const abertas = vistorias.filter((v) => {
    const grupo = grupoDaVistoria(v.situacao, v.dataPlanejada, hoje)
    return grupo !== null && grupo !== 'enviadas'
  }).length

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando as vistorias" linhas={4} />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar as vistorias."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (grupos.size === 0) {
    conteudo = <EstadoVazio icone="calendar" titulo="Nenhuma vistoria" />
  } else {
    let ordem = 0
    conteudo = (
      <div className={cn(classePainel, 'flex flex-col overflow-hidden')}>
        <div
          aria-hidden
          className={cn('hidden h-10 px-(--e-4) rotulo-maiusculo text-(--tinta-2) md:grid', GRADE)}
        >
          <span>Faltam</span>
          <span>Quando</span>
          <span>Vistoria</span>
          <span>Itens</span>
          <span>Responsável</span>
          <span>Situação</span>
          <span />
        </div>
        {GRUPOS_DA_VISTORIA.filter((g) => grupos.has(g)).map((grupo) => {
          const lista = ordenar(grupo, grupos.get(grupo) ?? [])
          return (
            <section key={grupo} aria-labelledby={`grupo-${grupo}`}>
              <div className="flex h-11 items-center gap-(--e-2) border-t border-(--regra-forte) bg-(--chao) px-(--e-4)">
                <h2
                  id={`grupo-${grupo}`}
                  className={cn(
                    'titulo-secao',
                    grupo === 'atrasadas' ? 'text-(--atraso-texto)' : 'text-(--tinta)',
                  )}
                >
                  {ROTULO_DO_GRUPO[grupo]}
                </h2>
                <span className="min-w-6 rounded-(--raio-mini) bg-(--aperto) px-(--e-1) text-center text-xs font-semibold text-(--tinta-2) numero">
                  {lista.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {lista.map((vistoria, indice) => (
                  <LinhaDaVistoria
                    key={vistoria.id}
                    vistoria={vistoria}
                    grupo={grupo}
                    proxima={grupo === 'hoje' && indice === 0}
                    hoje={hoje}
                    fuso={atual.fuso}
                    ordem={ordem++}
                  />
                ))}
              </ul>
            </section>
          )
        })}
        <div className="flex min-h-12 items-center gap-(--e-3) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {vistorias.length} de {total}
          </span>
          {consulta.hasNextPage ? (
            <Botao
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais vistorias
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Pagina
      titulo={titulo}
      meta={
        <span className="numero">
          {nomeDoDiaDaSemana(hoje)}, {formatarDataCivil(hoje)}
          {consulta.isSuccess ? ` · ${plural(abertas, 'aberta', 'abertas')}` : null}
        </span>
      }
      acao={
        <Segmentado
          rotulo="Quais vistorias"
          opcoes={QUAIS_VISTORIAS}
          valor={somenteMinhas}
          aoMudar={setSomenteMinhas}
          larguraTotalNoCelular
        />
      }
    >
      {conteudo}
    </Pagina>
  )
}
