// Tarefas geradas pela aprovação (Protótipo 22, tela "Orçamento aprovado"; ADR-0029) e o aceite
// registrado de cada revisão. A Gestão edita, acrescenta, cancela; o responsável inicia e conclui.

import {
  ROTULO_DO_METODO_DE_ACEITE,
  formatarDataCivil,
  formatarDuracao,
  hojeNoFuso,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { AcoesDaTarefa, DialogoTarefa, SeloDaTarefa } from '@/app/paginas/tarefas/pecas-da-tarefa'
import { textoDoPrazo } from '@/app/paginas/tarefas/texto-do-prazo'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import type { SituacaoOrcamento } from '@/lib/api/orcamentos'
import { listarMembrosAtivos } from '@/lib/api/perfil'
import {
  CHAVE_TAREFAS,
  listarAceites,
  listarTarefasDeServico,
  type TarefaDeServico,
} from '@/lib/api/tarefas'

export function TarefasDoOrcamento({
  orcamentoId,
  situacao,
}: {
  orcamentoId: string
  situacao: SituacaoOrcamento
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ehGestao = atual.papel === 'gestao'
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [dialogo, setDialogo] = useState<{ tarefa: TarefaDeServico | null } | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  const tarefas = useQuery({
    queryKey: [CHAVE_TAREFAS, cid, orcamentoId],
    queryFn: () => listarTarefasDeServico(cid, { orcamentoId }),
  })
  const aceites = useQuery({
    queryKey: ['aceites-do-orcamento', orcamentoId],
    queryFn: () => listarAceites(orcamentoId),
    enabled: ehGestao && situacao === 'aprovada',
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
    enabled: ehGestao,
  })

  if (tarefas.isPending) return <Carregando rotulo="Carregando as tarefas" linhas={2} />
  if (tarefas.isError)
    return (
      <EstadoErro
        titulo="Não foi possível carregar as tarefas."
        aoTentarDeNovo={() => void tarefas.refetch()}
      />
    )
  if (tarefas.data.length === 0 && situacao !== 'aprovada') return null

  const aceite = aceites.data?.[0] ?? null
  const minutos = tarefas.data
    .filter((t) => t.situacao !== 'cancelada')
    .reduce((soma, t) => soma + (t.minutosEstimados ?? 0), 0)
  const concluidas = tarefas.data.filter((t) => t.situacao === 'concluida').length

  return (
    <section
      aria-label="Tarefas da execução"
      className="flex flex-col gap-(--space-150) rounded-(--radius-large) border bg-(--surface) p-(--space-200) shadow-cartao"
    >
      <div className="flex flex-wrap items-center justify-between gap-(--space-100)">
        <h2 className="titulo-secao">Tarefas da execução</h2>
        <span className="corpo tabular-nums text-(--text-subtle)">
          {concluidas} de {tarefas.data.length} concluídas · {formatarDuracao(minutos)} estimadas
        </span>
      </div>

      {aceite ? (
        <p className="corpo">
          Aceite: {aceite.aprovadoPor} em {formatarDataCivil(aceite.dataAceite)} ·{' '}
          {aceite.referencia}
          {aceite.metodo ? ` · ${ROTULO_DO_METODO_DE_ACEITE[aceite.metodo]}` : ''} (revisão{' '}
          {aceite.revisao})
        </p>
      ) : null}

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}

      {tarefas.data.length === 0 ? (
        <p className="corpo text-(--text-subtle)">Nenhuma tarefa.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {tarefas.data.map((t) => {
            const prazo = textoDoPrazo(t)
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-(--space-100) py-(--space-100)"
              >
                <div className="flex min-w-0 flex-col gap-(--space-025)">
                  <span className="flex flex-wrap items-center gap-(--space-075)">
                    <span className={t.situacao === 'cancelada' ? 'corpo line-through' : 'corpo'}>
                      {t.titulo}
                    </span>
                    <SeloDaTarefa situacao={t.situacao} />
                    {t.foraDaRevisao ? <Selo tom="atencao">Fora da revisão aprovada</Selo> : null}
                  </span>
                  <span className="text-xs tabular-nums text-(--text-subtle)">
                    {t.responsavelNome ?? 'Sem responsável'} ·{' '}
                    {t.prazoInterno ? `Prazo ${formatarDataCivil(t.prazoInterno)}` : 'Sem prazo'}
                    {prazo ? ` (${prazo})` : ''} ·{' '}
                    {t.minutosEstimados === null
                      ? 'Sem horas'
                      : formatarDuracao(t.minutosEstimados)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-(--space-050)">
                  <AcoesDaTarefa
                    tarefa={t}
                    ehGestao={ehGestao}
                    membroAtualId={atual.membroId}
                    aoFalhar={setFalha}
                  />
                  {ehGestao ? (
                    <Botao
                      tamanho="compacto"
                      aparencia="sutil"
                      aria-label={`Editar: ${t.titulo}`}
                      onClick={() => {
                        setDialogo({ tarefa: t })
                      }}
                    >
                      Editar
                    </Botao>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {ehGestao && situacao === 'aprovada' ? (
        <div>
          <Botao
            tamanho="compacto"
            onClick={() => {
              setDialogo({ tarefa: null })
            }}
          >
            Adicionar tarefa
          </Botao>
        </div>
      ) : null}

      {ehGestao ? (
        <DialogoTarefa
          aberto={dialogo !== null}
          aoMudarAberto={(aberto) => {
            if (!aberto) setDialogo(null)
          }}
          orcamentoId={orcamentoId}
          tarefa={dialogo?.tarefa ?? null}
          pessoas={(membros.data ?? []).map((m) => ({ id: m.id, nome: m.nome }))}
          hoje={hoje}
        />
      ) : null}
    </section>
  )
}
