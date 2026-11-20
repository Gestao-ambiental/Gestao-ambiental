// Tarefas de serviço abertas na visão da equipe (ADR-0029): "Toda a equipe" mostra todas,
// "Minhas ações" só as da pessoa. Ficam abaixo dos prazos das condicionantes, no mesmo quadro:
// quanto falta à esquerda, a tarefa, a situação e as ações. Sem tarefas, o bloco não aparece.

import { formatarDataCivil, formatarDuracao } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { CHAVE_TAREFAS, listarTarefasDeServico } from '@/lib/api/tarefas'
import { ehSemPermissao } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { Contagem } from '../visao/Contagem'
import { AcoesDaTarefa, SeloDaTarefa } from './pecas-da-tarefa'
import { textoDoPrazo } from './texto-do-prazo'

export function TarefasNaVisao({ aba }: { aba: 'todos' | 'minhas' }) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const ehGestao = atual.papel === 'gestao'
  const [falha, setFalha] = useState<string | null>(null)
  const titulo = aba === 'minhas' ? 'Minhas tarefas de serviço' : 'Tarefas de serviço'
  const filtros = {
    abertas: true,
    responsavelId: aba === 'minhas' ? atual.membroId : null,
  }
  const tarefas = useQuery({
    queryKey: [CHAVE_TAREFAS, cid, 'visao', filtros],
    queryFn: () => listarTarefasDeServico(cid, filtros),
  })

  let conteudo
  if (tarefas.isError) {
    conteudo = ehSemPermissao(tarefas.error) ? (
      <SemPermissao descricao={null} />
    ) : (
      <EstadoErro
        titulo="Não foi possível carregar as tarefas de serviço."
        aoTentarDeNovo={() => void tarefas.refetch()}
      />
    )
  } else if (tarefas.isPending) {
    conteudo = <Carregando rotulo="Carregando as tarefas de serviço" linhas={2} />
  } else if (tarefas.data.length === 0) {
    return null
  } else {
    conteudo = (
      <ul className="flex flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)">
        {tarefas.data.map((t, indice) => {
          const prazo = textoDoPrazo(t)
          return (
            <li
              key={t.id}
              className={cn(
                'flex min-h-(--linha) flex-wrap items-center gap-x-(--e-3) gap-y-(--e-2) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) transicao-estado last:border-b-0 hover:bg-(--toque) md:px-(--e-3)',
                t.dias === 0 && prazo && 'bg-(--sinal-fundo) hover:bg-(--sinal-fundo)',
              )}
            >
              <span className="w-[56px] shrink-0">
                {prazo && t.dias !== null ? (
                  <Contagem dias={t.dias} ordem={indice} />
                ) : (
                  <span aria-hidden className="numero-contagem text-(--tinta-3)">
                    —
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 basis-[220px] flex-col gap-(--e-05)">
                <span className="corpo-medio text-(--tinta)">{t.titulo}</span>
                {prazo ? <span className="sr-only">{prazo}</span> : null}
                <span className="text-xs text-(--tinta-2) numero">
                  {ehGestao ? (
                    <Link to={`/orcamentos/${t.orcamentoId}`}>{t.orcamentoNumero}</Link>
                  ) : (
                    t.orcamentoNumero
                  )}{' '}
                  · {t.empreendimentoNome} · {t.responsavelNome ?? 'Sem responsável'} ·{' '}
                  {t.prazoInterno ? formatarDataCivil(t.prazoInterno) : 'Sem prazo'} ·{' '}
                  {t.minutosEstimados === null ? 'Sem horas' : formatarDuracao(t.minutosEstimados)}
                </span>
              </div>
              <span className="flex flex-wrap items-center gap-(--e-3) max-md:w-full max-md:pl-[68px]">
                <SeloDaTarefa situacao={t.situacao} />
                <AcoesDaTarefa
                  tarefa={t}
                  ehGestao={ehGestao}
                  membroAtualId={atual.membroId}
                  aoFalhar={setFalha}
                />
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section aria-label={titulo} className="flex flex-col gap-(--e-3)">
      <h2 className="titulo-secao">{titulo}</h2>
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      {conteudo}
    </section>
  )
}
