import {
  ROTULO_DA_SITUACAO_DO_MTR,
  SITUACOES_DO_MTR,
  ehSituacaoMtr,
  formatarDataCivil,
  hojeNoFuso,
  type DataCivil,
  type SituacaoMtr,
} from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import {
  RodapeDoQuadro,
  TituloDoPainel,
  classeCabecalho,
  classeCelula,
  classeItemCelular,
  classeLinha,
  classePainel,
  classeRegiao,
} from '@/app/paginas/residuos/quadro'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoData } from '@/components/ui/campo-data'
import { Dialogo } from '@/components/ui/dialogo'
import { classeCampo, classeSelecao } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { obterEmpreendimento } from '@/lib/api/empreendimentos'
import {
  TAMANHO_PAGINA_RESIDUOS,
  excluirMtr,
  listarMtrs,
  urlDoPdfResiduo,
  type Mtr,
} from '@/lib/api/residuos'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { SeloSituacaoMtr } from './campos'
import { PARAMETRO_REGISTRAR, resumoDosItens } from './comum'
import { DialogoCdf } from './DialogoCdf'
import { DialogoMtr } from './DialogoMtr'
import { SecaoCdfs } from './SecaoCdfs'

interface Filtros {
  de: DataCivil | null
  ate: DataCivil | null
  situacao: SituacaoMtr | null
  semCdf: boolean
  busca: string
}

const SEM_FILTROS: Filtros = { de: null, ate: null, situacao: null, semCdf: false, busca: '' }

type Aberto =
  { tipo: 'mtr'; existente?: Mtr } | { tipo: 'cdf' } | { tipo: 'excluir'; mtr: Mtr } | null

function CdfsDoMtr({ mtr }: { mtr: Mtr }) {
  return mtr.cdfs.length > 0 ? (
    <span className="numero">{mtr.cdfs.map((c) => c.numero).join(', ')}</span>
  ) : (
    <span className="text-(--tinta-2)">Sem CDF</span>
  )
}

/**
 * /empreendimentos/:id/residuos (rota sugerida; resíduos fase 1, sem integração com o IMA). MTRs
 * do empreendimento por período, situação e "sem CDF", com registro, edição, exclusão e PDF do MTR,
 * e o registro do CDF que cobre os MTRs. `?registrar=cdf` já abre o registro do CDF (vem da
 * conferência).
 */
