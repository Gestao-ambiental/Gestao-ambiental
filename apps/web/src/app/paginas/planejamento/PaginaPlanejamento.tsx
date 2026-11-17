import { formatarDataCivil, hojeNoFuso, type DataCivil } from '@gestao-ambiental/domain'
import {
  cenarioPorTemas,
  planejar,
  type Aglomeracao,
  type Atividade,
  type Catalogo,
  type Estrategia,
  type ItemDoPlano,
  type Parametros,
} from '@gestao-ambiental/planejamento'
import provisorios from '@gestao-ambiental/planejamento/exemplos/parametros-provisorios.json'
import temasProvisorios from '@gestao-ambiental/planejamento/exemplos/temas-provisorios.json'
import { useMemo, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Selo } from '@/components/ui/selo'

import { Pagina } from '../Pagina'
import { formatarHoras, NOMES_DOS_MESES, nomeDoMes } from './formatos'
import { GraficoCarga, type MesDoGrafico } from './GraficoCarga'

const POR_PAGINA = 10

const ESTRATEGIAS: readonly { id: Estrategia; rotulo: string }[] = [
  { id: 'so_prazo', rotulo: 'Só pelo prazo' },
  { id: 'folga_sem_gravidade', rotulo: 'Pela folga, sem gravidade' },
  { id: 'metodo_sem_antecipacao', rotulo: 'Método sem antecipar' },
  { id: 'metodo_completo', rotulo: 'Método completo' },
]

interface LinhaDeEstrategia {
  id: Estrategia
  rotulo: string
  pico: number
  mesesAcima: number
  horasAcima: number
  zonaCritica: number
  atrasadas: number
}

const CATALOGO: Catalogo = temasProvisorios
const TRAVA_DO_TEMA = new Map(CATALOGO.temas.map((tema) => [tema.id, tema.trava]))

function rotuloDaTrava(atividade: Atividade): string {
  const trava = TRAVA_DO_TEMA.get(atividade.grupo ?? '') ?? ''
  return CATALOGO.travas[trava]?.rotulo ?? '—'
}

/** Horas da atividade que o nivelamento pode levar para outro mês. */
function horasMoveis(atividade: Atividade): number {
  if (atividade.antecipabilidade === 'antecipavel') return atividade.esforcoHoras
  if (atividade.antecipabilidade === 'parcial') {
    return atividade.esforcoHoras * (atividade.fracaoAntecipavel ?? 0)
  }
  return 0
}

interface LinhaDeTrava {
  trava: string
  atividades: number
  horas: number
  horasMoveis: number
}

interface Simulacao {
  meses: MesDoGrafico[]
  picoRecomendado: number
  picoAntecipado: number
  mesesAcima: number
  horasAcima: number
  aglomeracoes: Aglomeracao[]
  estrategias: LinhaDeEstrategia[]
  travasDoPico: LinhaDeTrava[]
  triagem: { item: ItemDoPlano; atividade: Atividade }[]
}

/** Inteiro entre `minimo` e `maximo`, ou `null` se o texto não for isso. */
function lerInteiro(texto: string, minimo: number, maximo: number): number | null {
  if (!/^\d+$/.test(texto.trim())) return null
  const valor = Number(texto)
  return valor >= minimo && valor <= maximo ? valor : null
}

