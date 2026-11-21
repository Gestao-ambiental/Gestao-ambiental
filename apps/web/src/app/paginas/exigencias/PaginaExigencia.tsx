import { formatarDataCivil, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { SeletorPessoa } from '@/components/ui/seletor-pessoa'
import {
  atribuirExigencia,
  definirProcessoDaLicenca,
  excluirExigencia,
  listarRespostasDaExigencia,
  obterExigencia,
  type Exigencia,
  type RespostaDaExigencia,
} from '@/lib/api/exigencias'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import { urlDoArquivo } from '@/lib/api/ocorrencias'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { tituloDaExigencia } from './apresentacao'
import { atualizarDepoisDeMudarExigencia } from './cache'
import { DialogoExigencia } from './DialogoExigencia'
import { DialogoProrrogacao } from './DialogoProrrogacao'
import { DialogoRespostaExigencia } from './DialogoRespostaExigencia'
import { SeloDaExigencia } from './pecas'

const VOLTAR = { para: '/acompanhamentos?aba=exigencias', rotulo: 'Exigências do órgão' }

type DialogoAberto = 'resposta' | 'anexo' | 'prorrogar' | 'atribuir' | 'editar' | 'excluir' | null

const ROTULO_DO_TIPO: Record<RespostaDaExigencia['tipo'], string> = {
  resposta: 'Resposta',
  anexo: 'Anexo',
  prorrogacao: 'Prorrogação',
}

const CONTAGEM = {
  corridos: ['dia corrido', 'dias corridos'],
  uteis: ['dia útil', 'dias úteis'],
} as const

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--e-05)">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

function Vazio() {
  return <span className="corpo text-(--tinta-3)">—</span>
}

function Data({ data }: { data: DataCivil }) {
  return <span className="numero">{formatarDataCivil(data)}</span>
}

function Dados({ exigencia }: { exigencia: Exigencia }) {
  const prorrogada = exigencia.prazoOficial !== exigencia.prazoOficialOriginal
  return (
    <dl className="flex flex-col gap-(--e-3)">
      <Linha rotulo="Empreendimento">
        <Link to={`/empreendimentos/${exigencia.empreendimentoId}`}>
          {exigencia.empreendimentoNome}
        </Link>
      </Linha>
      <Linha rotulo="Unidade">{exigencia.unidadeNome}</Linha>
      <Linha rotulo="Licença">
        {exigencia.licenca ? <span className="numero">{exigencia.licenca}</span> : <Vazio />}
      </Linha>
      <Linha rotulo="Processo">
        {exigencia.numeroProcesso ? (
          <span className="numero">{exigencia.numeroProcesso}</span>
        ) : (
          <Vazio />
        )}
      </Linha>
      <Linha rotulo="Órgão">{exigencia.orgao ?? <Vazio />}</Linha>
      <Linha rotulo="Recebido em">
        <Data data={exigencia.recebidoEm} />
      </Linha>
      <Linha rotulo="Contagem">
        {exigencia.prazoDias !== null && exigencia.prazoContagem ? (
          <span className="numero">
            {exigencia.prazoDias}{' '}
            {CONTAGEM[exigencia.prazoContagem][exigencia.prazoDias === 1 ? 0 : 1]}
          </span>
        ) : (
          'Data informada'
        )}
      </Linha>
      <Linha rotulo={prorrogada ? 'Prazo original' : 'Prazo'}>
        <Data data={exigencia.prazoOficialOriginal} />
      </Linha>
      {prorrogada ? (
        <Linha rotulo="Prazo atual">
          <Data data={exigencia.prazoOficial} />
        </Linha>
      ) : null}
      <Linha rotulo="Meta interna">
        <Data data={exigencia.metaInterna} />
      </Linha>
      <Linha rotulo="Responsável">
        {exigencia.responsavelNome ? (
          <span className="flex items-center gap-(--e-2)">
            <Avatar nome={exigencia.responsavelNome} />
            {exigencia.responsavelNome}
          </span>
        ) : (
          <span className="corpo text-(--tinta-3)">Sem responsável</span>
        )}
      </Linha>
    </dl>
  )
}

