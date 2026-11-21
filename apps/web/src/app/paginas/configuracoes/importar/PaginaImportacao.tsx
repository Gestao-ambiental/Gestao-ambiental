// /configuracoes/importar/:id (ADR-0043): conferência em três abas (Prontas | Com aviso | Com
// erro), correção na linha, aviso do limite do plano e "Importar N linhas"; depois, o resultado com
// "Desfazer importação" por 24 h; desfeita, o que ficou e por quê. Só a Gestão.
import {
  formatarReais,
  hojeNoFuso,
  linhasComErroEmCsv,
  podeDesfazer,
  type EntidadeDaImportacao,
  type GrupoDaLinha,
} from '@gestao-ambiental/domain'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Abas, PainelDeAba } from '@/components/ui/abas'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ItemDoPlacar, Placar } from '@/components/ui/placar'
import {
  conferirImportacao,
  desfazerImportacao,
  efetivarImportacao,
  listarLinhasComErro,
  listarLinhasDaImportacao,
  listarLinhasPorResultado,
  obterImportacao,
  TAMANHO_PAGINA_LINHAS,
  type Importacao,
  type LinhaDaImportacao,
  type ResultadoDaLinha,
} from '@/lib/api/importacao'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'
import { codigoDoErro, ehSemPermissao, mensagemDoErroDaImportacao } from '@/lib/erros'

import { Paginacao, SeloDaImportacao } from './componentes'
import { DialogoCorrigirLinha } from './DialogoCorrigirLinha'
import { baixarArquivo, plural, renovarDepoisDeImportar, ROTULO_DA_ENTIDADE } from './pecas'
import { TabelaDeLinhas } from './TabelaDeLinhas'

export function PaginaImportacao() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao descricao="Só a gestão da consultoria importa planilhas." />
      </PaginaDeConfiguracoes>
    )
  }
  return <DetalheDaImportacao />
}

const chaveDaImportacao = (id: string) => ['importacao', id] as const

function DetalheDaImportacao() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: chaveDaImportacao(id), queryFn: () => obterImportacao(id) })

  if (consulta.isPending) {
    return (
      <PaginaDeConfiguracoes>
        <Carregando rotulo="Carregando a importação" />
      </PaginaDeConfiguracoes>
    )
  }
  if (consulta.isError) {
    return (
      <PaginaDeConfiguracoes>
        {ehSemPermissao(consulta.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />
        )}
      </PaginaDeConfiguracoes>
    )
  }
  if (!consulta.data) {
    return (
      <PaginaDeConfiguracoes>
        <EstadoVazio
          icone="file-text"
          titulo="Importação não encontrada"
          acaoPrincipal={
            <Botao asChild>
              <Link to="/configuracoes/importar">Ver importações</Link>
            </Botao>
          }
        />
      </PaginaDeConfiguracoes>
    )
  }
  const importacao = consulta.data
  if (importacao.situacao === 'em_conferencia') return <Conferencia importacao={importacao} />
  if (importacao.situacao === 'efetivada') return <Efetivada importacao={importacao} />
  return <Desfeita importacao={importacao} />
}

/** Nome do arquivo, tipo, linhas, situação e data. */
function Cabecalho({ importacao }: { importacao: Importacao }) {
  const { atual } = useConsultoria()
  return (
    <div className="flex flex-col gap-(--e-1)">
      <h2 className="truncate titulo-painel">{importacao.nomeArquivo}</h2>
      <p className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1) corpo text-(--tinta-2)">
        <span>{ROTULO_DA_ENTIDADE[importacao.entidade]}</span>
        <span className="numero">{plural(importacao.totalLinhas, 'linha', 'linhas')}</span>
        <span className="numero">{formatarInstanteComoData(importacao.criadoEm, atual.fuso)}</span>
        <SeloDaImportacao situacao={importacao.situacao} />
      </p>
    </div>
  )
}

function useBaixarErros(importacao: Importacao) {
  return useMutation({
    mutationFn: async () => {
      const linhas = await listarLinhasComErro(importacao.id)
      const csv = linhasComErroEmCsv(importacao.entidade, linhas)
      const nome = importacao.nomeArquivo.replace(/\.(xlsx|csv)$/i, '')
      baixarArquivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `erros-${nome}.csv`)
    },
  })
}