function simular(
  ano: number,
  hoje: DataCivil,
  capacidade: number,
  porMes: number,
  noPico: number,
  mesDePico: number,
): Simulacao | null {
  const carteira = cenarioPorTemas({
    semente: 1,
    ano,
    porMes,
    mesDePico,
    noPico,
    catalogo: CATALOGO,
  })
  const prefixoDoPico = `${String(ano)}-${String(mesDePico).padStart(2, '0')}`
  const porTrava = new Map<string, LinhaDeTrava>()
  for (const atividade of carteira.atividades) {
    if (!atividade.prazo?.startsWith(prefixoDoPico)) continue
    const trava = rotuloDaTrava(atividade)
    const linha = porTrava.get(trava) ?? { trava, atividades: 0, horas: 0, horasMoveis: 0 }
    linha.atividades += 1
    linha.horas += atividade.esforcoHoras
    linha.horasMoveis += horasMoveis(atividade)
    porTrava.set(trava, linha)
  }
  const travasDoPico = [...porTrava.values()].sort((a, b) => b.horas - a.horas)
  const parametros: Parametros = { ...provisorios, capacidadeMensalHoras: capacidade }
  const planos = ESTRATEGIAS.map((e) => ({
    ...e,
    resultado: planejar(carteira, parametros, hoje, e.id),
  }))
  const estrategias: LinhaDeEstrategia[] = []
  for (const { id, rotulo, resultado } of planos) {
    if (!resultado.ok) return null
    const { metricas } = resultado.plano
    estrategias.push({
      id,
      rotulo,
      pico: metricas.picoHoras,
      mesesAcima: metricas.mesesAcimaDaCapacidade ?? 0,
      horasAcima: metricas.horasAcimaDaCapacidade ?? 0,
      zonaCritica: metricas.zonaCritica,
      atrasadas: metricas.atrasadas,
    })
  }
  const recomendado = planos.find((p) => p.id === 'metodo_sem_antecipacao')?.resultado
  const antecipado = planos.find((p) => p.id === 'metodo_completo')?.resultado
  if (!recomendado?.ok || !antecipado?.ok) return null

  const porId = new Map(carteira.atividades.map((a) => [a.id, a]))
  const itens = new Map(antecipado.plano.itens.map((i) => [i.atividadeId, i]))
  return {
    meses: antecipado.plano.cargaMensal.map((m, i) => ({
      mes: m.mes,
      recomendada: recomendado.plano.cargaMensal[i]?.horas ?? 0,
      antecipada: m.horas,
    })),
    picoRecomendado: recomendado.plano.metricas.picoHoras,
    picoAntecipado: antecipado.plano.metricas.picoHoras,
    mesesAcima: antecipado.plano.metricas.mesesAcimaDaCapacidade ?? 0,
    horasAcima: antecipado.plano.metricas.horasAcimaDaCapacidade ?? 0,
    aglomeracoes: antecipado.plano.aglomeracoes,
    estrategias,
    travasDoPico,
    triagem: antecipado.plano.triagem.flatMap((id) => {
      const item = itens.get(id)
      const atividade = porId.get(id)
      return item && atividade ? [{ item, atividade }] : []
    }),
  }
}

const classeCabecalho = 'h-10 border-b px-(--space-100) text-left whitespace-nowrap rotulo'
const classeCelula = 'h-10 border-b px-(--space-100) whitespace-nowrap'

/**
 * /planejamento: o método de planejamento antecipado rodando sobre uma carteira simulada (prazos
 * constantes por mês e um pico em março). Nenhum dado da consultoria entra aqui; a tela existe
 * para experimentar as regras antes de ligá-las às licenças.
 */
