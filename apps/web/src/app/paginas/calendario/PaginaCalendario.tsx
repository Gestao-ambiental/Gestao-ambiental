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
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { EsqueletoLinhas } from '@/components/ui/esqueleto'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import {
  listarCalendario,
  listarUnidadesDaConsultoria,
  type EventoDoCalendario,
  type FiltrosDoCalendario,
} from '@/lib/api/prazos'
import { nomeDoMes } from '@/lib/datas'
import { cn } from '@/lib/utils'

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const VISIVEIS_POR_DIA = 3

const classeSelect =
  'h-(--size-control) max-w-[200px] rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus)'

type Modo = 'mes' | 'semana'

function partes(data: DataCivil): [number, number, number] {
  const [a, m, d] = data.split('-').map(Number)
  return [a ?? 0, m ?? 1, d ?? 1]
}

function primeiroDoMes(data: DataCivil): DataCivil {
  const [a, m] = partes(data)
  return `${String(a)}-${String(m).padStart(2, '0')}-01` as DataCivil
}

/** Intervalo visível: mês em semanas de domingo a sábado (Protótipo 06), ou uma semana. */
function intervalo(modo: Modo, referencia: DataCivil): { inicio: DataCivil; fim: DataCivil } {
  if (modo === 'semana') {
    const inicio = adicionarDias(referencia, -diaDaSemana(referencia))
    return { inicio, fim: adicionarDias(inicio, 6) }
  }
  const primeiro = primeiroDoMes(referencia)
  const [a, m] = partes(primeiro)
  const ultimo = adicionarDias(primeiro, ultimoDiaDoMes(a, m) - 1)
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

function textoDoEvento(evento: EventoDoCalendario): string {
  if (evento.tipo === 'limite_protocolo') return `Protocolo ${evento.licenca ?? ''}`.trim()
  if (evento.tipo === 'validade') return `Validade ${evento.licenca ?? ''}`.trim()
  return [evento.codigo, evento.titulo].filter(Boolean).join(' ')
}

function descricaoDoEvento(evento: EventoDoCalendario): string {
  const tipo =
    evento.tipo === 'meta'
      ? 'Meta interna'
      : evento.tipo === 'limite_protocolo'
        ? 'Limite de protocolo'
        : evento.tipo === 'validade'
          ? 'Validade'
          : 'Prazo oficial'
  const quem =
    evento.tipo === 'prazo' || evento.tipo === 'meta'
      ? (evento.responsavelNome ?? 'sem responsável')
      : null
  return [tipo, textoDoEvento(evento), evento.empreendimentoNome, evento.unidadeNome, quem]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Prazo oficial, meta interna, validade e limite com marcas distintas (não só cor). Prazo e meta
 * são de uma ocorrência e abrem o detalhe; o limite de protocolo abre o plano de renovação.
 */
function Evento({ evento, inteiro = false }: { evento: EventoDoCalendario; inteiro?: boolean }) {
  const classes = cn(
    'flex min-w-0 items-center gap-(--space-050) rounded-(--radius) px-(--space-075) py-0.5 text-xs',
    evento.tipo === 'prazo' && 'bg-(--lozenge-default-bg) text-(--text)',
    evento.tipo === 'meta' && 'border border-dashed border-(--border-strong) text-(--text-subtle)',
    evento.tipo === 'limite_protocolo' && 'bg-(--lozenge-warning-bg) text-(--lozenge-warning-text)',
    evento.tipo === 'validade' && 'bg-(--lozenge-inprogress-bg) text-(--lozenge-inprogress-text)',
  )
  const conteudo = (
    <>
      {evento.tipo === 'limite_protocolo' ? <Icone nome="clock" tamanho={12} /> : null}
      {evento.tipo === 'meta' ? <span className="font-semibold">Meta</span> : null}
      <span className={inteiro ? 'break-words' : 'truncate'}>{textoDoEvento(evento)}</span>
      {evento.semResponsavel ? (
        <span className="shrink-0 text-(--text-subtle)">sem resp.</span>
      ) : null}
    </>
  )
  if (evento.tipo !== 'validade') {
    return (
      <Link
        to={
          evento.tipo === 'limite_protocolo'
            ? `/renovacoes/${evento.id}`
            : `/ocorrencias/${evento.id}`
        }
        title={descricaoDoEvento(evento)}
        className={cn(classes, 'no-underline hover:underline')}
      >
        {conteudo}
      </Link>
    )
  }
  return (
    <span title={descricaoDoEvento(evento)} className={classes}>
      {conteudo}
    </span>
  )
}

/**
 * /calendario (Protótipo 06; EQ-04): mês e semana, filtros por pessoa, unidade e "só sem
 * responsável". As datas são civis (o fuso do aparelho não move nada); no celular vira agenda.
 */
export function PaginaCalendario() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [modo, setModo] = useState<Modo>('mes')
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
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
  })
  const unidades = useQuery({
    queryKey: ['unidades-consultoria', cid],
    queryFn: () => listarUnidadesDaConsultoria(cid),
  })

  const porDia = new Map<string, EventoDoCalendario[]>()
  for (const evento of eventos.data ?? []) {
    porDia.set(evento.data, [...(porDia.get(evento.data) ?? []), evento])
  }

  const [anoRef, mesRef] = partes(referencia)
  const titulo =
    modo === 'mes'
      ? nomeDoMes(anoRef, mesRef)
      : `${formatarDataCivil(inicio)} a ${formatarDataCivil(fim)}`

  function andar(sentido: 1 | -1) {
    setReferencia((r) =>
      modo === 'mes' ? adicionarMeses(primeiroDoMes(r), sentido) : adicionarDias(r, 7 * sentido),
    )
  }

  const diasVisiveis = dias(inicio, fim)
  const semanas: DataCivil[][] = []
  for (let i = 0; i < diasVisiveis.length; i += 7) semanas.push(diasVisiveis.slice(i, i + 7))
  const agenda = diasVisiveis.filter((d) => d >= hoje && (porDia.get(d)?.length ?? 0) > 0)

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Pagina titulo="Calendário">{null}</Pagina>

      <div className="flex flex-wrap items-center gap-(--space-100)">
        <BotaoIcone
          icone="chevron-left"
          rotulo={modo === 'mes' ? 'Mês anterior' : 'Semana anterior'}
          onClick={() => {
            andar(-1)
          }}
        />
        <h2 className="min-w-[180px] titulo-secao" aria-live="polite">
          {titulo}
        </h2>
        <BotaoIcone
          icone="chevron-right"
          rotulo={modo === 'mes' ? 'Próximo mês' : 'Próxima semana'}
          onClick={() => {
            andar(1)
          }}
        />
        <Botao
          onClick={() => {
            setReferencia(hoje)
          }}
        >
          Hoje
        </Botao>
        <label>
          <span className="sr-only">Pessoa</span>
          <select
            className={classeSelect}
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
        <label>
          <span className="sr-only">Unidade</span>
          <select
            className={classeSelect}
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
          rotulo="Só sem responsável"
          checked={filtros.semResponsavel}
          onChange={(evento) => {
            setFiltros((f) => ({ ...f, semResponsavel: evento.target.checked }))
          }}
        />
        <div role="group" aria-label="Visualização" className="ml-auto flex gap-(--space-050)">
          <Botao
            selecionado={modo === 'mes'}
            onClick={() => {
              setModo('mes')
            }}
          >
            Mês
          </Botao>
          <Botao
            selecionado={modo === 'semana'}
            onClick={() => {
              setModo('semana')
            }}
          >
            Semana
          </Botao>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-(--space-200) gap-y-(--space-050) text-xs text-(--text-subtle)">
        <span>Fundo cinza: prazo oficial</span>
        <span>Tracejado “Meta”: meta interna</span>
        <span>Âmbar com relógio: limite de protocolo</span>
        <span>Azul: validade da licença</span>
      </p>

      {eventos.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar o calendário."
          aoTentarDeNovo={() => void eventos.refetch()}
        />
      ) : eventos.isPending ? (
        <div role="status" className="rounded-(--radius) border bg-(--surface)">
          <span className="sr-only">Carregando o calendário</span>
          <EsqueletoLinhas linhas={6} />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-(--radius) border bg-(--surface) md:block">
            <table
              className="w-full table-fixed border-collapse"
              aria-label={`Calendário de ${titulo}`}
            >
              <thead>
                <tr>
                  {DIAS_DA_SEMANA.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className="h-8 border-b px-(--space-100) text-left rotulo-maiusculo text-(--text-subtle)"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semanas.map((semana) => (
                  <tr key={semana[0]}>
                    {semana.map((dia) => {
                      const doDia = porDia.get(dia) ?? []
                      const foraDoMes = modo === 'mes' && partes(dia)[1] !== mesRef
                      const ehHoje = dia === hoje
                      const limite = modo === 'semana' ? doDia.length : VISIVEIS_POR_DIA
                      const restantes = doDia.length - limite
                      return (
                        <td
                          key={dia}
                          className={cn(
                            'border-r border-b p-(--space-075) align-top last:border-r-0',
                            modo === 'mes' ? 'h-28' : 'h-64',
                            foraDoMes && 'bg-(--surface-sunken)',
                          )}
                        >
                          <div className="flex flex-col gap-(--space-050)">
                            <button
                              type="button"
                              onClick={() => {
                                setDiaAberto(dia)
                              }}
                              aria-label={`${formatarDataCivil(dia)}, ${String(doDia.length)} ${doDia.length === 1 ? 'evento' : 'eventos'}`}
                              className={cn(
                                'inline-flex w-fit cursor-pointer items-center gap-(--space-050) rounded-(--radius) text-xs transicao-estado hover:underline',
                                foraDoMes ? 'text-(--text-subtle)' : 'text-(--text)',
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-flex min-w-5 justify-center rounded-(--radius) px-1',
                                  ehHoje && 'bg-(--brand) font-semibold text-(--text-inverse)',
                                )}
                              >
                                {partes(dia)[2]}
                              </span>
                              {ehHoje ? (
                                <span className="font-semibold text-(--text-link)">Hoje</span>
                              ) : null}
                            </button>
                            {doDia.slice(0, limite).map((evento) => (
                              <Evento key={`${evento.tipo}:${evento.id}`} evento={evento} />
                            ))}
                            {restantes > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDiaAberto(dia)
                                }}
                                className="w-fit cursor-pointer text-xs text-(--text-link) hover:underline"
                              >
                                +{restantes} mais
                              </button>
                            ) : null}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section aria-label="Agenda" className="flex flex-col gap-(--space-150) md:hidden">
            {agenda.length === 0 ? (
              <EstadoVazio
                icone="calendar"
                titulo="Nada a partir de hoje neste período"
                descricao="Use as setas para ver outro mês."
              />
            ) : (
              agenda.map((dia) => (
                <div key={dia} className="flex flex-col gap-(--space-050)">
                  <h3 className="corpo-medio">
                    {dia === hoje ? 'Hoje · ' : ''}
                    {nomeDoDiaDaSemana(dia)}, {formatarDataCivil(dia)}
                  </h3>
                  {(porDia.get(dia) ?? []).map((evento) => (
                    <Evento key={`${evento.tipo}:${evento.id}`} evento={evento} inteiro />
                  ))}
                </div>
              ))
            )}
          </section>
        </>
      )}

      <Dialogo
        aberto={diaAberto !== null}
        aoMudar={(aberto) => {
          if (!aberto) setDiaAberto(null)
        }}
        titulo={
          diaAberto ? `${nomeDoDiaDaSemana(diaAberto)}, ${formatarDataCivil(diaAberto)}` : 'Dia'
        }
      >
        {diaAberto && (porDia.get(diaAberto)?.length ?? 0) > 0 ? (
          <ul className="flex flex-col gap-(--space-100)" aria-label="Eventos do dia">
            {(porDia.get(diaAberto) ?? []).map((evento) => (
              <li key={`${evento.tipo}:${evento.id}`} className="flex flex-col gap-(--space-025)">
                <Evento evento={evento} inteiro />
                <span className="text-xs text-(--text-subtle)">{descricaoDoEvento(evento)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-(--text-subtle)">Nenhum evento neste dia.</p>
        )}
      </Dialogo>
    </div>
  )
}