export function PaginaMtrs() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [parametros, setParametros] = useSearchParams()
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS)
  const busca = useDeferredValue(filtros.busca.trim())
  const [aberto, setAberto] = useState<Aberto>(() =>
    parametros.get(PARAMETRO_REGISTRAR) === 'cdf' ? { tipo: 'cdf' } : null,
  )
  const [aviso, setAviso] = useState<string | null>(null)

  const empreendimento = useQuery({
    queryKey: ['empreendimento', id],
    queryFn: () => obterEmpreendimento(id),
  })
  const mtrs = useInfiniteQuery({
    queryKey: [
      'mtrs',
      atual.consultoriaId,
      id,
      filtros.de,
      filtros.ate,
      filtros.situacao,
      filtros.semCdf,
      busca,
    ],
    queryFn: ({ pageParam }) =>
      listarMtrs(
        atual.consultoriaId,
        {
          empreendimentoId: id,
          de: filtros.de,
          ate: filtros.ate,
          situacao: filtros.situacao,
          semCdf: filtros.semCdf,
          busca,
        },
        pageParam,
      ),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, p) => soma + p.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_RESIDUOS && carregados < ultima.total
        ? todas.length
        : undefined
    },
    enabled: Boolean(empreendimento.data),
  })

  const abrirPdf = useMutation({
    mutationFn: urlDoPdfResiduo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const excluir = useMutation({
    mutationFn: (mtr: Mtr) => excluirMtr(mtr.id, mtr.rowVersion),
    onSuccess: (_, mtr) => {
      setAberto(null)
      setAviso(`MTR ${mtr.numero} excluído.`)
      recarregar()
    },
  })

  const nome = empreendimento.data?.nome
  // Depois do efeito da <Pagina> (filho): a aba do navegador leva o nome do empreendimento.
  useEffect(() => {
    document.title = `Resíduos · ${nome ?? 'Empreendimento'} · Grama`
  }, [nome])

  function recarregar() {
    void queryClient.invalidateQueries({ queryKey: ['mtrs', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['cdfs', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['conferencia-residuos', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['painel-residuos', atual.consultoriaId] })
  }

  function fechar() {
    setAberto(null)
    if (parametros.has(PARAMETRO_REGISTRAR)) {
      setParametros(
        (antes) => {
          const novos = new URLSearchParams(antes)
          novos.delete(PARAMETRO_REGISTRAR)
          return novos
        },
        { replace: true },
      )
    }
  }

  function abrir(novo: Exclude<Aberto, null>) {
    setAviso(null)
    setAberto(novo)
  }

  const voltar = { para: `/empreendimentos/${id}`, rotulo: nome ?? 'Empreendimento' }

  if (empreendimento.isPending) {
    return (
      <Pagina titulo="Resíduos" voltar={voltar}>
        <Carregando rotulo="Carregando o empreendimento" linhas={4} />
      </Pagina>
    )
  }
  if (empreendimento.isError) {
    return (
      <Pagina titulo="Resíduos" voltar={voltar}>
        {ehSemPermissao(empreendimento.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o empreendimento."
            aoTentarDeNovo={() => void empreendimento.refetch()}
          />
        )}
      </Pagina>
    )
  }
  if (!empreendimento.data) {
    return (
      <Pagina titulo="Resíduos" voltar={{ para: '/empreendimentos', rotulo: 'Empreendimentos' }}>
        <EstadoVazio
          icone="briefcase"
          titulo="Empreendimento não encontrado"
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Voltar para Empreendimentos</Link>
            </Botao>
          }
        />
      </Pagina>
    )
  }

  const lista = mtrs.data?.pages.flatMap((p) => p.itens) ?? []
  const total = mtrs.data?.pages[0]?.total ?? 0
  const filtrando =
    filtros.de !== null ||
    filtros.ate !== null ||
    filtros.situacao !== null ||
    filtros.semCdf ||
    busca !== ''

  function acoesDoMtr(mtr: Mtr) {
    return (
      <span className="flex shrink-0 justify-end gap-(--e-05)">
        {mtr.pdf ? (
          <BotaoIcone
            icone="file-text"
            rotulo={`Abrir PDF do MTR ${mtr.numero}`}
            disabled={abrirPdf.isPending}
            onClick={() => {
              if (mtr.pdf) abrirPdf.mutate(mtr.pdf.caminho)
            }}
          />
        ) : null}
        <BotaoIcone
          icone="pencil"
          rotulo={`Editar MTR ${mtr.numero}`}
          onClick={() => {
            abrir({ tipo: 'mtr', existente: mtr })
          }}
        />
        <BotaoIcone
          icone="trash-2"
          rotulo={`Excluir MTR ${mtr.numero}`}
          onClick={() => {
            excluir.reset()
            abrir({ tipo: 'excluir', mtr })
          }}
        />
      </span>
    )
  }

  let conteudo
  if (mtrs.isPending) {
    conteudo = <Carregando rotulo="Carregando MTRs" linhas={4} className="border-0" />
  } else if (mtrs.isError) {
    conteudo = ehSemPermissao(mtrs.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar os MTRs."
        aoTentarDeNovo={() => void mtrs.refetch()}
        className="m-(--e-3)"
      />
    )
  } else if (lista.length === 0) {
    conteudo = filtrando ? (
      <EstadoVazio
        icone="search"
        titulo="Nenhum MTR com estes filtros"
        acaoPrincipal={
          <Botao
            onClick={() => {
              setFiltros(SEM_FILTROS)
            }}
          >
            Limpar filtros
          </Botao>
        }
      />
    ) : (
      <EstadoVazio
        icone="file-text"
        titulo="Nenhum MTR registrado"
        acaoPrincipal={
          <Botao
            iconeAntes="plus"
            onClick={() => {
              abrir({ tipo: 'mtr' })
            }}
          >
            Registrar MTR
          </Botao>
        }
      />
    )
  } else {
    conteudo = (
      <>
        <div className={cn(classeRegiao, 'hidden md:block')}>
          <table className="w-full border-collapse corpo">
            <caption className="sr-only">MTRs do empreendimento</caption>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  MTR
                </th>
                <th scope="col" className={classeCabecalho}>
                  Emissão
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={cn(classeCabecalho, 'hidden 2xl:table-cell')}>
                  Transportador
                </th>
                <th scope="col" className={classeCabecalho}>
                  Destinador
                </th>
                <th scope="col" className={classeCabecalho}>
                  Resíduos
                </th>
                <th scope="col" className={classeCabecalho}>
                  CDF
                </th>
                <th scope="col" className={classeCabecalho}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((mtr) => (
                <tr key={mtr.id} className={classeLinha}>
                  <td className={`${classeCelula} whitespace-nowrap corpo-medio numero`}>
                    {mtr.numero}
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap numero`}>
                    {formatarDataCivil(mtr.emitidoEm)}
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    <SeloSituacaoMtr situacao={mtr.situacao} />
                  </td>
                  <td className={cn(classeCelula, 'hidden 2xl:table-cell')}>
                    <span className="block max-w-[220px] truncate" title={mtr.transportadorNome}>
                      {mtr.transportadorNome}
                    </span>
                  </td>
                  <td className={classeCelula}>
                    <span className="block max-w-[200px] truncate" title={mtr.destinadorNome}>
                      {mtr.destinadorNome}
                    </span>
                  </td>
                  <td className={classeCelula}>
                    <span
                      className="block max-w-[220px] truncate numero"
                      title={resumoDosItens(mtr.itens, mtr.itens.length)}
                    >
                      {resumoDosItens(mtr.itens)}
                    </span>
                  </td>
                  <td className={`${classeCelula} whitespace-nowrap`}>
                    <CdfsDoMtr mtr={mtr} />
                  </td>
                  <td className={`${classeCelula} w-px whitespace-nowrap`}>{acoesDoMtr(mtr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul aria-label="MTRs do empreendimento" className="flex flex-col md:hidden">
          {lista.map((mtr) => (
            <li key={mtr.id} className={classeItemCelular}>
              <span className="flex items-start justify-between gap-(--e-2)">
                <span className="flex min-w-0 flex-col">
                  <span className="corpo-medio numero">MTR {mtr.numero}</span>
                  <span className="rotulo numero">{formatarDataCivil(mtr.emitidoEm)}</span>
                </span>
                {acoesDoMtr(mtr)}
              </span>
              <SeloSituacaoMtr situacao={mtr.situacao} />
              <span className="truncate">{mtr.destinadorNome}</span>
              <span className="truncate text-(--tinta-2) numero">
                {resumoDosItens(mtr.itens, 1)}
              </span>
              <span className="text-xs">
                <CdfsDoMtr mtr={mtr} />
              </span>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <Pagina
      titulo="Resíduos"
      voltar={voltar}
      acao={
        <>
          <Botao
            iconeAntes="file-check"
            onClick={() => {
              abrir({ tipo: 'cdf' })
            }}
          >
            Registrar CDF
          </Botao>
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              abrir({ tipo: 'mtr' })
            }}
          >
            Registrar MTR
          </Botao>
        </>
      }
    >
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}
      {abrirPdf.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(abrirPdf.error)}
        </MensagemSecao>
      ) : null}

      <section aria-labelledby="titulo-secao-mtrs" className={classePainel}>
        <TituloDoPainel id="titulo-secao-mtrs" contagem={mtrs.isSuccess ? total : null}>
          MTRs
        </TituloDoPainel>
        <div
          role="group"
          aria-label="Filtros dos MTRs"
          className="flex flex-wrap items-end gap-(--e-3) border-b px-(--e-4) py-(--e-3)"
        >
          <label className="relative block w-full sm:w-[300px]">
            <span className="sr-only">Buscar</span>
            <Icone
              nome="search"
              className="pointer-events-none absolute top-1/2 left-(--e-3) -translate-y-1/2 text-(--tinta-3)"
            />
            <input
              type="search"
              value={filtros.busca}
              placeholder="Número, transportador ou destinador"
              onChange={(evento) => {
                setFiltros((f) => ({ ...f, busca: evento.target.value }))
              }}
              className={cn(classeCampo, 'pl-(--e-10)')}
            />
          </label>
          <CampoData
            rotulo="Emitido de"
            hoje={hoje}
            valor={filtros.de}
            maximo={filtros.ate ?? undefined}
            className="w-[calc(50%-var(--e-15))] sm:w-[160px]"
            aoMudar={(data) => {
              setFiltros((f) => ({ ...f, de: data }))
            }}
          />
          <CampoData
            rotulo="Emitido até"
            hoje={hoje}
            valor={filtros.ate}
            minimo={filtros.de ?? undefined}
            className="w-[calc(50%-var(--e-15))] sm:w-[160px]"
            aoMudar={(data) => {
              setFiltros((f) => ({ ...f, ate: data }))
            }}
          />
          <label className="flex flex-col gap-(--e-1)">
            <span className="rotulo">Situação</span>
            <select
              className={classeSelecao}
              value={filtros.situacao ?? ''}
              onChange={(evento) => {
                const valor = evento.target.value
                setFiltros((f) => ({ ...f, situacao: ehSituacaoMtr(valor) ? valor : null }))
              }}
            >
              <option value="">Todas</option>
              {SITUACOES_DO_MTR.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_DA_SITUACAO_DO_MTR[s]}
                </option>
              ))}
            </select>
          </label>
          <CaixaSelecao
            rotulo="Só sem CDF"
            className="h-(--controle) max-md:h-(--controle-toque)"
            checked={filtros.semCdf}
            onChange={(evento) => {
              setFiltros((f) => ({ ...f, semCdf: evento.target.checked }))
            }}
          />
          {filtrando ? (
            <Botao
              aparencia="sutil"
              onClick={() => {
                setFiltros(SEM_FILTROS)
              }}
            >
              Limpar filtros
            </Botao>
          ) : null}
        </div>
        {conteudo}
        {lista.length > 0 ? (
          <RodapeDoQuadro
            texto={`${String(lista.length)} de ${String(total)} ${total === 1 ? 'MTR' : 'MTRs'}`}
          >
            {mtrs.hasNextPage ? (
              <Botao
                tamanho="compacto"
                disabled={mtrs.isFetchingNextPage}
                onClick={() => void mtrs.fetchNextPage()}
              >
                Mostrar mais MTRs
              </Botao>
            ) : null}
          </RodapeDoQuadro>
        ) : null}
      </section>

      <SecaoCdfs
        empreendimentoId={id}
        consultoriaId={atual.consultoriaId}
        hoje={hoje}
        aoMudarDados={recarregar}
      />

      {aberto?.tipo === 'mtr' ? (
        <DialogoMtr
          aoMudar={(abrir) => {
            if (!abrir) fechar()
          }}
          empreendimentoId={id}
          consultoriaId={atual.consultoriaId}
          hoje={hoje}
          existente={aberto.existente}
          aoSalvar={recarregar}
        />
      ) : null}
      {aberto?.tipo === 'cdf' ? (
        <DialogoCdf
          aoMudar={(abrir) => {
            if (!abrir) fechar()
          }}
          empreendimentoId={id}
          consultoriaId={atual.consultoriaId}
          hoje={hoje}
          aoSalvar={recarregar}
        />
      ) : null}
      {aberto?.tipo === 'excluir' ? (
        <Dialogo
          aberto
          aoMudar={(abrir) => {
            if (!abrir) fechar()
          }}
          titulo={`Excluir MTR ${aberto.mtr.numero}?`}
          acoes={
            <>
              <Botao onClick={fechar}>Cancelar</Botao>
              <Botao
                aparencia="perigo"
                disabled={excluir.isPending}
                onClick={() => {
                  excluir.mutate(aberto.mtr)
                }}
              >
                {excluir.isPending ? 'Excluindo…' : 'Excluir MTR'}
              </Botao>
            </>
          }
        >
          {excluir.isError ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErro(excluir.error)}
            </MensagemSecao>
          ) : (
            <p className="numero">
              Emitido em {formatarDataCivil(aberto.mtr.emitidoEm)} para {aberto.mtr.destinadorNome}.
            </p>
          )}
        </Dialogo>
      ) : null}
    </Pagina>
  )
}
