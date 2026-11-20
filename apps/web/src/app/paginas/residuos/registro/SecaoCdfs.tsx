// Resíduos, fase 1 (ADR-0028): CDFs do empreendimento, com PDF, edição e exclusão. Fica na mesma
// página dos MTRs (/empreendimentos/:id/residuos), abaixo da lista de MTRs.

import { formatarDataCivil, type DataCivil } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  TAMANHO_PAGINA_RESIDUOS,
  excluirCdf,
  listarCdfs,
  urlDoPdfResiduo,
  type Cdf,
} from '@/lib/api/residuos'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  RodapeDoQuadro,
  TituloDoPainel,
  classeCabecalho,
  classeCelula,
  classeItemCelular,
  classeLinha,
  classePainel,
  classeRegiao,
} from '../quadro'
import { DialogoCdf } from './DialogoCdf'

function periodo(cdf: Cdf): string {
  return `${formatarDataCivil(cdf.periodoInicio)} a ${formatarDataCivil(cdf.periodoFim)}`
}

function MtrsDoCdf({ cdf }: { cdf: Cdf }) {
  return cdf.mtrs.length > 0 ? (
    <span className="numero">{cdf.mtrs.map((m) => m.numero).join(', ')}</span>
  ) : (
    <span className="text-(--tinta-2)">Nenhum</span>
  )
}

type Aberto = { tipo: 'editar'; cdf: Cdf } | { tipo: 'excluir'; cdf: Cdf } | null

