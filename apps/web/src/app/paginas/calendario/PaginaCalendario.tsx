import {
  adicionarDias,
  adicionarMeses,
  diaDaSemana,
  formatarDataCivil,
  hojeNoFuso,
  nomeDoDiaDaSemana,
  ultimoDiaDoMes,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import {
  CHAVE_PRAZOS_RESIDUO,
  agruparPrazosDeResiduoPorDia,
} from '@/app/paginas/residuos/prazos/prazos-de-residuos'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { BotaoMais } from '@/components/ui/botao-mais'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/segmentado'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import {
  listarCalendario,
  listarUnidadesDaConsultoria,
  type EventoDoCalendario,
  type FiltrosDoCalendario,
} from '@/lib/api/prazos'
import { prazosDasObrigacoesDeResiduo, type PrazoDeObrigacaoNoCalendario } from '@/lib/api/residuos'
import { CHAVE_TAREFAS, listarTarefasDeServico } from '@/lib/api/tarefas'
import { nomeDoMes } from '@/lib/datas'
import { cn } from '@/lib/utils'

import { exportarIcs, eventosIcsDoRecorte } from './exportar-ics'
import {
  categorizador,
  estiloDaCategoria,
  guardarColorirPor,
  legendaDe,
  lerColorirPor,
  type Categoria,
  type ColorirPor,
} from './colorir-por'
import { EventoDoDia, MarcaDoTipo, SiglaDaCategoria } from './ItemDoCalendario'
import { itemDoEvento, itemDoResiduo, type ItemDoDia } from './itens-do-calendario'

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const VISIVEIS_POR_DIA = 3
const MARCAS_NO_CELULAR = 3

type Modo = 'mes' | 'semana' | 'lista'

const COLORIR_POR: readonly OpcaoSegmentada<ColorirPor>[] = [
  { valor: 'tipo', rotulo: 'Tipo' },
  { valor: 'area', rotulo: 'Área' },
  { valor: 'pessoa', rotulo: 'Pessoa' },
]

const MODOS: readonly OpcaoSegmentada<Modo>[] = [
  { valor: 'lista', rotulo: 'Lista' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'semana', rotulo: 'Semana' },
]

/** No celular a lista vem primeiro. Sem matchMedia (jsdom), mês. */
function modoInicial(): Modo {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches
    ? 'lista'
    : 'mes'
}

function partes(data: DataCivil): [number, number, number] {
  const [a, m, d] = data.split('-').map(Number)
  return [a ?? 0, m ?? 1, d ?? 1]
}

function primeiroDoMes(data: DataCivil): DataCivil {
  const [a, m] = partes(data)
  return `${String(a)}-${String(m).padStart(2, '0')}-01` as DataCivil
}

/**
 * Intervalo visível: mês em semanas de domingo a sábado (Protótipo 06), uma semana, ou o mês
 * exato na lista.
 */
function intervalo(modo: Modo, referencia: DataCivil): { inicio: DataCivil; fim: DataCivil } {
  if (modo === 'semana') {
    const inicio = adicionarDias(referencia, -diaDaSemana(referencia))
    return { inicio, fim: adicionarDias(inicio, 6) }
  }
  const primeiro = primeiroDoMes(referencia)
  const [a, m] = partes(primeiro)
  const ultimo = adicionarDias(primeiro, ultimoDiaDoMes(a, m) - 1)
  if (modo === 'lista') return { inicio: primeiro, fim: ultimo }
  return {
    inicio: adicionarDias(primeiro, -diaDaSemana(primeiro)),
    fim: adicionarDias(ultimo, 6 - diaDaSemana(ultimo)),
  }
}

function dias(inicio: DataCivil, fim: DataCivil): DataCivil[] {
  const lista: DataCivil[] = []
  for (let dia = inicio; dia <= fim; dia = adicionarDias(dia, 1)) lista.push(dia)
  return lista
}

/**
 * Eventos do dia em linhas: marca, texto e, embaixo, empreendimento e responsável. Colorindo por
 * área ou pessoa, a linha de apoio começa com a sigla e o nome da categoria.
 */
