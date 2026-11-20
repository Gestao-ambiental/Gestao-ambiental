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
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoData } from '@/components/ui/campo-data'
import { Dialogo } from '@/components/ui/dialogo'
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

import { SeloSituacaoMtr } from './campos'
import { classeControle, resumoDosItens } from './comum'
import { DialogoCdf } from './DialogoCdf'
import { DialogoMtr } from './DialogoMtr'
import { SecaoCdfs } from './SecaoCdfs'

const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo whitespace-nowrap first:pl-(--e-3)'
const classeCelula = 'h-10 border-b px-(--e-2) py-(--e-1) align-middle first:pl-(--e-3)'

function Migalhas({ empreendimentoId, nome }: { empreendimentoId: string; nome?: string }) {
  return (
    <nav aria-label="Caminho" className="flex flex-wrap items-center gap-(--e-1) corpo">
      <Link to="/empreendimentos">Empreendimentos</Link>
      <span className="text-(--tinta-2)" aria-hidden="true">
        /
      </span>
      <Link to={`/empreendimentos/${empreendimentoId}`}>{nome ?? 'Empreendimento'}</Link>
      <span className="text-(--tinta-2)" aria-hidden="true">
        /
      </span>
      <span className="text-(--tinta-2)" aria-current="page">
        Resíduos
      </span>
    </nav>
  )
}

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

/**
 * /empreendimentos/:id/residuos (rota sugerida; resíduos fase 1, sem integração com o IMA). MTRs
 * do empreendimento por período, situação e "sem CDF", com registro, edição, exclusão e PDF do MTR,
 * e o registro do CDF que cobre os MTRs.
 */