export function SecaoCdfs({
  empreendimentoId,
  consultoriaId,
  hoje,
  aoMudarDados,
}: {
  empreendimentoId: string
  consultoriaId: string
  hoje: DataCivil
  /** Depois de editar ou excluir: recarrega MTRs, CDFs, conferência e painel. */
  aoMudarDados: () => void
}) {
  const [aberto, setAberto] = useState<Aberto>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cdfs = useInfiniteQuery({
    queryKey: ['cdfs', consultoriaId, empreendimentoId],
    queryFn: ({ pageParam }) => listarCdfs(consultoriaId, { empreendimentoId }, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_RESIDUOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })
  const abrirPdf = useMutation({
    mutationFn: urlDoPdfResiduo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const excluir = useMutation({
    mutationFn: (cdf: Cdf) => excluirCdf(cdf.id, cdf.rowVersion),
    onSuccess: (_, cdf) => {
      setAberto(null)
      setAviso(`CDF ${cdf.numero} excluído.`)
      aoMudarDados()
    },
  })

  const lista = cdfs.data?.pages.flatMap((p) => p.itens) ?? []
  const total = cdfs.data?.pages[0]?.total ?? 0

  function acoes(cdf: Cdf) {
    return (
      <span className="flex shrink-0 justify-end gap-(--e-05)">
        {cdf.pdf ? (
          <BotaoIcone
            icone="file-text"
            rotulo={`Abrir PDF do CDF ${cdf.numero}`}
            disabled={abrirPdf.isPending}
            onClick={() => {
              if (cdf.pdf) abrirPdf.mutate(cdf.pdf.caminho)
            }}
          />
        ) : null}
        <BotaoIcone
          icone="pencil"
          rotulo={`Editar CDF ${cdf.numero}`}
          onClick={() => {
            setAviso(null)
            setAberto({ tipo: 'editar', cdf })
          }}
        />
        <BotaoIcone
          icone="trash-2"
          rotulo={`Excluir CDF ${cdf.numero}`}
          onClick={() => {
            setAviso(null)
            excluir.reset()
            setAberto({ tipo: 'excluir', cdf })
          }}
        />
      </span>
    )
  }

  let conteudo
  if (cdfs.isPending) {
    conteudo = <Carregando rotulo="Carregando CDFs" linhas={2} className="border-0" />
  } else if (cdfs.isError) {
    conteudo = ehSemPermissao(cdfs.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os CDFs."
        aoTentarDeNovo={() => void cdfs.refetch()}
        className="m-(--e-3)"
      />
    )
  } else if (lista.length === 0) {
    conteudo = <EstadoVazio icone="file-check" titulo="Nenhum CDF registrado" />
  } else {
    conteudo = (
      <>
        <div className={cn(classeRegiao, 'hidden md:block')}>
          <table className="w-full border-collapse corpo">
            <caption className="sr-only">CDFs do empreendimento</caption>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  CDF
                </th>
                <th scope="col" className={classeCabecalho}>
                  Emissão
                </th>
                <th scope="col" className={classeCabecalho}>
                  Destinador
                </th>
                <th scope="col" className={classeCabecalho}>
                  Período
                </th>
                <th scope="col" className={classeCabecalho}>
                  MTRs
                </th>
                <th scope="col" className={classeCabecalho}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((cdf) => (
                <tr key={cdf.id} className={classeLinha}>
                  <td className={`${classeCelula} whitespace-nowrap corpo-medio numero`}>
                    {cdf.numero}
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap numero`}>
                    {formatarDataCivil(cdf.emitidoEm)}
                  </td>
                  <td className={classeCelula}>
                    <span className="block max-w-[260px] truncate" title={cdf.destinadorNome}>
                      {cdf.destinadorNome}
                    </span>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap numero`}>{periodo(cdf)}</td>
                  <td className={classeCelula}>
                    <MtrsDoCdf cdf={cdf} />
                  </td>
                  <td className={`${classeCelula} w-px whitespace-nowrap`}>{acoes(cdf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul aria-label="CDFs do empreendimento" className="flex flex-col md:hidden">
          {lista.map((cdf) => (
            <li key={cdf.id} className={classeItemCelular}>
              <span className="flex items-start justify-between gap-(--e-2)">
                <span className="flex min-w-0 flex-col">
                  <span className="corpo-medio numero">CDF {cdf.numero}</span>
                  <span className="rotulo numero">{formatarDataCivil(cdf.emitidoEm)}</span>
                </span>
                {acoes(cdf)}
              </span>
              <span className="truncate">{cdf.destinadorNome}</span>
              <span className="text-xs text-(--tinta-2) numero">{periodo(cdf)}</span>
              <span className="text-xs">
                <MtrsDoCdf cdf={cdf} />
              </span>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <section aria-labelledby="titulo-secao-cdfs" className={classePainel}>
      <TituloDoPainel id="titulo-secao-cdfs" contagem={cdfs.isSuccess ? total : null}>
        CDFs
      </TituloDoPainel>
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso" className="m-(--e-3)">
          {aviso}
        </MensagemSecao>
      ) : null}
      {abrirPdf.isError ? (
        <MensagemSecao role="alert" tom="perigo" className="m-(--e-3)">
          {mensagemDoErro(abrirPdf.error)}
        </MensagemSecao>
      ) : null}
      {conteudo}
      {lista.length > 0 ? (
        <RodapeDoQuadro
          texto={`${String(lista.length)} de ${String(total)} ${total === 1 ? 'CDF' : 'CDFs'}`}
        >
          {cdfs.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={cdfs.isFetchingNextPage}
              onClick={() => void cdfs.fetchNextPage()}
            >
              Mostrar mais CDFs
            </Botao>
          ) : null}
        </RodapeDoQuadro>
      ) : null}

      {aberto?.tipo === 'editar' ? (
        <DialogoCdf
          aoMudar={(abrir) => {
            if (!abrir) setAberto(null)
          }}
          empreendimentoId={empreendimentoId}
          consultoriaId={consultoriaId}
          hoje={hoje}
          existente={aberto.cdf}
          aoSalvar={aoMudarDados}
        />
      ) : null}
      {aberto?.tipo === 'excluir' ? (
        <Dialogo
          aberto
          aoMudar={(abrir) => {
            if (!abrir) setAberto(null)
          }}
          titulo={`Excluir CDF ${aberto.cdf.numero}?`}
          acoes={
            <>
              <Botao
                onClick={() => {
                  setAberto(null)
                }}
              >
                Cancelar
              </Botao>
              <Botao
                aparencia="perigo"
                disabled={excluir.isPending}
                onClick={() => {
                  excluir.mutate(aberto.cdf)
                }}
              >
                {excluir.isPending ? 'Excluindo…' : 'Excluir CDF'}
              </Botao>
            </>
          }
        >
          {excluir.isError ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErro(excluir.error)}
            </MensagemSecao>
          ) : (
            <p>
              {aberto.cdf.mtrs.length > 0
                ? `Os MTRs ${aberto.cdf.mtrs.map((m) => m.numero).join(', ')} deixam de ser cobertos por este CDF.`
                : `Emitido em ${formatarDataCivil(aberto.cdf.emitidoEm)} por ${aberto.cdf.destinadorNome}.`}
            </p>
          )}
        </Dialogo>
      ) : null}
    </section>
  )
}