function ListaDoDia({
  itens,
  rotulo,
  categoriaDe,
}: {
  itens: ItemDoDia[]
  rotulo: string
  categoriaDe: ((item: ItemDoDia) => Categoria) | null
}) {
  return (
    <ul className="flex min-w-0 flex-col" aria-label={rotulo}>
      {itens.map((item) => (
        <li
          key={item.chave}
          className="flex min-h-11 flex-col justify-center gap-(--e-05) border-b border-(--regra-leve) py-(--e-2) last:border-b-0"
        >
          <EventoDoDia item={item} modo="inteiro" />
          {categoriaDe ? (
            <span className="flex flex-wrap items-center gap-(--e-15) pl-(--e-4) text-xs text-(--tinta-2)">
              <SiglaDaCategoria categoria={categoriaDe(item)} />
              {/* A pessoa já vem no apoio; a área não: escreve só o que faltar. */}
              {item.apoio.includes(categoriaDe(item).rotulo) ? null : (
                <span className="font-[650] text-(--tinta)">{categoriaDe(item).rotulo}</span>
              )}
              {item.apoio ? <span>{item.apoio}</span> : null}
            </span>
          ) : item.apoio ? (
            <span className="pl-(--e-4) text-xs text-(--tinta-2)">{item.apoio}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * Legenda do "Colorir por": cada categoria com a forma (tipo) ou a cor e a sigla (área, pessoa), o
 * nome e quantos eventos tem. Clicar mostra só aquela categoria; clicar de novo mostra todas.
 */
function Legenda({
  itens,
  filtrada,
  aoFiltrar,
}: {
  itens: { categoria: Categoria; quantidade: number }[]
  filtrada: string | null
  aoFiltrar: (chave: string | null) => void
}) {
  return (
    <div
      role="group"
      aria-label="Legenda: clique para ver só uma categoria"
      className="-mx-(--e-4) flex items-center gap-(--e-1) overflow-x-auto px-(--e-4) pb-(--e-05) [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
    >
      {itens.map(({ categoria, quantidade }) => {
        const ativa = filtrada === categoria.chave
        const cores = categoria.tipo ? null : estiloDaCategoria(categoria.cor)
        return (
          <button
            key={categoria.chave}
            type="button"
            aria-pressed={ativa}
            aria-label={`${categoria.rotulo}, ${String(quantidade)} ${quantidade === 1 ? 'evento' : 'eventos'}`}
            onClick={() => {
              aoFiltrar(ativa ? null : categoria.chave)
            }}
            className={cn(
              'inline-flex h-(--controle-mini) shrink-0 cursor-pointer items-center gap-(--e-15) rounded-(--raio-redondo) border px-(--e-3) text-xs font-[650] whitespace-nowrap text-(--tinta) transicao-estado max-md:min-h-(--controle-toque)',
              ativa
                ? 'border-(--marca-linha) bg-(--escolha)'
                : 'border-(--regra) bg-(--folha) hover:bg-(--toque)',
              filtrada !== null && !ativa && 'text-(--tinta-2)',
            )}
          >
            {cores ? (
              <span
                aria-hidden
                style={{ backgroundColor: cores.fundo, borderColor: cores.forte }}
                className="size-3 shrink-0 rounded-[3px] border-2"
              />
            ) : categoria.tipo ? (
              <MarcaDoTipo tipo={categoria.tipo} />
            ) : null}
            {categoria.rotulo}
            <span className="font-normal text-(--tinta-2) numero">{quantidade}</span>
          </button>
        )
      })}
      {filtrada !== null ? (
        <Botao
          tamanho="compacto"
          aparencia="sutil"
          className="shrink-0"
          onClick={() => {
            aoFiltrar(null)
          }}
        >
          Mostrar todas
        </Botao>
      ) : null}
    </div>
  )
}

/**
 * /calendario (Protótipo 06; EQ-04): mês, semana e lista, com filtros por pessoa, unidade e "só
 * sem responsável". As datas são civis (o fuso do aparelho não move nada). Hoje acende no destaque;
 * cada tipo de evento tem forma própria. No celular, a lista vem primeiro.
 */
export function PaginaCalendario() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [modo, setModo] = useState<Modo>(modoInicial)
  const [referencia, setReferencia] = useState<DataCivil>(hoje)
  const [filtros, setFiltros] = useState<FiltrosDoCalendario>({
    responsavelId: null,
    unidadeId: null,
    semResponsavel: false,
  })
  const [diaAberto, setDiaAberto] = useState<DataCivil | null>(null)

  const { inicio, fim } = intervalo(modo, referencia)
  const eventos = useQuery({
    queryKey: ['calendario', cid, inicio, fim, filtros],
    queryFn: () => listarCalendario(cid, inicio, fim, filtros),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  // Prazos das obrigações de resíduos (ADR-0028): não têm responsável nem unidade, então somem
  // quando o filtro é por pessoa, unidade ou "sem responsável". Falhar aqui não derruba o calendário.
  const semFiltroDePessoa = !filtros.responsavelId && !filtros.unidadeId && !filtros.semResponsavel
  const residuos = useQuery({
    queryKey: [CHAVE_PRAZOS_RESIDUO, cid, null, inicio, fim],
    queryFn: () => prazosDasObrigacoesDeResiduo(cid, { de: inicio, ate: fim }),
    placeholderData: keepPreviousData,
    enabled: semFiltroDePessoa,
  })
  const residuosPorDia: Map<DataCivil, PrazoDeObrigacaoNoCalendario[]> = semFiltroDePessoa
    ? agruparPrazosDeResiduoPorDia(residuos.data ?? [])
    : new Map<DataCivil, PrazoDeObrigacaoNoCalendario[]>()
  // Tarefas de serviço abertas (ADR-0029), pelo prazo interno. Não têm unidade: somem com esse filtro.
  const ehGestao = atual.papel === 'gestao'
  const tarefas = useQuery({
    queryKey: [CHAVE_TAREFAS, cid, 'calendario', inicio, fim, filtros],
    queryFn: () =>
      listarTarefasDeServico(cid, {
        abertas: true,
        de: inicio,
        ate: fim,
        responsavelId: filtros.responsavelId,
        semResponsavel: filtros.semResponsavel,
      }),
    placeholderData: keepPreviousData,
    enabled: !filtros.unidadeId,
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
  })
  const unidades = useQuery({
    queryKey: ['unidades-consultoria', cid],
    queryFn: () => listarUnidadesDaConsultoria(cid),
  })

  const eventosDeTarefa: EventoDoCalendario[] = filtros.unidadeId
    ? []
    : (tarefas.data ?? []).flatMap((t) =>
        t.prazoInterno
          ? [
              {
                tipo: 'tarefa' as const,
                data: t.prazoInterno,
                id: t.id,
                codigo: null,
                titulo: t.titulo,
                empreendimentoNome: t.empreendimentoNome,
                unidadeNome: '',
                licenca: null,
                responsavelNome: t.responsavelNome,
                responsavelId: t.responsavelId,
                semResponsavel: t.responsavelId === null,
                orcamentoId: t.orcamentoId,
              },
            ]
          : [],
      )
  // Eventos do banco e tarefas primeiro; os prazos de resíduos fecham o dia.
  const porDia = new Map<string, ItemDoDia[]>()
  for (const evento of [...(eventos.data ?? []), ...eventosDeTarefa]) {
    porDia.set(evento.data, [...(porDia.get(evento.data) ?? []), itemDoEvento(evento, ehGestao)])
  }
  for (const [dia, prazos] of residuosPorDia) {
    porDia.set(dia, [...(porDia.get(dia) ?? []), ...prazos.map(itemDoResiduo)])
  }
  // Colorir por tipo, área ou pessoa (lembrado neste navegador), com a legenda que filtra.
  const [colorirPor, setColorirPor] = useState<ColorirPor>(lerColorirPor)
  const [soCategoria, setSoCategoria] = useState<string | null>(null)
  const categoriaDe = useMemo(
    () => categorizador(colorirPor, membros.data ?? []),
    [colorirPor, membros.data],
  )
  const legenda = legendaDe([...porDia.values()].flat(), categoriaDe)
  const categoriaFiltrada = legenda.some((l) => l.categoria.chave === soCategoria)
    ? soCategoria
    : null
  const doDia = (d: DataCivil) =>
    (porDia.get(d) ?? []).filter(
      (item) => categoriaFiltrada === null || categoriaDe(item).chave === categoriaFiltrada,
    )
  const categoriaNoEvento = (item: ItemDoDia) => (colorirPor === 'tipo' ? null : categoriaDe(item))
  const categoriaNaLista = colorirPor === 'tipo' ? null : categoriaDe
  const totalNoPeriodo = [...porDia.values()].reduce((soma, itens) => soma + itens.length, 0)

  /** Exportar .ics: o recorte visível (período e filtros), com tarefas e resíduos. */
  function exportar() {
    const residuosVisiveis = semFiltroDePessoa ? (residuos.data ?? []) : []
    exportarIcs(
      eventosIcsDoRecorte(
        [...(eventos.data ?? []), ...eventosDeTarefa],
        residuosVisiveis,
        inicio,
        fim,
      ),
      inicio,
      fim,
    )
  }

  const [anoRef, mesRef] = partes(referencia)
  const titulo =
    modo === 'semana'
      ? `${formatarDataCivil(inicio)} a ${formatarDataCivil(fim)}`
      : nomeDoMes(anoRef, mesRef)
  const porSemana = modo === 'semana'

  function andar(sentido: 1 | -1) {
    setReferencia((r) =>
      porSemana ? adicionarDias(r, 7 * sentido) : adicionarMeses(primeiroDoMes(r), sentido),
    )
  }

  const diasVisiveis = dias(inicio, fim)
  const semanas: DataCivil[][] = []
  for (let i = 0; i < diasVisiveis.length; i += 7) semanas.push(diasVisiveis.slice(i, i + 7))
  // Na lista, de hoje em diante; mês que já passou mostra tudo.
  const agenda = diasVisiveis.filter((d) => (fim < hoje || d >= hoje) && doDia(d).length > 0)

  let conteudo
  if (eventos.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar o calendário."
        aoTentarDeNovo={() => void eventos.refetch()}
      />
    )
  } else if (eventos.isPending) {
    conteudo = <Carregando rotulo="Carregando o calendário" linhas={6} />
  } else if (modo === 'lista') {
    conteudo =
      agenda.length === 0 ? (
        <EstadoVazio
          icone="calendar"
          titulo="Nada a partir de hoje neste período"
          acaoPrincipal={
            <Botao
              iconeDepois="chevron-right"
              onClick={() => {
                andar(1)
              }}
            >
              Ver o mês seguinte
            </Botao>
          }
        />
      ) : (
        <section
          aria-label="Agenda"
          className="overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
        >
          <ol className="flex flex-col">
            {agenda.map((dia) => {
              const ehHoje = dia === hoje
              const nomeDoDia = `${ehHoje ? 'Hoje, ' : ''}${nomeDoDiaDaSemana(dia)}, ${formatarDataCivil(dia)}`
              return (
                <li
                  key={dia}
                  className={cn(
                    'grid grid-cols-[56px_1fr] gap-(--e-3) border-b px-(--e-4) last:border-b-0 md:grid-cols-[72px_1fr]',
                    ehHoje && 'bg-(--sinal-fundo)',
                  )}
                >
                  <h3 className="flex flex-col items-start gap-(--e-1) py-(--e-3)">
                    <span className="sr-only">{nomeDoDia}</span>
                    {ehHoje ? (
                      <span
                        aria-hidden
                        className="rounded-(--raio-mini) bg-(--sinal) px-(--e-15) py-(--e-05) text-[11px] font-semibold tracking-[0.06em] text-(--sinal-texto) uppercase"
                      >
                        Hoje
                      </span>
                    ) : (
                      <span aria-hidden className="text-xs font-[750] text-(--tinta-2)">
                        {DIAS_DA_SEMANA[diaDaSemana(dia)]}
                      </span>
                    )}
                    <span aria-hidden className="numero-contagem text-(--tinta)">
                      {partes(dia)[2]}
                    </span>
                  </h3>
                  <ListaDoDia
                    itens={doDia(dia)}
                    rotulo={nomeDoDia}
                    categoriaDe={categoriaNaLista}
                  />
                </li>
              )
            })}
          </ol>
        </section>
      )
  } else {
    conteudo = (
      <div className="overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed border-collapse"
            aria-label={`Calendário de ${titulo}`}
          >
            <thead>
              <tr>
                {semanas[0]?.map((dia) => (
                  <th
                    key={dia}
                    scope="col"
                    className={cn(
                      'h-10 border-b px-(--e-1) text-left rotulo-maiusculo md:px-(--e-2)',
                      porSemana && dia === hoje ? 'text-(--tinta)' : 'text-(--tinta-2)',
                    )}
                  >
                    {DIAS_DA_SEMANA[diaDaSemana(dia)]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana) => (
                <tr key={semana[0]}>
                  {semana.map((dia) => {
                    const itens = doDia(dia)
                    const total = itens.length
                    const foraDoMes = !porSemana && partes(dia)[1] !== mesRef
                    const ehHoje = dia === hoje
                    const limite = porSemana ? total : VISIVEIS_POR_DIA
                    const restantes = total - limite
                    return (
                      <td
                        key={dia}
                        className={cn(
                          'border-r border-b p-(--e-05) align-top last:border-r-0 md:p-(--e-1)',
                          porSemana ? 'h-24 md:h-64' : 'h-16 md:h-28',
                          foraDoMes && 'bg-(--chao)',
                          ehHoje && 'bg-(--sinal-fundo)',
                        )}
                      >
                        <div className="flex flex-col gap-(--e-05)">
                          <button
                            type="button"
                            onClick={() => {
                              setDiaAberto(dia)
                            }}
                            aria-label={`${formatarDataCivil(dia)}, ${String(total)} ${total === 1 ? 'evento' : 'eventos'}`}
                            className="flex w-full cursor-pointer flex-col items-center gap-(--e-1) rounded-(--raio) py-(--e-05) transicao-estado hover:bg-(--toque) max-md:min-h-11 md:w-fit md:flex-row md:px-(--e-1)"
                          >
                            <span
                              className={cn(
                                'inline-flex h-6 min-w-6 items-center justify-center rounded-(--raio-mini) px-(--e-1) text-xs numero',
                                foraDoMes ? 'text-(--tinta-3)' : 'font-[650] text-(--tinta)',
                                ehHoje && 'bg-(--sinal) font-semibold text-(--sinal-texto)',
                              )}
                            >
                              {partes(dia)[2]}
                            </span>
                            {ehHoje ? (
                              <span className="text-xs font-[750] text-(--tinta) max-md:hidden">
                                Hoje
                              </span>
                            ) : null}
                            {total > 0 ? (
                              <span className="flex items-center gap-(--e-05) md:hidden">
                                {itens.slice(0, MARCAS_NO_CELULAR).map((item) => (
                                  <MarcaDoTipo key={item.chave} tipo={item.tipo} />
                                ))}
                                {total > MARCAS_NO_CELULAR ? (
                                  <span aria-hidden className="text-[10px] font-[750]">
                                    +
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </button>
                          <div className="flex min-w-0 flex-col gap-(--e-05) max-md:hidden">
                            {itens.slice(0, limite).map((item) => (
                              <EventoDoDia
                                key={item.chave}
                                item={item}
                                modo={porSemana ? 'quebra' : 'linha'}
                                categoria={categoriaNoEvento(item)}
                              />
                            ))}
                            {restantes > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDiaAberto(dia)
                                }}
                                className="w-fit cursor-pointer rounded-(--raio-mini) px-(--e-1) text-xs font-[750] text-(--link) hover:underline"
                              >
                                +{restantes} mais
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <Pagina
      titulo="Calendário"
      acao={
        <>
          <Segmentado
            rotulo="Visualização"
            opcoes={MODOS}
            valor={modo}
            aoMudar={setModo}
            larguraTotalNoCelular
            className="max-md:w-auto max-md:min-w-0 max-md:flex-1"
          />
          <BotaoMais
            itens={[
              {
                rotulo: 'Exportar .ics',
                icone: 'download',
                desabilitado: eventos.isPending || eventos.isError || totalNoPeriodo === 0,
                aoEscolher: exportar,
              },
            ]}
          />
        </>
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        <div className="flex items-center gap-(--e-1) md:gap-(--e-2)">
          <BotaoIcone
            icone="chevron-left"
            rotulo={porSemana ? 'Semana anterior' : 'Mês anterior'}
            onClick={() => {
              andar(-1)
            }}
          />
          <h2
            className="min-w-0 flex-1 truncate text-center titulo-secao text-(--tinta) numero first-letter:uppercase md:min-w-[220px] md:flex-none md:titulo-painel"
            aria-live="polite"
          >
            {titulo}
          </h2>
          <BotaoIcone
            icone="chevron-right"
            rotulo={porSemana ? 'Próxima semana' : 'Próximo mês'}
            onClick={() => {
              andar(1)
            }}
          />
          <Botao
            className="ml-(--e-1) shrink-0"
            onClick={() => {
              setReferencia(hoje)
            }}
          >
            Hoje
          </Botao>
        </div>
        <div className="-mx-(--e-4) flex items-center gap-(--e-2) overflow-x-auto px-(--e-4) pb-(--e-05) [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <label className="shrink-0">
            <span className="sr-only">Pessoa</span>
            <select
              className={classeSelecao}
              value={filtros.responsavelId ?? ''}
              onChange={(evento) => {
                setFiltros((f) => ({ ...f, responsavelId: evento.target.value || null }))
              }}
            >
              <option value="">Todas as pessoas</option>
              {(membros.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="shrink-0">
            <span className="sr-only">Unidade</span>
            <select
              className={classeSelecao}
              value={filtros.unidadeId ?? ''}
              onChange={(evento) => {
                setFiltros((f) => ({ ...f, unidadeId: evento.target.value || null }))
              }}
            >
              <option value="">Todas as unidades</option>
              {(unidades.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.empreendimentoNome} · {u.nome}
                </option>
              ))}
            </select>
          </label>
          <CaixaSelecao
            className="shrink-0 whitespace-nowrap max-md:min-h-(--controle-toque)"
            rotulo="Só sem responsável"
            checked={filtros.semResponsavel}
            onChange={(evento) => {
              setFiltros((f) => ({ ...f, semResponsavel: evento.target.checked }))
            }}
          />
          <span className="flex shrink-0 items-center gap-(--e-2) md:ml-auto">
            <span aria-hidden className="rotulo whitespace-nowrap text-(--tinta-2)">
              Colorir por
            </span>
            <Segmentado
              rotulo="Colorir por"
              opcoes={COLORIR_POR}
              valor={colorirPor}
              aoMudar={(valor) => {
                setColorirPor(valor)
                guardarColorirPor(valor)
                setSoCategoria(null)
              }}
            />
          </span>
        </div>
        {legenda.length > 0 ? (
          <Legenda itens={legenda} filtrada={categoriaFiltrada} aoFiltrar={setSoCategoria} />
        ) : null}
      </div>

      {semFiltroDePessoa && residuos.isError ? (
        <MensagemSecao role="alert" tom="atencao">
          Não foi possível carregar os prazos de resíduos.
        </MensagemSecao>
      ) : null}

      {conteudo}

      <Dialogo
        aberto={diaAberto !== null}
        aoMudar={(aberto) => {
          if (!aberto) setDiaAberto(null)
        }}
        titulo={
          diaAberto
            ? `${diaAberto === hoje ? 'Hoje, ' : ''}${nomeDoDiaDaSemana(diaAberto)}, ${formatarDataCivil(diaAberto)}`
            : 'Dia'
        }
      >
        {diaAberto && doDia(diaAberto).length > 0 ? (
          <ListaDoDia
            itens={doDia(diaAberto)}
            rotulo="Eventos do dia"
            categoriaDe={categoriaNaLista}
          />
        ) : (
          <p className="corpo text-(--tinta-2)">Nenhum evento neste dia.</p>
        )}
      </Dialogo>
    </Pagina>
  )
}
