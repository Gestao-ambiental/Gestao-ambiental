import {
  diferencaEmDias,
  formatarDataCivil,
  proximaAcao,
  situacaoDoPrazo,
  situacaoExibida,
  type DataCivil,
  type SituacaoExibida,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import {
  designarConferente,
  listarEtapas,
  listarEvidencias,
  listarHistorico,
  obterOcorrencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { SeloSituacaoPrazo } from '../visao/SeloSituacaoPrazo'
import { SecaoConclusao } from './SecaoConclusao'
import { SecaoEtapas } from './SecaoEtapas'
import { SecaoEvidencia } from './SecaoEvidencia'
import { SecaoHistorico } from './SecaoHistorico'

const SITUACAO: Record<SituacaoExibida, { texto: string; tom: TomSelo }> = {
  a_fazer: { texto: 'A fazer', tom: 'padrao' },
  em_conferencia: { texto: 'Em conferência', tom: 'revisao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  devolvida: { texto: 'Devolvida', tom: 'perigo' },
  concluida: { texto: 'Concluída', tom: 'sucesso' },
}

const classeSelect =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text)'

function Voltar() {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-(--space-050) corpo">
      <Link
        to="/"
        aria-label="Voltar para a Visão da equipe"
        title="Voltar para a Visão da equipe"
        className="inline-flex size-(--size-control) items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Icone nome="chevron-left" />
      </Link>
      <Link to="/">Visão da equipe</Link>
    </nav>
  )
}

function emDias(data: DataCivil, hoje: DataCivil): string {
  const dias = diferencaEmDias(data, hoje)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias > 1) return `em ${String(dias)} dias`
  return dias === -1 ? 'há 1 dia' : `há ${String(-dias)} dias`
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--space-025)">
      <dt className="text-xs text-(--text-subtle)">{rotulo}</dt>
      <dd className="corpo">{children}</dd>
    </div>
  )
}

