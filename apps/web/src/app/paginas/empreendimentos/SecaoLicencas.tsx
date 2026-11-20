import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { TAMANHO_PAGINA_LICENCAS, listarLicencasDoEmpreendimento } from '@/lib/api/licencas'
import { cn } from '@/lib/utils'

import type { PropsDaSecao } from './secoes-do-empreendimento'
import { TabelaLicencas } from './TabelaLicencas'

/**
 * Seção "Licenças" do empreendimento (Protótipo 09; EMP-02): filtro rápido por unidade, busca e o
 * quadro de licenças com validade e situação calculada. O filtro de unidade vive na página, porque
 * "Cadastrar licença" no cabeçalho já leva a unidade escolhida.
 */
export function SecaoLicencas({
  empreendimento,
  unidades,
  hoje,
  ehGestao,
  unidadeFiltro,
  aoFiltrarUnidade,
}: PropsDaSecao) {
  const id = empreendimento.id
  const { atual } = useConsultoria()
  const [busca, setBusca] = useState('')
  const [ordemDecrescente, setOrdemDecrescente] = useState(true)
  const licencas = useInfiniteQuery({
    queryKey: ['licencas', id],
    queryFn: ({ pageParam }) => listarLicencasDoEmpreendimento(id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_LICENCAS && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })

  const listaUnidades = unidades.data ?? []
  const todasLicencas = licencas.data?.pages.flatMap((p) => p.itens) ?? []
  const termo = busca.trim().toLowerCase()
  const daBusca = todasLicencas.filter(
    (l) =>
      !termo ||
      [l.numero, l.orgao, l.sigla, l.tipoNome, l.unidadeNome].some((v) =>
        v?.toLowerCase().includes(termo),
      ),
  )
  const filtradas = daBusca
    .filter((l) => !unidadeFiltro || l.unidadeId === unidadeFiltro)
    .sort(
      (a, b) =>
        (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0) *
        (ordemDecrescente ? -1 : 1),
    )
  const chips = [
    { id: null, rotulo: 'Todos', contagem: daBusca.length },
    ...listaUnidades.map((u) => ({
      id: u.id,
      rotulo: u.nome,
      contagem: daBusca.filter((l) => l.unidadeId === u.id).length,
    })),
  ]
  const filtrando = Boolean(termo || unidadeFiltro)
  const contagemLicencas = (n: number) => `${String(n)} ${n === 1 ? 'licença' : 'licenças'}`

  return (
    <section
      aria-labelledby="titulo-licencas"
      className="flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
    >
      <div className="flex flex-wrap items-center gap-x-(--e-5) gap-y-(--e-2) border-b px-(--e-4) pt-(--e-2) max-md:pb-(--e-3)">
        <h2 id="titulo-licencas" className="titulo-secao text-(--tinta)">
          Licenças
        </h2>
        <div
          role="group"
          aria-label="Filtrar por unidade"
          className="flex max-w-full items-center gap-(--e-4) self-stretch overflow-x-auto overflow-y-hidden max-md:order-last max-md:w-full md:overflow-visible"
        >
          {unidades.isPending
            ? null
            : chips.map((chip) => {
                const ligado = unidadeFiltro === chip.id
                return (
                  <button
                    key={chip.id ?? 'todos'}
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => {
                      aoFiltrarUnidade(chip.id)
                    }}
                    className={cn(
                      '-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-(--e-2) border-b-[3px] corpo-medio whitespace-nowrap transicao-estado',
                      ligado
                        ? 'border-(--marca-linha) text-(--tinta)'
                        : 'border-transparent text-(--tinta-2) hover:text-(--tinta)',
                    )}
                  >
                    {chip.rotulo}
                    <span
                      className={cn(
                        'min-w-6 rounded-(--raio-mini) px-(--e-1) text-center text-xs font-[800] numero',
                        ligado ? 'bg-(--tinta) text-(--folha)' : 'bg-(--aperto) text-(--tinta-2)',
                      )}
                    >
                      {chip.contagem}
                    </span>
                  </button>
                )
              })}
        </div>
        <label className="relative flex min-w-0 items-center max-md:w-full md:ml-auto md:w-[240px] md:pb-(--e-2)">
          <span className="sr-only">Buscar neste empreendimento</span>
          <Icone
            nome="search"
            className="pointer-events-none absolute left-(--e-3) text-(--icone-2)"
          />
          <input
            type="search"
            value={busca}
            placeholder="Número, tipo ou órgão"
            onChange={(evento) => {
              setBusca(evento.target.value)
            }}
            className={cn(classeCampo, 'pl-(--e-8)')}
          />
        </label>
      </div>

      {unidades.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar as unidades."
          aoTentarDeNovo={() => void unidades.refetch()}
          className="m-(--e-3)"
        />
      ) : null}

      {licencas.isPending ? (
        <Carregando rotulo="Carregando licenças" linhas={3} className="border-0" />
      ) : licencas.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar as licenças."
          aoTentarDeNovo={() => void licencas.refetch()}
          className="m-(--e-3)"
        />
      ) : (
        <TabelaLicencas
          itens={filtradas}
          totalSemFiltro={todasLicencas.length}
          hoje={hoje}
          fuso={atual.fuso}
          podeEditar={ehGestao}
          ordemDecrescente={ordemDecrescente}
          aoInverterOrdem={() => {
            setOrdemDecrescente((d) => !d)
          }}
          aoLimparFiltros={() => {
            setBusca('')
            aoFiltrarUnidade(null)
          }}
        />
      )}
      {todasLicencas.length > 0 ? (
        <div className="flex items-center gap-(--e-2) px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero" aria-live="polite">
            {filtrando
              ? `${String(filtradas.length)} de ${contagemLicencas(todasLicencas.length)}`
              : contagemLicencas(todasLicencas.length)}
          </span>
          {licencas.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={licencas.isFetchingNextPage}
              onClick={() => void licencas.fetchNextPage()}
            >
              Mostrar mais
            </Botao>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
