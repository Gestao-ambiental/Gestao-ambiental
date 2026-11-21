import {
  diferencaEmDias,
  formatarDataCivil,
  situacaoExibida,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import {
  designarConferente,
  listarEtapas,
  listarEvidencias,
  listarHistorico,
  obterOcorrencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import { atribuirOcorrencia } from '@/lib/api/prazos'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { PainelAgora } from './PainelAgora'
import { SecaoEtapas } from './SecaoEtapas'
import { SecaoEvidencia } from './SecaoEvidencia'
import { SecaoHistorico } from './SecaoHistorico'
import { SecaoVistorias } from './SecaoVistorias'
import { BaseLegal } from './BaseLegal'
import { VoltarParaVisao } from './pecas'

function emDias(data: DataCivil, hoje: DataCivil): string {
  const dias = diferencaEmDias(data, hoje)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias > 1) return `em ${String(dias)} dias`
  return dias === -1 ? 'há 1 dia' : `há ${String(-dias)} dias`
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--e-05)">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

function Pessoa({ nome }: { nome: string }) {
  return (
    <span className="flex items-center gap-(--e-2)">
      <Avatar nome={nome} />
      {nome}
    </span>
  )
}

function Datas({ ocorrencia }: { ocorrencia: Ocorrencia }) {
  const mudou = ocorrencia.prazoAtual !== ocorrencia.prazoOriginal
  return (
    <section aria-labelledby="titulo-datas" className="flex flex-col gap-(--e-3)">
      <h2 id="titulo-datas" className="titulo-secao text-(--tinta)">
        Datas
      </h2>
      <dl className="flex flex-col gap-(--e-3)">
        <Linha rotulo="Prazo oficial">
          <span className="numero">{formatarDataCivil(ocorrencia.prazoOriginal)}</span>
          {mudou ? null : (
            <span className="corpo text-(--tinta-2)">
              {' '}
              · {emDias(ocorrencia.prazoOriginal, ocorrencia.hoje)}
            </span>
          )}
        </Linha>
        {mudou ? (
          <Linha rotulo="Prazo atual">
            <span className="numero">{formatarDataCivil(ocorrencia.prazoAtual)}</span>
            <span className="corpo text-(--tinta-2)">
              {' '}
              · {emDias(ocorrencia.prazoAtual, ocorrencia.hoje)}
            </span>
          </Linha>
        ) : null}
        <Linha rotulo="Meta interna">
          {ocorrencia.metaInterna ? (
            <span className="numero">{formatarDataCivil(ocorrencia.metaInterna)}</span>
          ) : (
            <span className="corpo text-(--tinta-3)">Sem meta</span>
          )}
        </Linha>
      </dl>
    </section>
  )
}

function Pessoas({
  ocorrencia,
  ehGestao,
  membros,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  ehGestao: boolean
  membros: readonly { id: string; nome: string }[]
  aoMudar: () => Promise<void>
}) {
  const designar = useMutation({
    mutationFn: (membroId: string | null) => designarConferente(ocorrencia.id, membroId),
    onSuccess: aoMudar,
  })
  // "Sem responsável" é uma ação para a Gestão (EQ-03), como na Visão da equipe.
  const atribuir = useMutation({
    mutationFn: (membroId: string) =>
      atribuirOcorrencia(ocorrencia.id, membroId, ocorrencia.rowVersion),
    onSuccess: aoMudar,
  })
  const podeDesignar = ehGestao && ocorrencia.situacao !== 'concluida'

  return (
    <section aria-labelledby="titulo-pessoas" className="flex flex-col gap-(--e-3)">
      <h2 id="titulo-pessoas" className="titulo-secao text-(--tinta)">
        Pessoas
      </h2>
      {designar.isError || atribuir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(designar.error ?? atribuir.error)}
        </MensagemSecao>
      ) : null}
      <dl className="flex flex-col gap-(--e-3)">
        <Linha rotulo="Responsável">
          {ocorrencia.responsavelNome ? (
            <Pessoa nome={ocorrencia.responsavelNome} />
          ) : podeDesignar ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Botao
                  tamanho="compacto"
                  iconeAntes="plus"
                  disabled={atribuir.isPending}
                  aria-label="Atribuir responsável"
                >
                  Atribuir
                </Botao>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
                {membros.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => {
                      atribuir.mutate(m.id)
                    }}
                  >
                    {m.nome}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="corpo text-(--tinta-3)">Sem responsável</span>
          )}
        </Linha>
        {podeDesignar ? (
          <div className="flex flex-col gap-(--e-1)">
            <dt>
              <label htmlFor="conferente" className="rotulo">
                Conferente
              </label>
            </dt>
            <dd>
              <select
                id="conferente"
                className={classeCampo}
                value={ocorrencia.conferenteId ?? ''}
                disabled={designar.isPending}
                onChange={(evento) => {
                  designar.mutate(evento.target.value || null)
                }}
              >
                <option value="">Qualquer pessoa da Gestão</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        ) : (
          <Linha rotulo="Conferente">
            {ocorrencia.conferenteNome ? (
              <Pessoa nome={ocorrencia.conferenteNome} />
            ) : (
              <span className="corpo text-(--tinta-2)">Qualquer pessoa da Gestão</span>
            )}
          </Linha>
        )}
      </dl>
    </section>
  )
}

