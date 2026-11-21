import { formatarDataCivil } from '@gestao-ambiental/domain'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Contagem } from '@/app/paginas/visao/Contagem'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { AbasDeFiltro } from '@/components/ui/abas'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import {
  TAMANHO_PAGINA_EXIGENCIAS,
  listarExigencias,
  type Exigencia,
  type FiltroSituacaoExigencia,
} from '@/lib/api/exigencias'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { atualizarDepoisDeMudarExigencia } from './cache'
import { DialogoExigencia } from './DialogoExigencia'
import { SeloDaExigencia } from './pecas'

const FILTROS: readonly { valor: FiltroSituacaoExigencia; rotulo: string }[] = [
  { valor: 'abertas', rotulo: 'Abertas' },
  { valor: 'respondidas', rotulo: 'Respondidas' },
  { valor: 'todas', rotulo: 'Todas' },
]

const VAZIO: Record<FiltroSituacaoExigencia, string> = {
  abertas: 'Nenhuma exigência aberta.',
  respondidas: 'Nenhuma exigência respondida.',
  todas: 'Nenhuma exigência registrada.',
}

const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'
const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'

function lerFiltro(valor: string | null): FiltroSituacaoExigencia {
  return valor === 'respondidas' || valor === 'todas' ? valor : 'abertas'
}

/** "Faltam": a contagem da exigência aberta; a respondida leva o visto. */
function Faltam({ exigencia, ordem }: { exigencia: Exigencia; ordem: number }) {
  if (exigencia.situacao === 'respondida') {
    return (
      <span aria-hidden className="inline-flex w-[56px] shrink-0 text-(--ok-texto)">
        <Icone nome="check" tamanho={20} />
      </span>
    )
  }
  return <Contagem dias={exigencia.dias} ordem={ordem} />
}

function Responsavel({ nome }: { nome: string | null }) {
  return nome ? (
    <span className="flex items-center gap-(--e-2)">
      <Avatar nome={nome} />
      <span className="truncate">{nome}</span>
    </span>
  ) : (
    <span className="text-(--tinta-2)">Sem responsável</span>
  )
}

function Oficio({ exigencia }: { exigencia: Exigencia }) {
  return (
    <Link
      to={`/exigencias/${exigencia.id}`}
      className="block min-w-0 truncate text-(--tinta)"
      title={exigencia.assunto}
    >
      {exigencia.numeroOficio ? (
        <span className="font-mono text-(--tinta-2) numero">{exigencia.numeroOficio} · </span>
      ) : null}
      {exigencia.assunto}
    </Link>
  )
}

/**
 * Aba Exigências do órgão em Acompanhamentos (ADR-0045): Abertas, Respondidas ou Todas, abertas pelo
 * prazo. A Gestão registra daqui; todo membro vê.
 */
