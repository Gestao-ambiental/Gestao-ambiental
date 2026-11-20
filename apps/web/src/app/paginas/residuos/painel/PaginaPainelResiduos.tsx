import {
  ROTULO_DA_UNIDADE_DE_RESIDUO,
  formatarQuantidade,
  hojeNoFuso,
  rotuloDoMes,
  type DataCivil,
  type UnidadeResiduo,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import {
  TAMANHO_PAGINA_RESIDUOS,
  painelDeResiduos,
  type LinhaDoPainelDeResiduos,
} from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'

import {
  ROTULO_DO_AGRUPAMENTO,
  ROTULO_DO_PERIODO,
  agrupar,
  intervaloDoPeriodo,
  mesesDoIntervalo,
  serieMensal,
  unidadesPresentes,
  type Agrupamento,
  type Periodo,
} from './agrupar'
import { classeCabecalho, classeCelula, classeSelect, useEmpreendimentoDaUrl } from './comum'
import { FiltroEmpreendimento, Paginacao } from './PecasDoPainel'

const PERIODOS = Object.keys(ROTULO_DO_PERIODO) as Periodo[]
const AGRUPAMENTOS = Object.keys(ROTULO_DO_AGRUPAMENTO) as Agrupamento[]

function mesCurto(mes: DataCivil): string {
  return rotuloDoMes(mes).replace('/20', '/')
}

function GraficoMensal({
  linhas,
  meses,
}: {
  linhas: readonly LinhaDoPainelDeResiduos[]
  meses: readonly DataCivil[]
}) {
  const unidades = unidadesPresentes(linhas)
  const [escolhida, setEscolhida] = useState<UnidadeResiduo | null>(null)
  const unidade = escolhida && unidades.includes(escolhida) ? escolhida : (unidades[0] ?? 't')
  const serie = serieMensal(linhas, meses, unidade)
  const maximo = Math.max(...serie.map((s) => s.quantidade), 0)
  const titulo = `Quantidade por mês (${ROTULO_DA_UNIDADE_DE_RESIDUO[unidade]})`

  return (
    <figure className="flex min-w-0 flex-col gap-(--e-3) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) shadow-cartao">
      <div className="flex flex-wrap items-end justify-between gap-(--e-2)">
        <figcaption className="titulo-secao text-(--tinta)">{titulo}</figcaption>
        {unidades.length > 1 ? (
          <label className="flex min-w-0 flex-col gap-(--e-1)">
            <span className="rotulo">Unidade do gráfico</span>
            <select
              className={classeSelect}
              value={unidade}
              onChange={(evento) => {
                setEscolhida(unidades.find((u) => u === evento.target.value) ?? null)
              }}
            >
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {ROTULO_DA_UNIDADE_DE_RESIDUO[u]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <div className="relative min-w-max">
          <span
            aria-hidden="true"
            className="absolute top-0 left-0 text-xs text-(--tinta) tabular-nums"
          >
            {formatarQuantidade(maximo, unidade)}
          </span>
          <ol
            aria-label={titulo}
            className="flex h-44 items-end gap-(--e-1) border-b border-(--regra-forte) pt-(--e-6)"
          >
            {serie.map(({ mes, quantidade }) => {
              const altura = maximo > 0 ? (quantidade / maximo) * 100 : 0
              const valor = formatarQuantidade(quantidade, unidade)
              return (
                <li
                  key={mes}
                  className="group relative flex h-full w-11 flex-col items-center justify-end"
                >
                  <span className="sr-only">{`${rotuloDoMes(mes)}: ${valor}`}</span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-(--e-6) z-10 hidden rounded-(--raio) border bg-(--folha) px-(--e-1) text-xs whitespace-nowrap text-(--tinta) shadow-cartao group-hover:block"
                  >
                    {valor}
                  </span>
                  <span
                    aria-hidden="true"
                    className="w-7 rounded-t-[4px] bg-(--marca-linha)"
                    style={{ height: quantidade > 0 ? `max(${String(altura)}%, 2px)` : 0 }}
                  />
                </li>
              )
            })}
          </ol>
          <div aria-hidden="true" className="flex gap-(--e-1) pt-(--e-1)">
            {meses.map((mes) => (
              <span key={mes} className="w-11 text-center text-xs text-(--tinta)">
                {mesCurto(mes)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}

function TabelaAgrupada({
  linhas,
  por,
}: {
  linhas: readonly LinhaDoPainelDeResiduos[]
  por: Agrupamento
}) {
  const [pagina, setPagina] = useState(0)
  const grupos = agrupar(linhas, por)
  const inicio = pagina * TAMANHO_PAGINA_RESIDUOS
  const visiveis = grupos.slice(inicio, inicio + TAMANHO_PAGINA_RESIDUOS)
  const mostraMtrs = por === 'residuo'

  return (
    <div className="min-w-0 rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse corpo">
          <caption className="sr-only">{`Quantidade por ${ROTULO_DO_AGRUPAMENTO[por].toLowerCase()}`}</caption>
          <thead>
            <tr>
              <th scope="col" className={classeCabecalho}>
                {ROTULO_DO_AGRUPAMENTO[por]}
              </th>
              <th scope="col" className={`${classeCabecalho} text-right`}>
                Quantidade
              </th>
              {mostraMtrs ? (
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  MTRs
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((g) => (
              <tr key={g.chave}>
                <th scope="row" className={`${classeCelula} text-left font-normal`}>
                  {g.rotulo}
                </th>
                <td className={`${classeCelula} text-right whitespace-nowrap tabular-nums`}>
                  {formatarQuantidade(g.quantidade, g.unidade)}
                </td>
                {mostraMtrs ? (
                  <td className={`${classeCelula} text-right tabular-nums`}>{g.mtrs}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao
        pagina={pagina}
        tamanho={TAMANHO_PAGINA_RESIDUOS}
        total={grupos.length}
        aoMudar={setPagina}
      />
    </div>
  )
}

/**
 * Painel de resíduos (fase 1): quantidade dos MTRs (cancelados não entram) por resíduo,
 * destinador ou mês, de um empreendimento (?empreendimento=) ou da consultoria inteira, com
 * gráfico de barras por mês. Massa em t, volume em m³ e unidades em un; nunca soma entre elas.
 */
export function PaginaPainelResiduos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [empreendimentoId, mudarEmpreendimento] = useEmpreendimentoDaUrl()
  const [periodo, setPeriodo] = useState<Periodo>('ultimos_12_meses')
  const [por, setPor] = useState<Agrupamento>('residuo')
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const { de, ate } = intervaloDoPeriodo(periodo, hoje)

  const consulta = useQuery({
    queryKey: ['residuos', 'painel', cid, empreendimentoId, de, ate],
    queryFn: () => painelDeResiduos(cid, { empreendimentoId, de, ate }),
  })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando o painel" linhas={6} />
  } else if (consulta.isError) {
    conteudo = ehSemPermissao(consulta.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar o painel."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (consulta.data.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="chart-column"
        titulo="Nenhum MTR no período"
        acaoPrincipal={
          empreendimentoId || periodo !== 'ultimos_12_meses' ? (
            <Botao
              onClick={() => {
                mudarEmpreendimento(null)
                setPeriodo('ultimos_12_meses')
              }}
            >
              Limpar filtros
            </Botao>
          ) : undefined
        }
      />
    )
  } else {
    conteudo = (
      <>
        <GraficoMensal linhas={consulta.data} meses={mesesDoIntervalo(de, ate)} />
        <TabelaAgrupada
          key={`${por}:${de}:${empreendimentoId ?? ''}`}
          linhas={consulta.data}
          por={por}
        />
      </>
    )
  }

  return (
    <Pagina titulo="Painel de resíduos">
      <div className="flex flex-col gap-(--e-3) sm:flex-row sm:flex-wrap sm:items-end">
        <FiltroEmpreendimento
          consultoriaId={cid}
          valor={empreendimentoId}
          aoMudar={mudarEmpreendimento}
          rotuloTodos="Toda a consultoria"
        />
        <label className="flex min-w-0 flex-col gap-(--e-1)">
          <span className="rotulo">Período</span>
          <select
            className={classeSelect}
            value={periodo}
            onChange={(evento) => {
              setPeriodo(PERIODOS.find((p) => p === evento.target.value) ?? 'ultimos_12_meses')
            }}
          >
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_DO_PERIODO[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-(--e-1)">
          <span className="rotulo">Somar por</span>
          <select
            className={classeSelect}
            value={por}
            onChange={(evento) => {
              setPor(AGRUPAMENTOS.find((a) => a === evento.target.value) ?? 'residuo')
            }}
          >
            {AGRUPAMENTOS.map((a) => (
              <option key={a} value={a}>
                {ROTULO_DO_AGRUPAMENTO[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {conteudo}
    </Pagina>
  )
}