function ItemDoHistorico({
  item,
  fuso,
  aoAbrirPdf,
}: {
  item: RespostaDaExigencia
  fuso: string
  aoAbrirPdf: (caminho: string) => void
}) {
  const quando = item.protocoladoEm
    ? formatarDataCivil(item.protocoladoEm)
    : formatarInstanteComoData(item.registradoEm, fuso)
  return (
    <li className="flex flex-col gap-(--e-1) border-b border-(--regra-leve) py-(--e-3) last:border-b-0">
      <span className="flex flex-wrap items-center gap-x-(--e-2)">
        <span className="corpo-medio text-(--tinta)">{ROTULO_DO_TIPO[item.tipo]}</span>
        <span className="corpo text-(--tinta-2) numero">{quando}</span>
        {item.registradoPorNome ? (
          <span className="corpo text-(--tinta-2)">· {item.registradoPorNome}</span>
        ) : null}
      </span>
      {item.tipo === 'resposta' && item.protocoloNumero ? (
        <span className="corpo numero">Protocolo {item.protocoloNumero}</span>
      ) : null}
      {item.tipo === 'prorrogacao' && item.prazoAnterior && item.prazoNovo ? (
        <span className="corpo numero">
          Prazo {formatarDataCivil(item.prazoAnterior)} → {formatarDataCivil(item.prazoNovo)}
        </span>
      ) : null}
      {item.motivo ? <span className="corpo whitespace-pre-line">{item.motivo}</span> : null}
      {item.descricao ? <span className="corpo">{item.descricao}</span> : null}
      {item.documento ? (
        <Botao
          tamanho="compacto"
          aparencia="sutil"
          iconeAntes="file-text"
          className="w-fit"
          aria-label={`Abrir PDF ${item.documento.nome}`}
          onClick={() => {
            if (item.documento) aoAbrirPdf(item.documento.caminho)
          }}
        >
          {item.documento.nome || 'PDF'}
        </Botao>
      ) : null}
    </li>
  )
}

function DialogoAtribuir({
  exigencia,
  aoFechar,
  aoSalvar,
}: {
  exigencia: Exigencia
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const { atual } = useConsultoria()
  const [membroId, setMembroId] = useState<string | null>(exigencia.responsavelId)
  const membros = useQuery({
    queryKey: ['membros-ativos', atual.consultoriaId],
    queryFn: () => listarMembrosAtivos(atual.consultoriaId),
  })
  const atribuir = useMutation({
    mutationFn: (id: string) => atribuirExigencia(exigencia.id, id, exigencia.rowVersion),
    onSuccess: aoSalvar,
  })
  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Atribuir responsável"
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            aparencia="primario"
            disabled={!membroId || atribuir.isPending}
            onClick={() => {
              if (membroId) atribuir.mutate(membroId)
            }}
          >
            {atribuir.isPending ? 'Salvando…' : 'Atribuir'}
          </Botao>
        </>
      }
    >
      {atribuir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(atribuir.error)}
        </MensagemSecao>
      ) : null}
      <SeletorPessoa
        rotulo="Responsável pela exigência"
        vazio="Escolha a pessoa"
        rotuloSemPessoa={null}
        pessoas={(membros.data ?? []).map((m) => ({
          id: m.id,
          nome: m.nome,
          detalhe: m.cargo,
          fotoUrl: m.fotoUrl,
        }))}
        valor={membroId}
        aoMudar={setMembroId}
      />
    </Dialogo>
  )
}

function DialogoExcluir({
  exigencia,
  aoFechar,
  aoExcluir,
}: {
  exigencia: Exigencia
  aoFechar: () => void
  aoExcluir: () => Promise<void>
}) {
  const excluir = useMutation({
    mutationFn: () => excluirExigencia(exigencia),
    onSuccess: aoExcluir,
  })
  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Excluir exigência"
      descricao={`${tituloDaExigencia(exigencia)} sai das listas, da Visão e do Calendário.`}
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            aparencia="perigo"
            disabled={excluir.isPending}
            onClick={() => {
              excluir.mutate()
            }}
          >
            {excluir.isPending ? 'Excluindo…' : 'Excluir'}
          </Botao>
        </>
      }
    >
      {excluir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(excluir.error)}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}

