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
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { listarVistorias, type VistoriaDaLista } from '@/lib/api/vistorias'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'

import { classeAlvo, classeCartao } from './estilos'
import { ColunaCampo, SeloDaVistoria } from './pecas'

function plural(n: number, um: string, varios: string) {
  return `${String(n)} ${n === 1 ? um : varios}`
}

/** Atrasadas da mais antiga; Hoje e Próximas por data e hora; Enviadas da mais recente. */
function ordenar(grupo: GrupoDaVistoria, lista: VistoriaDaLista[]): VistoriaDaLista[] {
  const chave = (v: VistoriaDaLista) => `${v.dataPlanejada} ${v.horaPlanejada ?? '99:99'}`
  const ordenada = [...lista].sort((a, b) => chave(a).localeCompare(chave(b)))
  if (grupo !== 'enviadas') return ordenada
  return ordenada.sort((a, b) => (b.enviadaEm ?? '').localeCompare(a.enviadaEm ?? ''))
}

function CartaoDaVistoria({
  vistoria,
  grupo,
  hoje,
  fuso,
}: {
  vistoria: VistoriaDaLista
  grupo: GrupoDaVistoria
  hoje: DataCivil
  fuso: string
}) {
  const atraso = -diferencaEmDias(vistoria.dataPlanejada, hoje)
  const quando =
    grupo === 'enviadas' && vistoria.enviadaEm
      ? `Enviada em ${formatarInstanteComHora(vistoria.enviadaEm, fuso)}`
      : [
          rotuloDoDiaDaVistoria(vistoria.dataPlanejada, hoje),
          grupo === 'proximas' ? nomeDoDiaDaSemana(vistoria.dataPlanejada) : null,
          vistoria.horaPlanejada,
        ]
          .filter(Boolean)
          .join(' · ')
  return (
    <li className={`${classeCartao} flex flex-col gap-(--e-15) p-(--e-3)`}>
      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <SeloDaVistoria situacao={vistoria.situacao} />
        <span className="corpo-medio">
          {quando}
          {grupo === 'atrasadas' ? (
            <span className="text-(--atraso-texto)">
              {' '}
              · {plural(atraso, 'dia', 'dias')} de atraso
            </span>
          ) : null}
        </span>
      </div>
      <h3 className="titulo-secao">
        <Link to={`/campo/${vistoria.id}`}>{vistoria.titulo}</Link>
      </h3>
      <p className="corpo text-(--tinta-2)">
        {[vistoria.empreendimentoNome, vistoria.unidadeNome].join(' · ')}
      </p>
      <p className="flex flex-wrap items-center gap-(--e-3) text-xs text-(--tinta-2)">
        {vistoria.licenca ? (
          <span className="inline-flex items-center gap-(--e-1)">
            <Icone nome="file-text" tamanho={12} />
            {vistoria.licenca}
          </span>
        ) : null}
        {vistoria.duracaoMinutos ? (
          <span className="inline-flex items-center gap-(--e-1)">
            <Icone nome="clock" tamanho={12} />
            {vistoria.duracaoMinutos} min
          </span>
        ) : null}
        <span>
          {vistoria.itensRegistrados} de {vistoria.totalItens} itens
        </span>
        {vistoria.responsavelNome ? <span>{vistoria.responsavelNome}</span> : null}
      </p>
      {grupo === 'hoje' ? (
        <Botao aparencia="primario" larguraTotal asChild className={classeAlvo}>
          <Link to={`/campo/${vistoria.id}`} aria-label={`Abrir vistoria ${vistoria.titulo}`}>
            Abrir vistoria
          </Link>
        </Botao>
      ) : null}
    </li>
  )
}

/**
 * /campo (ADR-0033 §5): vistorias do responsável por padrão, com "Todas" para ver as da equipe.
 * Grupos pelo hoje da consultoria (nunca o fuso do aparelho): Atrasadas, Hoje, Próximas, Enviadas.
 */
export function PaginaMinhasVistorias() {
  const { atual } = useConsultoria()
  const [somenteMinhas, setSomenteMinhas] = useState(true)
  const titulo = somenteMinhas ? 'Minhas vistorias' : 'Todas as vistorias'

  useEffect(() => {
    document.title = `${titulo} · Grama`
  }, [titulo])

  const consulta = useInfiniteQuery({
    queryKey: ['vistorias', atual.consultoriaId, 'campo', somenteMinhas],
    queryFn: ({ pageParam }) =>
      listarVistorias({ ocorrenciaId: null, somenteMinhas, deslocamento: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (pagina) => pagina.proxima,
  })
  // O hoje do banco (fuso da consultoria) agrupa; sem linhas, o mesmo cálculo pelo fuso dela.
  const hoje = consulta.data?.pages[0]?.hoje ?? hojeNoFuso(new Date(), atual.fuso)

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

  return (
    <ColunaCampo>
      <header className="flex flex-col gap-(--e-1)">
        <p className="corpo text-(--tinta-2)">
          {nomeDoDiaDaSemana(hoje)}, {formatarDataCivil(hoje)}
        </p>
        <h1 className="titulo-tela text-(--tinta)">{titulo}</h1>
        {consulta.isSuccess ? (
          <p className="corpo text-(--tinta-2)">
            {plural(abertas, 'vistoria aberta', 'vistorias abertas')}
          </p>
        ) : null}
      </header>

      <div role="group" aria-label="Quais vistorias" className="flex gap-(--e-2)">
        <Botao
          className={`${classeAlvo} flex-1`}
          selecionado={somenteMinhas}
          onClick={() => {
            setSomenteMinhas(true)
          }}
        >
          Minhas
        </Botao>
        <Botao
          className={`${classeAlvo} flex-1`}
          selecionado={!somenteMinhas}
          onClick={() => {
            setSomenteMinhas(false)
          }}
        >
          Todas
        </Botao>
      </div>

      {consulta.isPending ? (
        <Carregando rotulo="Carregando as vistorias" linhas={4} />
      ) : consulta.isError ? (
        ehSemPermissao(consulta.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar as vistorias."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        )
      ) : grupos.size === 0 ? (
        <EstadoVazio icone="calendar" titulo="Nenhuma vistoria" />
      ) : (
        <>
          {GRUPOS_DA_VISTORIA.filter((g) => grupos.has(g)).map((grupo) => {
            const lista = ordenar(grupo, grupos.get(grupo) ?? [])
            return (
              <section
                key={grupo}
                aria-labelledby={`grupo-${grupo}`}
                className="flex flex-col gap-(--e-2)"
              >
                <div className="flex items-baseline justify-between">
                  <h2 id={`grupo-${grupo}`} className="titulo-secao text-(--tinta)">
                    {ROTULO_DO_GRUPO[grupo]}
                  </h2>
                  <span className="text-xs text-(--tinta-2)">
                    {plural(lista.length, 'vistoria', 'vistorias')}
                  </span>
                </div>
                <ul className="flex flex-col gap-(--e-2)">
                  {lista.map((vistoria) => (
                    <CartaoDaVistoria
                      key={vistoria.id}
                      vistoria={vistoria}
                      grupo={grupo}
                      hoje={hoje}
                      fuso={atual.fuso}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
          {consulta.hasNextPage ? (
            <Botao
              className={classeAlvo}
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais vistorias
            </Botao>
          ) : null}
        </>
      )}
    </ColunaCampo>
  )
}