export function PaginaPlanejamento() {
  const { atual } = useConsultoria()
  const hojeReal = hojeNoFuso(new Date(), atual.fuso)
  const ano = Number(hojeReal.slice(0, 4)) + 1

  const [hoje, setHoje] = useState<DataCivil>(hojeReal)
  const [capacidade, setCapacidade] = useState('900')
  const [porMes, setPorMes] = useState('30')
  const [noPico, setNoPico] = useState('130')
  const [mesDePico, setMesDePico] = useState(3)
  const [pagina, setPagina] = useState(0)

  const capacidadeLida = lerInteiro(capacidade, 1, 100000)
  const porMesLido = lerInteiro(porMes, 0, 300)
  const noPicoLido = lerInteiro(noPico, 0, 600)

  const simulacao = useMemo(
    () =>
      capacidadeLida === null || porMesLido === null || noPicoLido === null
        ? null
        : simular(ano, hoje, capacidadeLida, porMesLido, noPicoLido, mesDePico),
    [ano, hoje, capacidadeLida, porMesLido, noPicoLido, mesDePico],
  )

  const mudar = (definir: (valor: string) => void) => (valor: string) => {
    definir(valor)
    setPagina(0)
  }

  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Planejamento">
        <SemPermissao />
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Planejamento">
      <div>
        <Selo tom="andamento">Cenário simulado</Selo>
      </div>

      <form
        className="grid grid-cols-2 gap-(--space-150) rounded-(--radius) border bg-(--surface) p-(--space-150) md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0"
        onSubmit={(evento) => {
          evento.preventDefault()
        }}
      >
        <CampoData
          rotulo="Planejando em"
          valor={hoje}
          hoje={hojeReal}
          maximo={`${String(ano)}-12-31` as DataCivil}
          aoMudar={(data) => {
            if (data) {
              setHoje(data)
              setPagina(0)
            }
          }}
        />
        <CampoTexto
          rotulo="Capacidade por mês (h)"
          inputMode="numeric"
          value={capacidade}
          erro={capacidadeLida === null ? 'Informe um número de horas' : undefined}
          onChange={(evento) => {
            mudar(setCapacidade)(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Prazos por mês"
          inputMode="numeric"
          value={porMes}
          erro={porMesLido === null ? 'Informe de 0 a 300' : undefined}
          onChange={(evento) => {
            mudar(setPorMes)(evento.target.value)
          }}
        />
        <CampoTexto
          rotulo="Prazos no pico"
          inputMode="numeric"
          value={noPico}
          erro={noPicoLido === null ? 'Informe de 0 a 600' : undefined}
          onChange={(evento) => {
            mudar(setNoPico)(evento.target.value)
          }}
        />
        <div className="flex flex-col gap-(--space-050)">
          <label htmlFor="mes-do-pico" className="flex min-h-5 items-center rotulo">
            Mês do pico
          </label>
          <select
            id="mes-do-pico"
            className="h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus) focus:shadow-[0_0_0_1px_var(--border-focus)]"
            value={mesDePico}
            onChange={(evento) => {
              setMesDePico(Number(evento.target.value))
              setPagina(0)
            }}
          >
            {NOMES_DOS_MESES.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </div>
      </form>

      {capacidadeLida === null || porMesLido === null || noPicoLido === null ? null : !simulacao ? (
        <EstadoErro
          titulo="Não foi possível simular"
          descricao="Confira os valores do cenário e tente de novo."
        />
      ) : (
        <Resultado
          simulacao={simulacao}
          capacidade={capacidadeLida}
          pagina={pagina}
          aoMudarPagina={setPagina}
        />
      )}
    </Pagina>
  )
}

function Resultado({
  simulacao,
  capacidade,
  pagina,
  aoMudarPagina,
}: {
  simulacao: Simulacao
  capacidade: number
  pagina: number
  aoMudarPagina: (pagina: number) => void
}) {
  const { aglomeracoes, triagem } = simulacao
  const paginas = Math.max(1, Math.ceil(triagem.length / POR_PAGINA))
  const visiveis = triagem.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  return (
    <>
      <dl className="grid grid-cols-2 gap-(--space-150) md:grid-cols-4">
        <Numero
          rotulo="Pico na posição recomendada"
          valor={formatarHoras(simulacao.picoRecomendado)}
        />
        <Numero rotulo="Pico com antecipação" valor={formatarHoras(simulacao.picoAntecipado)} />
        <Numero
          rotulo="Meses acima da capacidade"
          valor={String(simulacao.mesesAcima)}
          detalhe={simulacao.horasAcima > 0 ? formatarHoras(simulacao.horasAcima) : undefined}
        />
        <Numero rotulo="Para iniciar já" valor={String(triagem.length)} />
      </dl>

      <section
        aria-labelledby="titulo-carga"
        className="flex flex-col gap-(--space-150) rounded-(--radius) border bg-(--surface) p-(--space-150)"
      >
        <h2 id="titulo-carga" className="titulo-secao text-(--text)">
          Carga mensal
        </h2>
        <GraficoCarga meses={simulacao.meses} capacidade={capacidade} />
      </section>

      <section aria-labelledby="titulo-estrategias" className="flex flex-col gap-(--space-100)">
        <h2 id="titulo-estrategias" className="titulo-secao text-(--text)">
          Estratégias
        </h2>
        <div className="overflow-auto rounded-(--radius) border bg-(--surface)">
          <table className="w-full border-collapse corpo">
            <thead>
              <tr>
                <th scope="col" className={`${classeCabecalho} pl-(--space-150)`}>
                  Estratégia
                </th>
                <th scope="col" className={classeCabecalho}>
                  Pico mensal
                </th>
                <th scope="col" className={classeCabecalho}>
                  Meses acima
                </th>
                <th scope="col" className={classeCabecalho}>
                  Horas acima
                </th>
                <th scope="col" className={classeCabecalho}>
                  Terminam dentro da margem
                </th>
                <th scope="col" className={classeCabecalho}>
                  Atrasadas
                </th>
              </tr>
            </thead>
            <tbody>
              {simulacao.estrategias.map((linha) => (
                <tr key={linha.id}>
                  <th
                    scope="row"
                    className={`${classeCelula} pl-(--space-150) text-left corpo-medio`}
                  >
                    {linha.rotulo}
                  </th>
                  <td className={classeCelula}>{formatarHoras(linha.pico)}</td>
                  <td className={classeCelula}>{linha.mesesAcima}</td>
                  <td className={classeCelula}>{formatarHoras(linha.horasAcima)}</td>
                  <td className={classeCelula}>{linha.zonaCritica}</td>
                  <td className={classeCelula}>{linha.atrasadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="titulo-travas" className="flex flex-col gap-(--space-100)">
        <h2 id="titulo-travas" className="titulo-secao text-(--text)">
          Prazos do pico por trava
        </h2>
        {simulacao.travasDoPico.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum prazo no mês de pico"
            className="rounded-(--radius) border bg-(--surface)"
          />
        ) : (
          <div className="overflow-auto rounded-(--radius) border bg-(--surface)">
            <table className="w-full border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={`${classeCabecalho} pl-(--space-150)`}>
                    Trava
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Atividades
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Horas
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Horas que podem ser adiantadas
                  </th>
                </tr>
              </thead>
              <tbody>
                {simulacao.travasDoPico.map((linha) => (
                  <tr key={linha.trava}>
                    <th
                      scope="row"
                      className={`${classeCelula} pl-(--space-150) text-left corpo-medio`}
                    >
                      {linha.trava}
                    </th>
                    <td className={classeCelula}>{linha.atividades}</td>
                    <td className={classeCelula}>{formatarHoras(linha.horas)}</td>
                    <td className={classeCelula}>{formatarHoras(linha.horasMoveis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-alertas" className="flex flex-col gap-(--space-100)">
        <h2 id="titulo-alertas" className="titulo-secao text-(--text)">
          Alertas de aglomeração
        </h2>
        {aglomeracoes.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum mês acima da capacidade"
            icone="circle-check"
            className="rounded-(--radius) border bg-(--surface)"
          />
        ) : (
          <div className="overflow-auto rounded-(--radius) border bg-(--surface)">
            <table className="w-full border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={`${classeCabecalho} pl-(--space-150)`}>
                    Mês
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Previsto
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Acima da capacidade
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Começar a antecipar até
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Atividades a antecipar
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                {aglomeracoes.map((alerta) => (
                  <tr key={alerta.mes}>
                    <th
                      scope="row"
                      className={`${classeCelula} pl-(--space-150) text-left corpo-medio`}
                    >
                      {nomeDoMes(alerta.mes)}
                    </th>
                    <td className={classeCelula}>{formatarHoras(alerta.horasPrevistas)}</td>
                    <td className={classeCelula}>{formatarHoras(alerta.horasAcima)}</td>
                    <td className={classeCelula}>
                      {alerta.comecarAte ? formatarDataCivil(alerta.comecarAte as DataCivil) : '—'}
                    </td>
                    <td className={classeCelula}>{alerta.atividadesAAntecipar}</td>
                    <td className={classeCelula}>
                      {alerta.resolvida ? (
                        <Selo tom="sucesso">Cabe</Selo>
                      ) : (
                        <Selo tom="perigo">
                          Faltam {formatarHoras(alerta.horasAcimaAposAntecipar)}
                        </Selo>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-triagem" className="flex flex-col gap-(--space-100)">
        <h2 id="titulo-triagem" className="titulo-secao text-(--text)">
          Iniciar já
        </h2>
        {triagem.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma atividade para iniciar já"
            icone="circle-check"
            className="rounded-(--radius) border bg-(--surface)"
          />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-(--radius) border bg-(--surface)">
            <div className="overflow-auto">
              <table className="w-full border-collapse corpo">
                <thead>
                  <tr>
                    <th scope="col" className={`${classeCabecalho} pl-(--space-150)`}>
                      Atividade
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Tema
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Trava
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Prazo
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Início recomendado
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Gravidade
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Situação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(({ item, atividade }) => (
                    <tr key={item.atividadeId}>
                      <th
                        scope="row"
                        className={`${classeCelula} pl-(--space-150) text-left corpo-medio`}
                      >
                        {item.atividadeId}
                      </th>
                      <td className={classeCelula}>{atividade.rotulo}</td>
                      <td className={classeCelula}>{rotuloDaTrava(atividade)}</td>
                      <td className={classeCelula}>
                        {formatarDataCivil((atividade.prazo ?? '') as DataCivil | '')}
                      </td>
                      <td className={classeCelula}>
                        {formatarDataCivil(item.inicioRecomendado as DataCivil)}
                      </td>
                      <td className={classeCelula}>{rotuloDaGravidade(atividade.gravidade)}</td>
                      <td className={classeCelula}>
                        {item.estado === 'inviavel' ? (
                          <Selo tom="perigo">Prazo em risco</Selo>
                        ) : (
                          <Selo tom="atencao">Iniciar já</Selo>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-(--space-100) px-(--space-150) py-(--space-100)">
              <span className="rotulo text-(--text-subtle)">
                Página {pagina + 1} de {paginas}
              </span>
              <div className="flex gap-(--space-100)">
                <Botao
                  disabled={pagina === 0}
                  onClick={() => {
                    aoMudarPagina(pagina - 1)
                  }}
                >
                  Anterior
                </Botao>
                <Botao
                  disabled={pagina >= paginas - 1}
                  onClick={() => {
                    aoMudarPagina(pagina + 1)
                  }}
                >
                  Próxima
                </Botao>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function rotuloDaGravidade(id: string): string {
  return provisorios.niveis.find((nivel) => nivel.id === id)?.rotulo ?? id
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex flex-col gap-(--space-050) rounded-(--radius) border bg-(--surface) p-(--space-150)">
      <dt className="rotulo text-(--text-subtle)">{rotulo}</dt>
      <dd className="titulo-tela text-(--text)">
        {valor}
        {detalhe ? (
          <span className="ml-(--space-100) corpo text-(--text-subtle)">{detalhe}</span>
        ) : null}
      </dd>
    </div>
  )
}