function MensagemDeErro({ erro }: { erro: unknown }) {
  return <MensagemSecao role="alert" tom="perigo" titulo={mensagemDoErroDaImportacao(erro)} />
}

// ---------------------------------------------------------------------------
// Em conferência
// ---------------------------------------------------------------------------

const ABAS_DA_CONFERENCIA: readonly { valor: GrupoDaLinha; rotulo: string }[] = [
  { valor: 'pronta', rotulo: 'Prontas' },
  { valor: 'aviso', rotulo: 'Com aviso' },
  { valor: 'erro', rotulo: 'Com erro' },
]

function Conferencia({ importacao }: { importacao: Importacao }) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const resumo = importacao.resumo
  const [escolhida, setEscolhida] = useState<GrupoDaLinha | null>(null)
  const [pagina, setPagina] = useState(0)
  const [confirmado, setConfirmado] = useState(false)
  const [corrigindo, setCorrigindo] = useState<LinhaDaImportacao | null>(null)

  // Sem escolha, abre a primeira aba com linhas.
  const contagens: Record<GrupoDaLinha, number> = {
    pronta: resumo?.prontas ?? 0,
    aviso: resumo?.comAviso ?? 0,
    erro: resumo?.comErro ?? 0,
  }
  const grupo: GrupoDaLinha =
    escolhida ?? ABAS_DA_CONFERENCIA.find((a) => contagens[a.valor] > 0)?.valor ?? 'pronta'

  const linhas = useQuery({
    queryKey: ['importacao-linhas', importacao.id, 'grupo', grupo, pagina],
    queryFn: () => listarLinhasDaImportacao(importacao.id, grupo, pagina),
    enabled: resumo !== null,
    placeholderData: keepPreviousData,
  })

  const renovarImportacao = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: chaveDaImportacao(importacao.id) }),
      queryClient.invalidateQueries({ queryKey: ['importacao-linhas', importacao.id] }),
    ])

  const conferir = useMutation({
    mutationFn: () => conferirImportacao(importacao.id),
    onSuccess: renovarImportacao,
  })
  const importar = useMutation({
    mutationFn: () => efetivarImportacao(importacao.id, importacao.rowVersion, confirmado),
    onSuccess: async () => {
      await renovarDepoisDeImportar(queryClient)
      await renovarImportacao()
    },
    onError: async (erro) => {
      const codigo = codigoDoErro(erro)
      // Outra aba mudou a importação: a tela lê a versão atual.
      if (codigo === 'conflito_de_versao') await renovarImportacao()
      // O banco conferiu de novo e o resumo da tela ficou velho (limite do plano ou linhas novas):
      // confere de novo para a faixa do limite e a contagem aparecerem como o banco vê.
      if (
        codigo === 'adicional_nao_confirmado' ||
        codigo === 'importacao_nao_conferida' ||
        codigo === 'conferencia_divergente'
      ) {
        conferir.mutate()
      }
    },
  })
  const baixarErros = useBaixarErros(importacao)

  const aCriar =
    importacao.entidade === 'licenca'
      ? (resumo?.aCriar.licencas ?? 0)
      : (resumo?.aCriar.empreendimentos ?? 0)
  const precisaConfirmar = resumo?.limite.precisaConfirmar ?? false
  const ocupado = importar.isPending || conferir.isPending

  const acao = resumo ? (
    <>
      <BotaoMais
        itens={[
          {
            rotulo: 'Baixar erros (.csv)',
            icone: 'download',
            oculto: resumo.comErro === 0,
            aoEscolher: () => {
              baixarErros.mutate()
            },
          },
          {
            rotulo: 'Conferir de novo',
            icone: 'refresh-cw',
            desabilitado: ocupado,
            aoEscolher: () => {
              conferir.mutate()
            },
          },
        ]}
      />
      <Botao
        aparencia="primario"
        disabled={ocupado || aCriar === 0 || (precisaConfirmar && !confirmado)}
        onClick={() => {
          importar.mutate()
        }}
      >
        {`Importar ${plural(aCriar, 'linha', 'linhas')}`}
      </Botao>
    </>
  ) : (
    <Botao
      aparencia="primario"
      disabled={conferir.isPending}
      onClick={() => {
        conferir.mutate()
      }}
    >
      Conferir linhas
    </Botao>
  )

  return (
    <PaginaDeConfiguracoes acao={acao}>
      <div className="flex flex-col gap-(--e-5)">
        <Cabecalho importacao={importacao} />

        {resumo && precisaConfirmar ? (
          <MensagemSecao tom="atencao" titulo="Passa do limite do plano">
            <dl className="grid max-w-[420px] grid-cols-[1fr_auto] gap-x-(--e-4) gap-y-(--e-1)">
              <dt>Empreendimentos ativos</dt>
              <dd className="text-right numero">
                {resumo.limite.limite === null
                  ? resumo.limite.quantidade
                  : `${String(resumo.limite.quantidade)} de ${String(resumo.limite.limite)}`}
              </dd>
              <dt>Adicionais por mês</dt>
              <dd className="text-right numero">
                {formatarReais(resumo.limite.adicionaisCentavos)}
              </dd>
            </dl>
            <CaixaSelecao
              className="mt-(--e-2)"
              rotulo={`Confirmo os adicionais de ${formatarReais(resumo.limite.adicionaisCentavos)} por mês`}
              checked={confirmado}
              onChange={(evento) => {
                setConfirmado(evento.target.checked)
              }}
            />
          </MensagemSecao>
        ) : null}

        {conferir.isError ? <MensagemDeErro erro={conferir.error} /> : null}
        {importar.isError ? <MensagemDeErro erro={importar.error} /> : null}
        {baixarErros.isError ? <MensagemDeErro erro={baixarErros.error} /> : null}
        {importar.isPending ? (
          <p role="status" className="corpo text-(--tinta-2)">
            Importando
          </p>
        ) : null}

        {!resumo ? (
          <MensagemSecao tom="atencao" titulo="Linhas ainda não conferidas" />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
            <div className="px-(--e-4) pt-(--e-2)">
              <Abas
                rotulo="Linhas da planilha"
                idBase="linhas-da-importacao"
                abas={ABAS_DA_CONFERENCIA.map((a) => ({ ...a, contagem: contagens[a.valor] }))}
                valor={grupo}
                aoMudar={(valor) => {
                  setEscolhida(valor)
                  setPagina(0)
                }}
              />
            </div>
            <PainelDeAba idBase="linhas-da-importacao" valor={grupo}>
              <ListaDeLinhas
                consulta={linhas}
                entidade={importacao.entidade}
                pagina={pagina}
                aoMudarPagina={setPagina}
                vazio={`Nenhuma linha ${ABAS_DA_CONFERENCIA.find((a) => a.valor === grupo)?.rotulo.toLowerCase() ?? ''}`}
                aoCorrigir={setCorrigindo}
              />
            </PainelDeAba>
          </div>
        )}
      </div>
      {corrigindo ? (
        <DialogoCorrigirLinha
          importacaoId={importacao.id}
          entidade={importacao.entidade}
          linha={corrigindo}
          hoje={hojeNoFuso(new Date(), atual.fuso)}
          aoFechar={() => {
            setCorrigindo(null)
          }}
          aoSalvar={renovarImportacao}
        />
      ) : null}
    </PaginaDeConfiguracoes>
  )
}