/**
 * /ocorrencias/:id (Protótipo 16; DEM-01 a DEM-04, DEM-09). No topo, quanto falta, a situação e a
 * próxima ação; depois o texto da condicionante, as etapas, a evidência e as vistorias; ao lado,
 * datas, pessoas e histórico. Quem pode o quê é decidido no banco.
 */
export function PaginaOcorrencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ehGestao = atual.papel === 'gestao'
  const entradaArquivo = useRef<HTMLInputElement>(null)

  const ocorrencia = useQuery({ queryKey: ['ocorrencia', id], queryFn: () => obterOcorrencia(id) })
  const existe = Boolean(ocorrencia.data)
  const etapas = useQuery({
    queryKey: ['ocorrencia', id, 'etapas'],
    queryFn: () => listarEtapas(id),
    enabled: existe,
  })
  const evidencias = useQuery({
    queryKey: ['ocorrencia', id, 'evidencias'],
    queryFn: () => listarEvidencias(id),
    enabled: existe,
  })
  const historico = useQuery({
    queryKey: ['ocorrencia', id, 'historico'],
    queryFn: () => listarHistorico(id),
    enabled: existe,
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', atual.consultoriaId],
    queryFn: () => listarMembrosAtivos(atual.consultoriaId),
    enabled: existe,
  })

  // Com a ocorrência carregada, a <Pagina> põe o título na aba; antes disso, fica o genérico.
  useEffect(() => {
    if (!existe) document.title = 'Ocorrência · Grama'
  }, [existe])

  async function recarregar() {
    // A Visão e o calendário mostram "em conferência" e responsável: também ficam velhos.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ocorrencia', id] }),
      queryClient.invalidateQueries({ queryKey: ['prazos'] }),
    ])
  }

  /** Botão principal "Enviar evidência": leva ao formulário e já abre o seletor de arquivo. */
  function irParaEnvio() {
    const entrada = entradaArquivo.current
    if (!entrada) return
    entrada.closest('form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    entrada.click()
  }

  if (ocorrencia.isPending) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <VoltarParaVisao />
        <Carregando rotulo="Carregando a ocorrência" linhas={5} />
      </div>
    )
  }
  if (ocorrencia.isError) {
    return (
      <div className="flex flex-col gap-(--e-4)">
        <VoltarParaVisao />
        {ehSemPermissao(ocorrencia.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar a ocorrência."
            aoTentarDeNovo={() => void ocorrencia.refetch()}
          />
        )}
      </div>
    )
  }
  if (!ocorrencia.data) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <div className="flex flex-col gap-(--e-4)">
        <VoltarParaVisao />
        <h1 className="sr-only">Ocorrência não encontrada</h1>
        <EstadoVazio
          icone="file-text"
          titulo="Ocorrência não encontrada"
          descricao={`Ela não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/">Voltar para a Visão da equipe</Link>
            </Botao>
          }
        />
      </div>
    )
  }

  const dados = ocorrencia.data
  const listaEtapas = etapas.data ?? []
  const listaEvidencias = evidencias.data ?? []
  const ultima = listaEvidencias[0]
  const exibida = situacaoExibida(dados.situacao, ultima?.situacao ?? null)
  const filhosCarregando = etapas.isPending || evidencias.isPending
  const filhosComErro = etapas.isError || evidencias.isError

  return (
    <Pagina
      titulo={dados.titulo}
      prefixo={dados.codigo}
      voltar={{ para: '/', rotulo: 'Visão da equipe' }}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-2)">
          <Link to={`/empreendimentos/${dados.empreendimentoId}`}>{dados.empreendimentoNome}</Link>
          <span aria-hidden="true">·</span>
          <span>{dados.unidadeNome}</span>
          {dados.licenca ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="numero">{dados.licenca}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className="numero">Ciclo {dados.ciclo}</span>
        </span>
      }
    >
      <PainelAgora
        ocorrencia={dados}
        exibida={exibida}
        etapas={listaEtapas}
        ultima={ultima}
        pronto={!filhosCarregando && !filhosComErro}
        membroId={atual.membroId}
        ehGestao={ehGestao}
        fuso={atual.fuso}
        aoMudar={recarregar}
        aoEnviarEvidencia={irParaEnvio}
      />

      <div className="grid gap-(--e-8) lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-(--e-8)">
          <section aria-labelledby="titulo-origem" className="flex flex-col gap-(--e-2)">
            <h2 id="titulo-origem" className="titulo-secao text-(--tinta)">
              Texto da condicionante
            </h2>
            <blockquote className="max-w-[72ch] border-l-[3px] border-(--marca-linha) pl-(--e-4) corpo text-pretty whitespace-pre-line text-(--tinta)">
              {dados.textoLiteral}
            </blockquote>
            <BaseLegal texto={dados.textoLiteral} />
          </section>

          {filhosComErro ? (
            <EstadoErro
              titulo="Não foi possível carregar etapas e evidências."
              aoTentarDeNovo={() => {
                void etapas.refetch()
                void evidencias.refetch()
              }}
            />
          ) : filhosCarregando ? (
            <Carregando rotulo="Carregando etapas e evidências" linhas={3} />
          ) : (
            <>
              <SecaoEtapas
                ocorrenciaId={dados.id}
                etapas={listaEtapas}
                membros={membros.data ?? []}
                podeEditar={dados.situacao !== 'concluida'}
                aoMudar={recarregar}
              />
              <SecaoEvidencia
                ocorrencia={dados}
                evidencias={listaEvidencias}
                fuso={atual.fuso}
                entrada={entradaArquivo}
                aoMudar={recarregar}
              />
              <SecaoVistorias
                ocorrenciaId={dados.id}
                membros={membros.data ?? []}
                podeAgendar={dados.situacao !== 'concluida'}
              />
            </>
          )}
        </div>

        <aside
          className="flex flex-col gap-(--e-6) max-lg:border-t max-lg:pt-(--e-6) lg:border-l lg:pl-(--e-6)"
          aria-label="Detalhes"
        >
          <Datas ocorrencia={dados} />
          <Pessoas
            ocorrencia={dados}
            ehGestao={ehGestao}
            membros={membros.data ?? []}
            aoMudar={recarregar}
          />
          {historico.isError ? (
            <EstadoErro
              titulo="Não foi possível carregar o histórico."
              aoTentarDeNovo={() => void historico.refetch()}
            />
          ) : historico.isPending ? (
            <Carregando rotulo="Carregando o histórico" linhas={3} />
          ) : (
            <SecaoHistorico eventos={historico.data} fuso={atual.fuso} />
          )}
        </aside>
      </div>
    </Pagina>
  )
}