export function PainelExigencias() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ehGestao = atual.papel === 'gestao'
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const filtro = lerFiltro(parametros.get('situacao'))
  const [pagina, setPagina] = useState(0)
  const [registrando, setRegistrando] = useState(false)

  const exigencias = useQuery({
    queryKey: ['exigencias', cid, 'painel', filtro, pagina],
    queryFn: () => listarExigencias(cid, { situacao: filtro, pagina }),
    placeholderData: keepPreviousData,
  })

  function filtrar(novo: FiltroSituacaoExigencia) {
    setPagina(0)
    setParametros(
      (p) => {
        const proximo = new URLSearchParams(p)
        if (novo === 'abertas') proximo.delete('situacao')
        else proximo.set('situacao', novo)
        return proximo
      },
      { replace: true },
    )
  }

  const total = exigencias.data?.total ?? 0
  const itens = exigencias.data?.itens ?? []
  const inicio = pagina * TAMANHO_PAGINA_EXIGENCIAS
  const fim = Math.min(total, inicio + itens.length)

  return (
    <div className="flex flex-col gap-(--e-4)">
      <div className="flex flex-wrap items-end justify-between gap-(--e-3)">
        <AbasDeFiltro
          rotulo="Situação das exigências"
          abas={FILTROS}
          valor={filtro}
          aoMudar={filtrar}
          className="max-w-full flex-1"
        />
        {ehGestao ? (
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              setRegistrando(true)
            }}
          >
            Registrar exigência
          </Botao>
        ) : null}
      </div>

      {exigencias.isPending ? (
        <Carregando rotulo="Carregando exigências" linhas={4} />
      ) : exigencias.isError ? (
        ehSemPermissao(exigencias.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar as exigências."
            aoTentarDeNovo={() => void exigencias.refetch()}
          />
        )
      ) : total === 0 ? (
        <EstadoVazio icone="flag" titulo={VAZIO[filtro]} />
      ) : (
        <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          <div className="hidden max-h-[calc(100dvh-280px)] overflow-auto md:block [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-(--folha)">
            <table className="w-full border-collapse corpo">
              <caption className="sr-only">Exigências do órgão</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(classeCabecalho, 'w-[88px]')}>
                    Faltam
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Prazo
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Ofício
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Empreendimento
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Licença
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Responsável
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((e, indice) => {
                  const hoje = e.situacao === 'aberta' && e.dias === 0
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        'transicao-estado hover:bg-(--toque)',
                        hoje && 'bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
                      )}
                    >
                      <td className={classeCelula}>
                        <Faltam exigencia={e} ordem={indice} />
                      </td>
                      <td className={cn(classeCelula, 'corpo-medio whitespace-nowrap numero')}>
                        {formatarDataCivil(e.prazoOficial)}
                      </td>
                      <td className={cn(classeCelula, 'max-w-[360px]')}>
                        <Oficio exigencia={e} />
                      </td>
                      <td className={cn(classeCelula, 'max-w-[220px] truncate')}>
                        {e.empreendimentoNome}
                      </td>
                      <td className={cn(classeCelula, 'whitespace-nowrap numero')}>
                        {e.licenca ?? <span className="text-(--tinta-2)">—</span>}
                      </td>
                      <td className={cn(classeCelula, 'max-w-[200px] whitespace-nowrap')}>
                        <Responsavel nome={e.responsavelNome} />
                      </td>
                      <td className={classeCelula}>
                        <SeloDaExigencia exigencia={e} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col md:hidden" aria-label="Exigências do órgão">
            {itens.map((e, indice) => (
              <li
                key={e.id}
                className={cn(
                  'flex gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0',
                  e.situacao === 'aberta' && e.dias === 0 && 'bg-(--sinal-fundo)',
                )}
              >
                <Faltam exigencia={e} ordem={indice} />
                <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                  <Oficio exigencia={e} />
                  <span className="truncate text-xs text-(--tinta-2)">
                    {[e.empreendimentoNome, e.licenca].filter(Boolean).join(' · ')}
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-(--e-2)">
                    <span className="text-xs text-(--tinta-2) numero">
                      Prazo{' '}
                      <span className="font-[750] text-(--tinta)">
                        {formatarDataCivil(e.prazoOficial)}
                      </span>
                    </span>
                    <SeloDaExigencia exigencia={e} />
                  </span>
                  <span className="text-xs">
                    <Responsavel nome={e.responsavelNome} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
            <span className="flex-1 rotulo numero" aria-live="polite">
              {inicio + 1}–{fim} de {total}
            </span>
            <BotaoIcone
              icone="chevron-left"
              rotulo="Página anterior"
              disabled={pagina === 0}
              onClick={() => {
                setPagina((p) => Math.max(0, p - 1))
              }}
            />
            <BotaoIcone
              icone="chevron-right"
              rotulo="Próxima página"
              disabled={fim >= total}
              onClick={() => {
                setPagina((p) => p + 1)
              }}
            />
          </div>
        </div>
      )}

      {registrando ? (
        <DialogoExigencia
          modo={{ tipo: 'novo' }}
          aoFechar={() => {
            setRegistrando(false)
          }}
          aoSalvar={async (id) => {
            setRegistrando(false)
            await atualizarDepoisDeMudarExigencia(queryClient)
            void navegar(`/exigencias/${id}`)
          }}
        />
      ) : null}
    </div>
  )
}