function Datas({ ocorrencia }: { ocorrencia: Ocorrencia }) {
  const mudou = ocorrencia.prazoAtual !== ocorrencia.prazoOriginal
  return (
    <section aria-labelledby="titulo-datas" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-datas" className="rotulo-maiusculo text-(--text-subtle)">
        Datas
      </h2>
      <dl className="flex flex-col gap-(--space-100)">
        <Linha rotulo="Prazo oficial">
          {formatarDataCivil(ocorrencia.prazoOriginal)}
          {mudou ? null : (
            <span className="text-(--text-subtle)">
              {' '}
              · {emDias(ocorrencia.prazoOriginal, ocorrencia.hoje)}
            </span>
          )}
        </Linha>
        {mudou ? (
          <Linha rotulo="Prazo atual">
            {formatarDataCivil(ocorrencia.prazoAtual)}
            <span className="text-(--text-subtle)">
              {' '}
              · {emDias(ocorrencia.prazoAtual, ocorrencia.hoje)}
            </span>
          </Linha>
        ) : null}
        <Linha rotulo="Meta interna">
          {ocorrencia.metaInterna ? (
            formatarDataCivil(ocorrencia.metaInterna)
          ) : (
            <span className="text-(--text-subtlest)">Sem meta</span>
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
  const podeDesignar = ehGestao && ocorrencia.situacao !== 'concluida'

  return (
    <section aria-labelledby="titulo-pessoas" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-pessoas" className="rotulo-maiusculo text-(--text-subtle)">
        Pessoas
      </h2>
      {designar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(designar.error)}
        </MensagemSecao>
      ) : null}
      <dl className="flex flex-col gap-(--space-100)">
        <Linha rotulo="Responsável">
          {ocorrencia.responsavelNome ?? (
            <span className="text-(--text-subtlest)">Sem responsável</span>
          )}
        </Linha>
        {podeDesignar ? (
          <div className="flex flex-col gap-(--space-025)">
            <dt>
              <label htmlFor="conferente" className="text-xs text-(--text-subtle)">
                Conferente
              </label>
            </dt>
            <dd>
              <select
                id="conferente"
                className={classeSelect}
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
            {ocorrencia.conferenteNome ?? (
              <span className="text-(--text-subtle)">Qualquer pessoa da Gestão</span>
            )}
          </Linha>
        )}
      </dl>
    </section>
  )
}

/**
 * /ocorrencias/:id (Protótipo 16; DEM-01 a DEM-04, DEM-09). Origem, próxima ação, etapas,
 * evidência com conferência, conclusão e histórico. Quem pode o quê é decidido no banco.
 */
export function PaginaOcorrencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const ehGestao = atual.papel === 'gestao'

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

  const codigo = ocorrencia.data?.codigo
  useEffect(() => {
    document.title = `${codigo ?? 'Ocorrência'} · Grama`
  }, [codigo])

  async function recarregar() {
    // A Visão e o calendário mostram "em conferência" e responsável: também ficam velhos.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ocorrencia', id] }),
      queryClient.invalidateQueries({ queryKey: ['prazos'] }),
    ])
  }

  if (ocorrencia.isPending) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Voltar />
        <Carregando rotulo="Carregando a ocorrência" linhas={5} />
      </div>
    )
  }
  if (ocorrencia.isError) {
    return (
      <div className="flex flex-col gap-(--space-200)">
        <Voltar />
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
      <div className="flex flex-col gap-(--space-200)">
        <Voltar />
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
  const situacao = SITUACAO[exibida]
  const dias = diferencaEmDias(dados.prazoAtual, dados.hoje)
  const filhosCarregando = etapas.isPending || evidencias.isPending
  const filhosComErro = etapas.isError || evidencias.isError

  return (
    <div className="flex flex-col gap-(--space-200)">
      <Voltar />

      <header className="flex flex-col gap-(--space-050)">
        <h1 className="titulo-tela text-(--text)">
          <span className="font-mono text-(--text-subtle)">{dados.codigo}</span> · {dados.titulo}
        </h1>
        <p className="flex flex-wrap items-center gap-(--space-100) corpo text-(--text-subtle)">
          <Selo tom={situacao.tom}>{situacao.texto}</Selo>
          {dados.situacao === 'concluida' ? null : (
            <SeloSituacaoPrazo
              situacao={situacaoDoPrazo({
                tipo: 'ocorrencia',
                dias,
                emConferencia: dados.situacao === 'em_conferencia',
              })}
            />
          )}
          <span>Ciclo {dados.ciclo}</span>
          <span aria-hidden="true">·</span>
          <Link to={`/empreendimentos/${dados.empreendimentoId}`}>{dados.empreendimentoNome}</Link>
          {dados.licenca ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{dados.licenca}</span>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid gap-(--space-300) lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-(--space-300)">
          <section aria-labelledby="titulo-proxima" className="flex flex-col gap-(--space-050)">
            <h2 id="titulo-proxima" className="rotulo-maiusculo text-(--text-subtle)">
              Próxima ação
            </h2>
            <p className="corpo-medio">
              {filhosCarregando ? '…' : proximaAcao(exibida, listaEtapas)}
            </p>
          </section>

          <section aria-labelledby="titulo-origem" className="flex flex-col gap-(--space-050)">
            <h2 id="titulo-origem" className="rotulo-maiusculo text-(--text-subtle)">
              Texto da condicionante
            </h2>
            <blockquote className="border-l-2 border-(--border-strong) pl-(--space-150) corpo whitespace-pre-line">
              {dados.textoLiteral}
            </blockquote>
            <p className="text-xs text-(--text-subtle)">{dados.unidadeNome}</p>
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
                membroId={atual.membroId}
                ehGestao={ehGestao}
                fuso={atual.fuso}
                aoMudar={recarregar}
              />
              <SecaoConclusao
                ocorrencia={dados}
                ultimaAprovada={ultima?.situacao === 'aprovada'}
                ehGestao={ehGestao}
                fuso={atual.fuso}
                aoMudar={recarregar}
              />
            </>
          )}
        </div>

        <aside className="flex flex-col gap-(--space-300)" aria-label="Detalhes">
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
    </div>
  )
}