export function PaginaMtrs() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS)
  const busca = useDeferredValue(filtros.busca.trim())
  const [aberto, setAberto] = useState<Aberto>(null)
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
  useEffect(() => {
    document.title = `Resíduos · ${nome ?? 'Empreendimento'} · Grama`
  }, [nome])

  function recarregar() {
    void queryClient.invalidateQueries({ queryKey: ['mtrs', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['cdfs', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['conferencia-residuos', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['painel-residuos', atual.consultoriaId] })
  }

  if (empreendimento.isPending) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <Migalhas empreendimentoId={id} />
        <Carregando rotulo="Carregando o empreendimento" linhas={4} />
      </div>
    )
  }
  if (empreendimento.isError) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <Migalhas empreendimentoId={id} />
        {ehSemPermissao(empreendimento.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar o empreendimento."
            aoTentarDeNovo={() => void empreendimento.refetch()}
          />
        )}
      </div>
    )
  }
  if (!empreendimento.data) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <Migalhas empreendimentoId={id} />
        <h1 className="sr-only">Empreendimento não encontrado</h1>
        <EstadoVazio
          icone="briefcase"
          titulo="Empreendimento não encontrado"
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/empreendimentos">Voltar para Empreendimentos</Link>
            </Botao>
          }
        />
      </div>
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

  return (
    <div className="flex min-w-0 flex-col gap-(--e-4)">
      <Migalhas empreendimentoId={id} nome={empreendimento.data.nome} />
      <div className="flex flex-wrap items-start gap-(--e-3)">
        <h1 className="min-w-0 flex-1 titulo-tela text-(--tinta)">
          Resíduos · {empreendimento.data.nome}
        </h1>
        <div className="flex flex-wrap gap-(--e-2)">
          <Botao
            iconeAntes="file-check"
            onClick={() => {
              setAviso(null)
              setAberto({ tipo: 'cdf' })
            }}
          >
            Registrar CDF
          </Botao>
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              setAviso(null)
              setAberto({ tipo: 'mtr' })
            }}
          >
            Registrar MTR
          </Botao>
        </div>
      </div>

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

      <div
        role="group"
        aria-label="Filtros dos MTRs"
        className="flex flex-wrap items-end gap-(--e-3)"
      >
        <label className="flex w-full flex-col gap-(--e-1) sm:w-[240px]">
          <span className="rotulo">Buscar</span>
          <input
            type="search"
            value={filtros.busca}
            placeholder="Número, transportador ou destinador"
            onChange={(evento) => {
              setFiltros((f) => ({ ...f, busca: evento.target.value }))
            }}
            className={classeControle}
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
        <label className="flex w-full flex-col gap-(--e-1) sm:w-[220px]">
          <span className="rotulo">Situação</span>
          <select
            className={classeControle}
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
          className="h-(--controle)"
          checked={filtros.semCdf}
          onChange={(evento) => {
            setFiltros((f) => ({ ...f, semCdf: evento.target.checked }))
          }}
        />
      </div>

      <section
        aria-label="MTRs"
        className="flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha) shadow-cartao"
      >
        {mtrs.isPending ? (
          <Carregando rotulo="Carregando MTRs" linhas={3} className="border-0" />
        ) : mtrs.isError ? (
          ehSemPermissao(mtrs.error) ? (
            <SemPermissao />
          ) : (
            <EstadoErro
              titulo="Não foi possível carregar os MTRs."
              aoTentarDeNovo={() => void mtrs.refetch()}
              className="m-(--e-3)"
            />
          )
        ) : lista.length === 0 ? (
          filtrando ? (
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
                  aparencia="primario"
                  onClick={() => {
                    setAberto({ tipo: 'mtr' })
                  }}
                >
                  Registrar MTR
                </Botao>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse corpo">
              <thead>
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
                  <th scope="col" className={classeCabecalho}>
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
                  <tr key={mtr.id}>
                    <td className={`${classeCelula} whitespace-nowrap corpo-medio`}>
                      {mtr.numero}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      {formatarDataCivil(mtr.emitidoEm)}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <SeloSituacaoMtr situacao={mtr.situacao} />
                    </td>
                    <td className={classeCelula}>{mtr.transportadorNome}</td>
                    <td className={classeCelula}>{mtr.destinadorNome}</td>
                    <td className={`${classeCelula} min-w-[200px]`}>{resumoDosItens(mtr.itens)}</td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      {mtr.cdfs.length > 0 ? mtr.cdfs.map((c) => c.numero).join(', ') : 'Sem CDF'}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <span className="flex justify-end gap-(--e-05)">
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
                            setAviso(null)
                            setAberto({ tipo: 'mtr', existente: mtr })
                          }}
                        />
                        <BotaoIcone
                          icone="trash-2"
                          rotulo={`Excluir MTR ${mtr.numero}`}
                          onClick={() => {
                            setAviso(null)
                            excluir.reset()
                            setAberto({ tipo: 'excluir', mtr })
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-(--e-2) border-t px-(--e-3) py-(--e-2)">
          <p className="flex-1 text-xs">
            {lista.length === 0
              ? 'Nenhum MTR'
              : `${String(lista.length)} de ${String(total)} ${total === 1 ? 'MTR' : 'MTRs'}`}
          </p>
          {mtrs.hasNextPage ? (
            <Botao
              tamanho="compacto"
              disabled={mtrs.isFetchingNextPage}
              onClick={() => void mtrs.fetchNextPage()}
            >
              Mostrar mais MTRs
            </Botao>
          ) : null}
        </div>
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
            if (!abrir) setAberto(null)
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
            if (!abrir) setAberto(null)
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
            if (!abrir) setAberto(null)
          }}
          titulo={`Excluir MTR ${aberto.mtr.numero}?`}
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
            <p className="flex items-center gap-(--e-2)">
              <Icone nome="triangle-alert" className="shrink-0 text-(--icone)" />
              Emitido em {formatarDataCivil(aberto.mtr.emitidoEm)} para {aberto.mtr.destinadorNome}.
            </p>
          )}
        </Dialogo>
      ) : null}
    </div>
  )
}