function ListaDeLinhas({
  consulta,
  entidade,
  pagina,
  aoMudarPagina,
  vazio,
  mostrar = 'problemas',
  aoCorrigir,
}: {
  consulta: {
    isPending: boolean
    isError: boolean
    data?: { itens: LinhaDaImportacao[]; total: number }
    refetch: () => Promise<unknown>
  }
  entidade: EntidadeDaImportacao
  pagina: number
  aoMudarPagina: (pagina: number) => void
  vazio: string
  mostrar?: 'problemas' | 'motivo'
  aoCorrigir?: (linha: LinhaDaImportacao) => void
}) {
  if (consulta.isPending) return <Carregando rotulo="Carregando linhas" className="border-0" />
  if (consulta.isError || !consulta.data) {
    return (
      <EstadoErro
        className="m-(--e-4)"
        aoTentarDeNovo={() => {
          void consulta.refetch()
        }}
      />
    )
  }
  if (consulta.data.itens.length === 0) {
    return <EstadoVazio icone="list" titulo={vazio} />
  }
  return (
    <>
      <TabelaDeLinhas
        entidade={entidade}
        linhas={consulta.data.itens}
        mostrar={mostrar}
        aoCorrigir={aoCorrigir}
      />
      <Paginacao
        pagina={pagina}
        tamanho={TAMANHO_PAGINA_LINHAS}
        total={consulta.data.total}
        aoMudar={aoMudarPagina}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Efetivada
// ---------------------------------------------------------------------------

const ABAS_DO_RESULTADO: readonly { valor: ResultadoDaLinha; rotulo: string }[] = [
  { valor: 'criada', rotulo: 'Importadas' },
  { valor: 'pulada', rotulo: 'Já existiam' },
  { valor: 'com_erro', rotulo: 'Com erro' },
]

function Efetivada({ importacao }: { importacao: Importacao }) {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const resultado = importacao.resultado
  const [escolhida, setEscolhida] = useState<ResultadoDaLinha>('criada')
  const [pagina, setPagina] = useState(0)
  const [desfazendo, setDesfazendo] = useState(false)

  const linhas = useQuery({
    queryKey: ['importacao-linhas', importacao.id, 'resultado', escolhida, pagina],
    queryFn: () => listarLinhasPorResultado(importacao.id, escolhida, pagina),
    placeholderData: keepPreviousData,
  })
  const desfazer = useMutation({
    mutationFn: () => desfazerImportacao(importacao.id, importacao.rowVersion),
    onSuccess: async () => {
      setDesfazendo(false)
      await renovarDepoisDeImportar(queryClient)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chaveDaImportacao(importacao.id) }),
        queryClient.invalidateQueries({ queryKey: ['importacao-linhas', importacao.id] }),
      ])
    },
    onError: async (erro) => {
      if (codigoDoErro(erro) === 'conflito_de_versao') {
        await queryClient.invalidateQueries({ queryKey: chaveDaImportacao(importacao.id) })
      }
    },
  })
  const baixarErros = useBaixarErros(importacao)
  const desfazivel = importacao.efetivadaEm
    ? podeDesfazer(importacao.efetivadaEm, new Date())
    : false
  const contagens: Record<ResultadoDaLinha, number> = {
    criada: resultado?.linhasCriadas ?? 0,
    pulada: resultado?.linhasPuladas ?? 0,
    com_erro: resultado?.linhasComErro ?? 0,
    desfeita: 0,
  }

  return (
    <PaginaDeConfiguracoes
      acao={
        <>
          <BotaoMais
            itens={[
              {
                rotulo: 'Baixar erros (.csv)',
                icone: 'download',
                oculto: contagens.com_erro === 0,
                aoEscolher: () => {
                  baixarErros.mutate()
                },
              },
              {
                rotulo: 'Desfazer importação',
                icone: 'x',
                perigo: true,
                oculto: !desfazivel,
                separadoAntes: true,
                aoEscolher: () => {
                  desfazer.reset()
                  setDesfazendo(true)
                },
              },
            ]}
          />
          <Botao
            aparencia="primario"
            onClick={() => {
              void navegar('/empreendimentos')
            }}
          >
            Ver empreendimentos
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-5)">
        <Cabecalho importacao={importacao} />
        {resultado ? (
          <Placar rotulo="Resultado da importação" tamanho="compacto">
            <ItemDoPlacar
              rotulo="Empreendimentos criados"
              valor={resultado.empreendimentosCriados}
            />
            <ItemDoPlacar rotulo="Unidades criadas" valor={resultado.unidadesCriadas} />
            <ItemDoPlacar rotulo="Licenças criadas" valor={resultado.licencasCriadas} />
          </Placar>
        ) : null}
        {desfazivel && resultado?.desfazerAte ? (
          <p className="corpo text-(--tinta-2)">
            Desfazer até{' '}
            <span className="numero">
              {formatarInstanteComHora(resultado.desfazerAte, atual.fuso)}
            </span>
          </p>
        ) : null}
        {baixarErros.isError ? <MensagemDeErro erro={baixarErros.error} /> : null}
        <div className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
          <div className="px-(--e-4) pt-(--e-2)">
            <Abas
              rotulo="Linhas da planilha"
              idBase="resultado-da-importacao"
              abas={ABAS_DO_RESULTADO.map((a) => ({ ...a, contagem: contagens[a.valor] }))}
              valor={escolhida}
              aoMudar={(valor) => {
                setEscolhida(valor)
                setPagina(0)
              }}
            />
          </div>
          <PainelDeAba idBase="resultado-da-importacao" valor={escolhida}>
            <ListaDeLinhas
              consulta={linhas}
              entidade={importacao.entidade}
              pagina={pagina}
              aoMudarPagina={setPagina}
              vazio="Nenhuma linha"
            />
          </PainelDeAba>
        </div>
      </div>
      <Dialogo
        aberto={desfazendo}
        aoMudar={(aberto) => {
          if (!desfazer.isPending) setDesfazendo(aberto)
        }}
        titulo="Desfazer importação?"
        descricao="O que esta importação criou sai das listas. Fica o que foi alterado depois ou tem outros dados ligados."
        acoes={
          <>
            <Botao
              disabled={desfazer.isPending}
              onClick={() => {
                setDesfazendo(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={desfazer.isPending}
              onClick={() => {
                desfazer.mutate()
              }}
            >
              Desfazer
            </Botao>
          </>
        }
      >
        {desfazer.isError ? (
          <p role="alert" className="text-(--atraso-texto)">
            {mensagemDoErroDaImportacao(desfazer.error)}
          </p>
        ) : null}
      </Dialogo>
    </PaginaDeConfiguracoes>
  )
}

// ---------------------------------------------------------------------------
// Desfeita
// ---------------------------------------------------------------------------

function Desfeita({ importacao }: { importacao: Importacao }) {
  const navegar = useNavigate()
  const resultado = importacao.resultadoDesfazer
  const [pagina, setPagina] = useState(0)
  const mantidas = resultado?.linhasMantidas ?? 0
  // As linhas que ficaram continuam "criada", com o motivo.
  const linhas = useQuery({
    queryKey: ['importacao-linhas', importacao.id, 'resultado', 'criada', pagina],
    queryFn: () => listarLinhasPorResultado(importacao.id, 'criada', pagina),
    enabled: mantidas > 0,
    placeholderData: keepPreviousData,
  })

  return (
    <PaginaDeConfiguracoes
      acao={
        <Botao
          aparencia="primario"
          iconeAntes="upload"
          onClick={() => {
            void navegar('/configuracoes/importar/nova')
          }}
        >
          Importar planilha
        </Botao>
      }
    >
      <div className="flex flex-col gap-(--e-5)">
        <Cabecalho importacao={importacao} />
        {resultado ? (
          <Placar rotulo="Resultado do desfazer" tamanho="compacto">
            <ItemDoPlacar rotulo="Linhas desfeitas" valor={resultado.linhasDesfeitas} />
            <ItemDoPlacar rotulo="Linhas que ficaram" valor={resultado.linhasMantidas} />
            <ItemDoPlacar rotulo="Licenças desfeitas" valor={resultado.licencasDesfeitas} />
            <ItemDoPlacar
              rotulo="Empreendimentos desfeitos"
              valor={resultado.empreendimentosDesfeitos}
            />
          </Placar>
        ) : null}
        {mantidas > 0 ? (
          <section
            aria-labelledby="linhas-que-ficaram"
            className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)"
          >
            <h2 id="linhas-que-ficaram" className="px-(--e-4) pt-(--e-3) pb-(--e-2) titulo-secao">
              Ficaram
            </h2>
            <ListaDeLinhas
              consulta={linhas}
              entidade={importacao.entidade}
              pagina={pagina}
              aoMudarPagina={setPagina}
              vazio="Nenhuma linha"
              mostrar="motivo"
            />
          </section>
        ) : null}
      </div>
    </PaginaDeConfiguracoes>
  )
}
