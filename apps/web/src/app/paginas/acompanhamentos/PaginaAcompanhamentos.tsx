import { datasRenovacaoLao, formatarDataCivil, situacaoDaRenovacao } from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { SiglaEmpreendimento } from '@/app/paginas/empreendimentos/SiglaEmpreendimento'
import { Carregando, EstadoErro } from '@/components/estados'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_ACOMPANHAMENTOS,
  listarAguardandoConferencia,
  listarRenovacoes,
  type Pagina as PaginaDeItens,
} from '@/lib/api/renovacoes'
import { tempoDesde } from '@/lib/datas'

import { SeloRenovacao } from './SeloRenovacao'

const classeCelula = 'h-11 border-b px-(--space-100) align-middle first:pl-(--space-150)'
const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'

function Paginador({
  pagina,
  total,
  aoMudar,
}: {
  pagina: number
  total: number
  aoMudar: (pagina: number) => void
}) {
  if (total <= TAMANHO_PAGINA_ACOMPANHAMENTOS) return null
  const inicio = pagina * TAMANHO_PAGINA_ACOMPANHAMENTOS
  const fim = Math.min(total, inicio + TAMANHO_PAGINA_ACOMPANHAMENTOS)
  return (
    <div className="flex items-center gap-(--space-100) border-t px-(--space-150) py-(--space-100)">
      <span className="flex-1 text-xs text-(--text-subtle)" aria-live="polite">
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

/** Cartão de lista compacta (EQ-05): título, contagem, estados e paginação. */
function Cartao<T>({
  id,
  titulo,
  consulta,
  vazio,
  pagina,
  aoMudarPagina,
  children,
}: {
  id: string
  titulo: string
  consulta: {
    isPending: boolean
    isError: boolean
    data?: PaginaDeItens<T>
    refetch: () => unknown
  }
  vazio: string
  pagina: number
  aoMudarPagina: (pagina: number) => void
  children: (itens: T[]) => ReactNode
}) {
  const total = consulta.data?.total ?? 0
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col overflow-hidden rounded-(--radius) border bg-(--surface)"
    >
      <header className="flex items-center justify-between gap-(--space-100) border-b px-(--space-150) py-(--space-150)">
        <h2 id={id} className="titulo-secao">
          {titulo}
        </h2>
        {consulta.data ? <Selo tom="revisao">{total}</Selo> : null}
      </header>
      {consulta.isPending ? (
        <Carregando
          rotulo={`Carregando ${titulo.toLowerCase()}`}
          linhas={3}
          className="p-(--space-150)"
        />
      ) : consulta.isError ? (
        <EstadoErro
          titulo={`Não foi possível carregar ${titulo.toLowerCase()}.`}
          aoTentarDeNovo={() => void consulta.refetch()}
          className="p-(--space-150)"
        />
      ) : total === 0 ? (
        <p className="px-(--space-150) py-(--space-200) text-(--text-subtle)">{vazio}</p>
      ) : (
        <>
          {children(consulta.data?.itens ?? [])}
          <Paginador pagina={pagina} total={total} aoMudar={aoMudarPagina} />
        </>
      )}
    </section>
  )
}

/**
 * /acompanhamentos (Protótipo 17, artboard 01; EQ-05): evidências aguardando conferência e
 * renovações de LAO no radar, com limite de protocolo e preparação já calculados.
 */
export function PaginaAcompanhamentos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const [paginaConferencia, setPaginaConferencia] = useState(0)
  const [paginaRenovacao, setPaginaRenovacao] = useState(0)

  const conferencias = useQuery({
    queryKey: ['aguardando-conferencia', cid, paginaConferencia],
    queryFn: () => listarAguardandoConferencia(cid, paginaConferencia),
    placeholderData: keepPreviousData,
  })
  const renovacoes = useQuery({
    queryKey: ['renovacoes', cid, paginaRenovacao],
    queryFn: () => listarRenovacoes(cid, paginaRenovacao),
    placeholderData: keepPreviousData,
  })
  const agora = new Date()

  return (
    <Pagina titulo="Acompanhamentos">
      <div className="grid items-start gap-(--space-200) xl:grid-cols-2">
        <Cartao
          id="titulo-conferencias"
          titulo="Aguardando conferência"
          consulta={conferencias}
          vazio="Nenhuma evidência aguardando conferência."
          pagina={paginaConferencia}
          aoMudarPagina={setPaginaConferencia}
        >
          {(itens) => (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse corpo">
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        Evidência
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Responsável
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Conferente
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Enviado há
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.ocorrenciaId} className="hover:bg-(--neutral-subtle-hover)">
                        <td className={`${classeCelula} max-w-[280px]`}>
                          <Link
                            to={`/ocorrencias/${item.ocorrenciaId}`}
                            className="block truncate text-(--text) hover:underline"
                            title={item.titulo}
                          >
                            <span className="font-mono text-xs text-(--text-subtle)">
                              {item.codigo} ·{' '}
                            </span>
                            {item.titulo}
                          </Link>
                          <span className="block truncate text-xs text-(--text-subtle)">
                            {item.empreendimentoNome}
                          </span>
                        </td>
                        <td className={`${classeCelula} whitespace-nowrap`}>
                          {item.responsavelNome ?? (
                            <span className="text-(--text-subtle)">Sem responsável</span>
                          )}
                        </td>
                        <td className={`${classeCelula} whitespace-nowrap`}>
                          {item.conferenteNome ?? (
                            <span className="text-(--text-subtle)">Gestão</span>
                          )}
                        </td>
                        <td className={`${classeCelula} whitespace-nowrap`}>
                          {tempoDesde(item.enviadaEm, agora)}
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
                    className="flex flex-col gap-(--space-025) border-b px-(--space-150) py-(--space-100) last:border-b-0"
                  >
                    <Link
                      to={`/ocorrencias/${item.ocorrenciaId}`}
                      className="text-(--text) hover:underline"
                    >
                      <span className="font-mono text-xs text-(--text-subtle)">
                        {item.codigo} ·{' '}
                      </span>
                      {item.titulo}
                    </Link>
                    <span className="text-xs text-(--text-subtle)">
                      {item.empreendimentoNome} · confere {item.conferenteNome ?? 'a Gestão'} ·
                      enviado há {tempoDesde(item.enviadaEm, agora)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao
          id="titulo-renovacoes"
          titulo="Renovações no radar"
          consulta={renovacoes}
          vazio="Nenhuma LAO ativa para renovar."
          pagina={paginaRenovacao}
          aoMudarPagina={setPaginaRenovacao}
        >
          {(itens) => (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse corpo">
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        Licença
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Vencimento
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Limite
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Situação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => {
                      const { limiteProtocolo } = datasRenovacaoLao(
                        item.validade,
                        item.antecedencia,
                        item.diasLimite,
                      )
                      return (
                        <tr key={item.instrumentoId} className="hover:bg-(--neutral-subtle-hover)">
                          <td className={`${classeCelula} max-w-[240px]`}>
                            <span className="flex items-center gap-(--space-100)">
                              <SiglaEmpreendimento nome={item.empreendimentoNome} />
                              <span className="flex min-w-0 flex-col">
                                <Link
                                  to={`/renovacoes/${item.instrumentoId}`}
                                  className="truncate corpo-medio text-(--text) hover:underline"
                                >
                                  {item.licenca}
                                </Link>
                                <span className="truncate text-xs text-(--text-subtle)">
                                  {item.empreendimentoNome}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={`${classeCelula} whitespace-nowrap`}>
                            {formatarDataCivil(item.validade)}
                          </td>
                          <td className={`${classeCelula} whitespace-nowrap`}>
                            {formatarDataCivil(limiteProtocolo)}
                          </td>
                          <td className={classeCelula}>
                            <SeloRenovacao
                              situacao={situacaoDaRenovacao({
                                vencimento: item.validade,
                                antecedencia: item.antecedencia,
                                diasLimite: item.diasLimite,
                                protocoladoEm: item.protocoladoEm,
                                acompanhamentoDias: item.acompanhamentoDias,
                                hoje: item.hoje,
                              })}
                              hoje={item.hoje}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col md:hidden" aria-label="Renovações no radar">
                {itens.map((item) => {
                  const { limiteProtocolo } = datasRenovacaoLao(
                    item.validade,
                    item.antecedencia,
                    item.diasLimite,
                  )
                  return (
                    <li
                      key={item.instrumentoId}
                      className="flex flex-col gap-(--space-050) border-b px-(--space-150) py-(--space-100) last:border-b-0"
                    >
                      <span className="flex items-center justify-between gap-(--space-100)">
                        <Link
                          to={`/renovacoes/${item.instrumentoId}`}
                          className="corpo-medio text-(--text) hover:underline"
                        >
                          {item.licenca}
                        </Link>
                        <SeloRenovacao
                          situacao={situacaoDaRenovacao({
                            vencimento: item.validade,
                            antecedencia: item.antecedencia,
                            diasLimite: item.diasLimite,
                            protocoladoEm: item.protocoladoEm,
                            acompanhamentoDias: item.acompanhamentoDias,
                            hoje: item.hoje,
                          })}
                          hoje={item.hoje}
                        />
                      </span>
                      <span className="text-xs text-(--text-subtle)">
                        {item.empreendimentoNome} · limite {formatarDataCivil(limiteProtocolo)} ·
                        vence {formatarDataCivil(item.validade)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Cartao>
      </div>
    </Pagina>
  )
}
