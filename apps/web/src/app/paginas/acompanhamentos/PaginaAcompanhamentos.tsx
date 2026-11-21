import {
  HORIZONTES_DA_RENOVACAO,
  HORIZONTE_PADRAO_DA_RENOVACAO,
  datasRenovacaoLao,
  diferencaEmDias,
  ehHorizonteDaRenovacao,
  fimDoHorizonte,
  formatarDataCivil,
  hojeNoFuso,
  situacaoDaRenovacao,
  type HorizonteDaRenovacao,
} from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursoLiberado } from '@/app/consultoria/recurso-liberado'
import { Pagina } from '@/app/paginas/Pagina'
import { Contagem } from '@/app/paginas/visao/Contagem'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Abas, PainelDeAba } from '@/components/ui/abas'
import { Avatar } from '@/components/ui/avatar'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import { Segmentado } from '@/components/ui/segmentado'
import {
  TAMANHO_PAGINA_ACOMPANHAMENTOS,
  listarAguardandoConferencia,
  listarRenovacoes,
  type Pagina as PaginaDeItens,
  type Renovacao,
} from '@/lib/api/renovacoes'
import { tempoDesde } from '@/lib/datas'
import { cn } from '@/lib/utils'

import { abasDeAcompanhamentosVisiveis } from './abas-de-acompanhamentos'
import { OrcamentoDaRenovacao } from './OrcamentoDaRenovacao'
import { SeloRenovacao } from './SeloRenovacao'

const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'
const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeTabela =
  'hidden max-h-[calc(100dvh-280px)] overflow-auto md:block [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-(--folha)'

function Paginador({
  pagina,
  total,
  aoMudar,
}: {
  pagina: number
  total: number
  aoMudar: (pagina: number) => void
}) {
  const inicio = pagina * TAMANHO_PAGINA_ACOMPANHAMENTOS
  const fim = Math.min(total, inicio + TAMANHO_PAGINA_ACOMPANHAMENTOS)
  return (
    <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
      <span className="flex-1 rotulo numero" aria-live="polite">
        {inicio + 1}–{fim} de {total}
      </span>
      <BotaoIcone
        icone="chevron-left"
        rotulo="Página anterior"
        disabled={pagina === 0}
        onClick={() => {
          aoMudar(Math.max(0, pagina - 1))
        }}
      />
      <BotaoIcone
        icone="chevron-right"
        rotulo="Próxima página"
        disabled={fim >= total}
        onClick={() => {
          aoMudar(pagina + 1)
        }}
      />
    </div>
  )
}