/**
 * /exigencias/:id (ADR-0045). Dados do ofício, prazo original e atual, meta e responsável ao lado;
 * no centro, o histórico só de acréscimo. "Registrar resposta" é da Gestão e do responsável; o
 * resto do "…" é da Gestão. Quem pode o quê é decidido no banco.
 */
export function PaginaExigencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ehGestao = atual.papel === 'gestao'
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [dialogo, setDialogo] = useState<DialogoAberto>(null)

  const exigencia = useQuery({
    queryKey: ['exigencia', id],
    queryFn: () => obterExigencia(cid, id),
  })
  const existe = Boolean(exigencia.data)
  const respostas = useQuery({
    queryKey: ['exigencia', id, 'respostas'],
    queryFn: () => listarRespostasDaExigencia(id),
    enabled: existe,
  })

  useEffect(() => {
    if (!existe) document.title = 'Exigência · Grama'
  }, [existe])

  async function recarregar() {
    setDialogo(null)
    await atualizarDepoisDeMudarExigencia(queryClient, id)
  }

  const abrirPdf = useMutation({
    mutationFn: urlDoArquivo,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const gravarProcesso = useMutation({
    mutationFn: (e: Exigencia) =>
      definirProcessoDaLicenca(
        e.instrumentoId ?? '',
        e.licencaRowVersion ?? 0,
        e.numeroProcesso ?? '',
      ),
    onSuccess: recarregar,
  })

  if (exigencia.isPending) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <Carregando rotulo="Carregando a exigência" linhas={5} />
      </div>
    )
  }
  if (exigencia.isError) {
    return ehSemPermissao(exigencia.error) ? (
      <SemPermissao />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar a exigência."
        aoTentarDeNovo={() => void exigencia.refetch()}
      />
    )
  }
  if (!exigencia.data) {
    // Inexistente, excluída ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <div className="flex flex-col gap-(--e-4)">
        <h1 className="sr-only">Exigência não encontrada</h1>
        <EstadoVazio
          icone="flag"
          titulo="Exigência não encontrada"
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to={VOLTAR.para}>Ver exigências</Link>
            </Botao>
          }
        />
      </div>
    )
  }

  const dados = exigencia.data
  const aberta = dados.situacao === 'aberta'
  const ehResponsavel = dados.responsavelId !== null && dados.responsavelId === atual.membroId
  const podeResponder = ehGestao || ehResponsavel
  const podeGravarProcesso =
    ehGestao &&
    dados.instrumentoId !== null &&
    dados.licencaRowVersion !== null &&
    !dados.licencaNumeroProcesso &&
    Boolean(dados.numeroProcesso)
  const erro = abrirPdf.error ?? gravarProcesso.error

  return (
    <Pagina
      titulo={tituloDaExigencia(dados)}
      voltar={VOLTAR}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-2)">
          <span>{dados.orgao ?? dados.empreendimentoNome}</span>
          <span aria-hidden="true">·</span>
          <SeloDaExigencia exigencia={dados} />
        </span>
      }
      acao={
        <>
          {podeResponder ? (
            <Botao
              aparencia="primario"
              onClick={() => {
                setDialogo('resposta')
              }}
            >
              Registrar resposta
            </Botao>
          ) : null}
          <BotaoMais
            itens={[
              {
                rotulo: 'Anexar documento',
                icone: 'paperclip',
                oculto: !podeResponder,
                aoEscolher: () => {
                  setDialogo('anexo')
                },
              },
              {
                rotulo: 'Prorrogar prazo',
                icone: 'calendar',
                oculto: !ehGestao || !aberta,
                aoEscolher: () => {
                  setDialogo('prorrogar')
                },
              },
              {
                rotulo: 'Atribuir responsável',
                icone: 'user',
                oculto: !ehGestao || !aberta,
                aoEscolher: () => {
                  setDialogo('atribuir')
                },
              },
              {
                rotulo: 'Editar',
                icone: 'pencil',
                oculto: !ehGestao,
                aoEscolher: () => {
                  setDialogo('editar')
                },
              },
              {
                rotulo: 'Gravar processo na licença',
                icone: 'folder',
                oculto: !podeGravarProcesso,
                desabilitado: gravarProcesso.isPending,
                aoEscolher: () => {
                  gravarProcesso.mutate(dados)
                },
              },
              {
                rotulo: 'Excluir',
                icone: 'x',
                perigo: true,
                separadoAntes: true,
                oculto: !ehGestao || dados.respostas > 0,
                aoEscolher: () => {
                  setDialogo('excluir')
                },
              },
            ]}
          />
        </>
      }
    >
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}

      <div className="grid gap-(--e-8) lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-(--e-6)">
          <section aria-labelledby="titulo-assunto" className="flex flex-col gap-(--e-2)">
            <h2 id="titulo-assunto" className="titulo-secao text-(--tinta)">
              Assunto
            </h2>
            <p className="max-w-[72ch] corpo text-pretty text-(--tinta)">{dados.assunto}</p>
            {dados.notas ? (
              <p className="max-w-[72ch] corpo text-pretty whitespace-pre-line text-(--tinta-2)">
                {dados.notas}
              </p>
            ) : null}
            {dados.oficio ? (
              <Botao
                tamanho="compacto"
                iconeAntes="file-text"
                className="w-fit"
                disabled={abrirPdf.isPending}
                onClick={() => {
                  if (dados.oficio) abrirPdf.mutate(dados.oficio.caminho)
                }}
              >
                PDF do ofício
              </Botao>
            ) : null}
          </section>

          <section aria-labelledby="titulo-historico" className="flex flex-col gap-(--e-2)">
            <h2 id="titulo-historico" className="titulo-secao text-(--tinta)">
              Histórico
            </h2>
            {respostas.isPending ? (
              <Carregando rotulo="Carregando o histórico" linhas={2} />
            ) : respostas.isError ? (
              <EstadoErro
                titulo="Não foi possível carregar o histórico."
                aoTentarDeNovo={() => void respostas.refetch()}
              />
            ) : respostas.data.length === 0 ? (
              <p className="corpo text-(--tinta-2)">Nenhuma resposta registrada.</p>
            ) : (
              <ol aria-label="Histórico da exigência" className="flex flex-col">
                {respostas.data.map((item) => (
                  <ItemDoHistorico
                    key={item.id}
                    item={item}
                    fuso={atual.fuso}
                    aoAbrirPdf={(caminho) => {
                      abrirPdf.mutate(caminho)
                    }}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside
          className="flex flex-col gap-(--e-6) max-lg:border-t max-lg:pt-(--e-6) lg:border-l lg:pl-(--e-6)"
          aria-label="Dados da exigência"
        >
          <Dados exigencia={dados} />
        </aside>
      </div>

      {dialogo === 'resposta' || dialogo === 'anexo' ? (
        <DialogoRespostaExigencia
          tipo={dialogo}
          exigencia={dados}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={recarregar}
        />
      ) : null}
      {dialogo === 'prorrogar' ? (
        <DialogoProrrogacao
          exigencia={dados}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={recarregar}
        />
      ) : null}
      {dialogo === 'atribuir' ? (
        <DialogoAtribuir
          exigencia={dados}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={recarregar}
        />
      ) : null}
      {dialogo === 'editar' ? (
        <DialogoExigencia
          modo={{ tipo: 'editar', exigencia: dados }}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={recarregar}
        />
      ) : null}
      {dialogo === 'excluir' ? (
        <DialogoExcluir
          exigencia={dados}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoExcluir={async () => {
            setDialogo(null)
            await atualizarDepoisDeMudarExigencia(queryClient)
            queryClient.removeQueries({ queryKey: ['exigencia', id] })
            void navegar(VOLTAR.para)
          }}
        />
      ) : null}
    </Pagina>
  )
}
