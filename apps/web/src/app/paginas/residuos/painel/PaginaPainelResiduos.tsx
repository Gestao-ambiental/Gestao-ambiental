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
import { AbasResiduos } from '@/app/paginas/residuos/LayoutResiduos'
import {
  TituloDoPainel,
  classeCabecalho,
  classeCelula,
  classeLinha,
  classePainel,
} from '@/app/paginas/residuos/quadro'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Segmentado } from '@/components/ui/segmentado'
import {
  TAMANHO_PAGINA_RESIDUOS,
  painelDeResiduos,
  type LinhaDoPainelDeResiduos,
} from '@/lib/api/residuos'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

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
import { useEmpreendimentoDaUrl } from './comum'
import { FiltroEmpreendimento, Paginacao } from './PecasDoPainel'

const PERIODOS = (Object.keys(ROTULO_DO_PERIODO) as Periodo[]).map((p) => ({
  valor: p,
  rotulo: ROTULO_DO_PERIODO[p],
}))
const AGRUPAMENTOS = (Object.keys(ROTULO_DO_AGRUPAMENTO) as Agrupamento[]).map((a) => ({
  valor: a,
  rotulo: ROTULO_DO_AGRUPAMENTO[a],
}))

function mesCurto(mes: DataCivil): string {
  return rotuloDoMes(mes).replace('/20', '/')
}

/**
 * Barras por mês no verde do sistema (--ok-texto: verde-placa no claro, verde claro no escuro),
 * eixo e rótulos em tinta, valor escrito sobre cada barra (nada depende de passar o mouse).
 */
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
  const soma = serie.reduce((total, s) => total + s.quantidade, 0)
  const titulo = `Quantidade por mês (${ROTULO_DA_UNIDADE_DE_RESIDUO[unidade]})`

  return (
    <figure className={cn(classePainel, 'gap-(--e-4) p-(--e-4) md:p-(--e-5)')}>
      <div className="flex flex-wrap items-start justify-between gap-(--e-3)">
        <div className="flex flex-col gap-(--e-1)">
          <figcaption className="titulo-secao text-(--tinta)">{titulo}</figcaption>
          <span className="numero-grande text-(--tinta)">
            {formatarQuantidade(Math.round(soma * 10_000) / 10_000, unidade)}
          </span>
        </div>
        {unidades.length > 1 ? (
          <Segmentado
            rotulo="Unidade do gráfico"
            opcoes={unidades.map((u) => ({ valor: u, rotulo: ROTULO_DA_UNIDADE_DE_RESIDUO[u] }))}
            valor={unidade}
            aoMudar={setEscolhida}
          />
        ) : null}
      </div>
      <div className="-mx-(--e-4) min-w-0 overflow-x-auto px-(--e-4) md:mx-0 md:px-0">
        <div className="relative min-w-max">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-(--e-6) border-t border-dashed border-(--regra)"
          />
          <span
            aria-hidden="true"
            className="absolute top-(--e-2) left-0 text-xs font-[650] text-(--tinta) numero"
          >
            {formatarQuantidade(maximo, unidade)}
          </span>
          <ol
            aria-label={titulo}
            className="flex h-52 items-end gap-(--e-1) border-b border-(--tinta-3) pt-(--e-12)"
          >
            {serie.map(({ mes, quantidade }) => {
              const altura = maximo > 0 ? (quantidade / maximo) * 100 : 0
              const valor = formatarQuantidade(quantidade, unidade)
              return (
                <li key={mes} className="flex h-full w-12 flex-col items-center justify-end">
                  <span className="sr-only">{`${rotuloDoMes(mes)}: ${valor}`}</span>
                  {quantidade > 0 ? (
                    <span
                      aria-hidden="true"
                      className="pb-(--e-1) text-[11px] font-[700] whitespace-nowrap text-(--tinta) numero"
                    >
                      {valor}
                    </span>
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="w-8 rounded-t-(--raio-mini) bg-(--ok-texto)"
                    style={{ height: quantidade > 0 ? `max(${String(altura)}%, 2px)` : 0 }}
                  />
                </li>
              )
            })}
          </ol>
          <div aria-hidden="true" className="flex gap-(--e-1) pt-(--e-2)">
            {meses.map((mes) => (
              <span key={mes} className="w-12 text-center text-xs text-(--tinta) numero">
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
  aoMudarPor,
}: {
  linhas: readonly LinhaDoPainelDeResiduos[]
  por: Agrupamento
  aoMudarPor: (por: Agrupamento) => void
}) {
  const [pagina, setPagina] = useState(0)
  const grupos = agrupar(linhas, por)
  const inicio = pagina * TAMANHO_PAGINA_RESIDUOS
  const visiveis = grupos.slice(inicio, inicio + TAMANHO_PAGINA_RESIDUOS)
  const mostraMtrs = por === 'residuo'

  return (
    <section aria-labelledby="titulo-soma-residuos" className={classePainel}>
      <TituloDoPainel
        id="titulo-soma-residuos"
        acoes={
          <Segmentado
            rotulo="Somar por"
            opcoes={AGRUPAMENTOS}
            valor={por}
            aoMudar={(novo) => {
              setPagina(0)
              aoMudarPor(novo)
            }}
          />
        }
      >
        Total por {ROTULO_DO_AGRUPAMENTO[por].toLowerCase()}
      </TituloDoPainel>
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
              <tr key={g.chave} className={classeLinha}>
                <th scope="row" className={`${classeCelula} text-left font-normal numero`}>
                  {g.rotulo}
                </th>
                <td className={`${classeCelula} text-right whitespace-nowrap corpo-medio numero`}>
                  {formatarQuantidade(g.quantidade, g.unidade)}
                </td>
                {mostraMtrs ? (
                  <td className={`${classeCelula} text-right numero`}>{g.mtrs}</td>
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
    </section>
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
        className={classePainel}
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
          key={`${de}:${empreendimentoId ?? ''}`}
          linhas={consulta.data}
          por={por}
          aoMudarPor={setPor}
        />
      </>
    )
  }

  return (
    <Pagina titulo="Painel de resíduos">
      <AbasResiduos />
      <div className="flex flex-wrap items-center gap-(--e-2)">
        <FiltroEmpreendimento
          consultoriaId={cid}
          valor={empreendimentoId}
          aoMudar={mudarEmpreendimento}
          rotuloTodos="Toda a consultoria"
        />
        <div className="max-w-full overflow-x-auto">
          <Segmentado rotulo="Período" opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
        </div>
      </div>
      {conteudo}
    </Pagina>
  )
}