/** Quadro de uma aba (EQ-05): estados, painel e paginação no rodapé. */
function Quadro<T>({
  titulo,
  consulta,
  vazio,
  iconeVazio,
  pagina,
  aoMudarPagina,
  children,
}: {
  titulo: string
  consulta: {
    isPending: boolean
    isError: boolean
    data?: PaginaDeItens<T>
    refetch: () => unknown
  }
  vazio: string
  iconeVazio: 'inbox' | 'calendar-check'
  pagina: number
  aoMudarPagina: (pagina: number) => void
  children: (itens: T[]) => ReactNode
}) {
  if (consulta.isPending) {
    return <Carregando rotulo={`Carregando ${titulo.toLowerCase()}`} linhas={4} />
  }
  if (consulta.isError) {
    return (
      <EstadoErro
        titulo={`Não foi possível carregar ${titulo.toLowerCase()}.`}
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  const total = consulta.data?.total ?? 0
  if (total === 0) return <EstadoVazio icone={iconeVazio} titulo={vazio} />
  return (
    <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
      {children(consulta.data?.itens ?? [])}
      <Paginador pagina={pagina} total={total} aoMudar={aoMudarPagina} />
    </div>
  )
}

const OPCOES_DO_HORIZONTE = HORIZONTES_DA_RENOVACAO.map((meses) => ({
  valor: meses,
  rotulo: `${String(meses)} meses`,
}))

/** ?horizonte=3|6|12; ausente ou inválido vale o padrão (6), que não aparece na URL. */
function lerHorizonte(texto: string | null): HorizonteDaRenovacao {
  const meses = texto === null ? NaN : Number(texto)
  return ehHorizonteDaRenovacao(meses) ? meses : HORIZONTE_PADRAO_DA_RENOVACAO
}

/** Limite, situação e quantos dias faltam para o limite de protocolo (nulo se já protocolou). */
function calcular(item: Renovacao) {
  const { limiteProtocolo } = datasRenovacaoLao(item.validade, item.antecedencia, item.diasLimite)
  const situacao = situacaoDaRenovacao({
    vencimento: item.validade,
    antecedencia: item.antecedencia,
    diasLimite: item.diasLimite,
    protocoladoEm: item.protocoladoEm,
    acompanhamentoDias: item.acompanhamentoDias,
    hoje: item.hoje,
  })
  const faltam = item.protocoladoEm ? null : diferencaEmDias(limiteProtocolo, item.hoje)
  return { limiteProtocolo, situacao, faltam }
}

/** Coluna "Faltam": a contagem até o limite, ou o visto de quem já protocolou. */
function Faltam({ dias, ordem }: { dias: number | null; ordem: number }) {
  if (dias === null) {
    return (
      <span aria-hidden className="inline-flex w-[56px] shrink-0 text-(--ok-texto)">
        <Icone nome="check" tamanho={20} />
      </span>
    )
  }
  return <Contagem dias={dias} ordem={ordem} />
}

/**
 * /acompanhamentos (Protótipo 17, artboard 01; EQ-05): abas de abas-de-acompanhamentos.ts.
 * Renovações no radar como quadro de partidas (quanto falta para o limite de protocolo) e
 * evidências aguardando conferência.
 */
export function PaginaAcompanhamentos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ids = useId()
  const [parametros, setParametros] = useSearchParams()
  const ehGestao = atual.papel === 'gestao'
  const visiveis = abasDeAcompanhamentosVisiveis(ehGestao)
  const primeira = visiveis[0]?.valor ?? 'renovacoes'
  const pedida = parametros.get('aba')
  const aba = visiveis.find((a) => a.valor === pedida)?.valor ?? primeira
  const PainelDaAba = visiveis.find((a) => a.valor === aba)?.Painel
  const [paginaConferencia, setPaginaConferencia] = useState(0)
  const [paginaRenovacao, setPaginaRenovacao] = useState(0)
  const horizonte = lerHorizonte(parametros.get('horizonte'))
  const orcamentosNoPlano = useRecursoLiberado('orcamentos').data === true

  const conferencias = useQuery({
    queryKey: ['aguardando-conferencia', cid, paginaConferencia],
    queryFn: () => listarAguardandoConferencia(cid, paginaConferencia),
    placeholderData: keepPreviousData,
  })
  const renovacoes = useQuery({
    queryKey: ['renovacoes', cid, horizonte, paginaRenovacao],
    queryFn: () => listarRenovacoes(cid, paginaRenovacao, horizonte),
    placeholderData: keepPreviousData,
  })
  const agora = new Date()
  const fimDoRadar = fimDoHorizonte(hojeNoFuso(agora, atual.fuso), horizonte)

  const totais: Record<string, number | undefined> = {
    renovacoes: renovacoes.data?.total,
    conferencia: conferencias.data?.total,
  }

  function trocar(nova: string) {
    setParametros(
      (p) => {
        const proximo = new URLSearchParams(p)
        if (nova === primeira) proximo.delete('aba')
        else proximo.set('aba', nova)
        return proximo
      },
      { replace: true },
    )
  }

  function trocarHorizonte(meses: HorizonteDaRenovacao) {
    setPaginaRenovacao(0)
    setParametros(
      (p) => {
        const proximo = new URLSearchParams(p)
        if (meses === HORIZONTE_PADRAO_DA_RENOVACAO) proximo.delete('horizonte')
        else proximo.set('horizonte', String(meses))
        return proximo
      },
      { replace: true },
    )
  }

  return (
    <Pagina titulo="Acompanhamentos">
      <div className="flex flex-col gap-(--e-4)">
        <Abas
          rotulo="Acompanhamentos"
          idBase={ids}
          valor={aba}
          aoMudar={trocar}
          abas={visiveis.map((a) => ({
            valor: a.valor,
            rotulo: a.rotulo,
            curto: a.curto,
            contagem: totais[a.valor],
          }))}
        />

        {PainelDaAba ? (
          <PainelDeAba idBase={ids} valor={aba}>
            <PainelDaAba />
          </PainelDeAba>
        ) : aba === 'renovacoes' ? (
          <div
            role="tabpanel"
            id={`${ids}-painel-renovacoes`}
            aria-labelledby={`${ids}-aba-renovacoes`}
            className="flex flex-col gap-(--e-3)"
          >
            <Segmentado
              rotulo="Vencem nos próximos"
              opcoes={OPCOES_DO_HORIZONTE}
              valor={horizonte}
              aoMudar={trocarHorizonte}
              className="self-start"
            />
            <Quadro
              titulo="Renovações no radar"
              consulta={renovacoes}
              vazio={`Nenhuma LAO vence até ${formatarDataCivil(fimDoRadar)}.`}
              iconeVazio="calendar-check"
              pagina={paginaRenovacao}
              aoMudarPagina={setPaginaRenovacao}
            >
              {(itens) => (
                <>
                  <div className={classeTabela}>
                    <table className="w-full border-collapse corpo">
                      <thead>
                        <tr>
                          <th scope="col" className={cn(classeCabecalho, 'w-[88px]')}>
                            Faltam
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Limite
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Licença
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Vencimento
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Situação
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Orçamento
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item, indice) => {
                          const { limiteProtocolo, situacao, faltam } = calcular(item)
                          return (
                            <tr
                              key={item.instrumentoId}
                              className={cn(
                                'transicao-estado hover:bg-(--toque)',
                                faltam === 0 && 'bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
                              )}
                            >
                              <td className={classeCelula}>
                                <Faltam dias={faltam} ordem={indice} />
                              </td>
                              <td
                                className={`${classeCelula} corpo-medio whitespace-nowrap numero`}
                              >
                                {formatarDataCivil(limiteProtocolo)}
                              </td>
                              <td className={`${classeCelula} max-w-[320px]`}>
                                <span className="flex items-center gap-(--e-2)">
                                  <span className="flex min-w-0 flex-col">
                                    <Link
                                      to={`/renovacoes/${item.instrumentoId}`}
                                      className="truncate corpo-medio text-(--tinta) numero"
                                    >
                                      {item.licenca}
                                    </Link>
                                    <span className="truncate text-xs text-(--tinta-2)">
                                      {item.empreendimentoNome}
                                    </span>
                                  </span>
                                </span>
                              </td>
                              <td
                                className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}
                              >
                                {formatarDataCivil(item.validade)}
                              </td>
                              <td className={classeCelula}>
                                <SeloRenovacao situacao={situacao} hoje={item.hoje} />
                              </td>
                              <td className={classeCelula}>
                                <OrcamentoDaRenovacao
                                  instrumentoId={item.instrumentoId}
                                  licenca={item.licenca}
                                  orcamento={item.orcamento}
                                  ehGestao={ehGestao}
                                  podeGerar={orcamentosNoPlano}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ul className="flex flex-col md:hidden" aria-label="Renovações no radar">
                    {itens.map((item, indice) => {
                      const { limiteProtocolo, situacao, faltam } = calcular(item)
                      return (
                        <li
                          key={item.instrumentoId}
                          className={cn(
                            'flex gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0',
                            faltam === 0 && 'bg-(--sinal-fundo)',
                          )}
                        >
                          <Faltam dias={faltam} ordem={indice} />
                          <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                            <span className="flex flex-wrap items-center justify-between gap-x-(--e-2) gap-y-(--e-1)">
                              <Link
                                to={`/renovacoes/${item.instrumentoId}`}
                                className="corpo-medio text-(--tinta) numero"
                              >
                                {item.licenca}
                              </Link>
                              <SeloRenovacao situacao={situacao} hoje={item.hoje} />
                            </span>
                            <span className="truncate text-xs text-(--tinta-2)">
                              {item.empreendimentoNome}
                            </span>
                            <span className="text-xs text-(--tinta-2) numero">
                              Limite{' '}
                              <span className="font-[750] text-(--tinta)">
                                {formatarDataCivil(limiteProtocolo)}
                              </span>{' '}
                              · vence {formatarDataCivil(item.validade)}
                            </span>
                            <span className="pt-(--e-1)">
                              <OrcamentoDaRenovacao
                                instrumentoId={item.instrumentoId}
                                licenca={item.licenca}
                                orcamento={item.orcamento}
                                ehGestao={ehGestao}
                                podeGerar={orcamentosNoPlano}
                              />
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </Quadro>
          </div>
        ) : (
          <div
            role="tabpanel"
            id={`${ids}-painel-conferencia`}
            aria-labelledby={`${ids}-aba-conferencia`}
          >
            <Quadro
              titulo="Aguardando conferência"
              consulta={conferencias}
              vazio="Nenhuma evidência aguardando conferência."
              iconeVazio="inbox"
              pagina={paginaConferencia}
              aoMudarPagina={setPaginaConferencia}
            >
              {(itens) => (
                <>
                  <div className={classeTabela}>
                    <table className="w-full border-collapse corpo">
                      <thead>
                        <tr>
                          <th scope="col" className={cn(classeCabecalho, 'w-[120px]')}>
                            Enviado há
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Evidência
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Responsável
                          </th>
                          <th scope="col" className={classeCabecalho}>
                            Conferente
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => (
                          <tr
                            key={item.ocorrenciaId}
                            className="transicao-estado hover:bg-(--toque)"
                          >
                            <td className={`${classeCelula} corpo-medio whitespace-nowrap numero`}>
                              {tempoDesde(item.enviadaEm, agora)}
                            </td>
                            <td className={`${classeCelula} max-w-[420px]`}>
                              <Link
                                to={`/ocorrencias/${item.ocorrenciaId}`}
                                className="block truncate text-(--tinta)"
                                title={item.titulo}
                              >
                                <span className="text-(--tinta-2) numero">{item.codigo} · </span>
                                {item.titulo}
                              </Link>
                              <span className="block truncate text-xs text-(--tinta-2)">
                                {item.empreendimentoNome}
                              </span>
                            </td>
                            <td className={`${classeCelula} whitespace-nowrap`}>
                              {item.responsavelNome ? (
                                <span className="flex items-center gap-(--e-2)">
                                  <Avatar nome={item.responsavelNome} />
                                  {item.responsavelNome}
                                </span>
                              ) : (
                                <span className="text-(--tinta-2)">Sem responsável</span>
                              )}
                            </td>
                            <td className={`${classeCelula} whitespace-nowrap`}>
                              {item.conferenteNome ?? (
                                <span className="text-(--tinta-2)">Gestão</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="flex flex-col md:hidden" aria-label="Aguardando conferência">
                    {itens.map((item) => (
                      <li
                        key={item.ocorrenciaId}
                        className="flex gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0"
                      >
                        <span className="w-[56px] shrink-0 corpo-medio text-(--tinta) numero">
                          {tempoDesde(item.enviadaEm, agora)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-(--e-05)">
                          <Link to={`/ocorrencias/${item.ocorrenciaId}`} className="text-(--tinta)">
                            <span className="text-(--tinta-2) numero">{item.codigo} · </span>
                            {item.titulo}
                          </Link>
                          <span className="text-xs text-(--tinta-2)">
                            {item.empreendimentoNome} · {item.responsavelNome ?? 'Sem responsável'}{' '}
                            · confere {item.conferenteNome ?? 'a Gestão'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Quadro>
          </div>
        )}
      </div>
    </Pagina>
  )
}
