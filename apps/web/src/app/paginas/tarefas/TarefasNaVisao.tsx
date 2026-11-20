// Tarefas de serviço abertas na visão da equipe (ADR-0029): "Toda a equipe" mostra todas,
// "Minhas ações" só as da pessoa. Ficam ao lado dos prazos das condicionantes, com o rótulo
// "Serviço". Sem tarefas, o bloco não aparece.

import { formatarDataCivil, formatarDuracao } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { CHAVE_TAREFAS, listarTarefasDeServico } from '@/lib/api/tarefas'
import { ehSemPermissao } from '@/lib/erros'

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
      <ul className="flex flex-col divide-y rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
        {tarefas.data.map((t) => {
          const prazo = textoDoPrazo(t)
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-(--e-2) px-(--e-3) py-(--e-2)"
            >
              <div className="flex min-w-0 flex-col gap-(--e-05)">
                <span className="flex flex-wrap items-center gap-(--e-15)">
                  <Selo>Serviço</Selo>
                  <span className="corpo">{t.titulo}</span>
                  <SeloDaTarefa situacao={t.situacao} />
                </span>
                <span className="text-xs tabular-nums text-(--tinta-2)">
                  {ehGestao ? (
                    <Link to={`/orcamentos/${t.orcamentoId}`}>{t.orcamentoNumero}</Link>
                  ) : (
                    t.orcamentoNumero
                  )}{' '}
                  · {t.empreendimentoNome} · {t.responsavelNome ?? 'Sem responsável'} ·{' '}
                  {t.prazoInterno ? formatarDataCivil(t.prazoInterno) : 'Sem prazo'}
                  {prazo ? ` (${prazo})` : ''} ·{' '}
                  {t.minutosEstimados === null ? 'Sem horas' : formatarDuracao(t.minutosEstimados)}
                </span>
              </div>
              <AcoesDaTarefa
                tarefa={t}
                ehGestao={ehGestao}
                membroAtualId={atual.membroId}
                aoFalhar={setFalha}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section aria-label={titulo} className="flex flex-col gap-(--e-2)">
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
