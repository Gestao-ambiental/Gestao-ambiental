// Peças das tarefas de serviço (ADR-0029): selo da situação, botões de mudança (responsável ou
// Gestão) e o diálogo de editar/acrescentar (Gestão). Usadas no orçamento e na visão da equipe.

import {
  ROTULO_DA_SITUACAO_DA_TAREFA,
  errosDoRoteiro,
  horasDoCampo,
  minutosDasHoras,
  proximasSituacoesDaTarefa,
  rotuloDaAcaoDaTarefa,
  type DataCivil,
  type SituacaoDaTarefa,
} from '@gestao-ambiental/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { classeCampo } from '@/app/paginas/orcamentos/comum'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  CHAVE_TAREFAS,
  adicionarTarefa,
  editarTarefa,
  mudarSituacaoDaTarefa,
  type TarefaDeServico,
} from '@/lib/api/tarefas'
import { mensagemDoErro } from '@/lib/erros'

const TOM_DA_SITUACAO: Record<SituacaoDaTarefa, TomSelo> = {
  a_fazer: 'padrao',
  em_andamento: 'andamento',
  concluida: 'sucesso',
  cancelada: 'perigoMedio',
}

export function SeloDaTarefa({ situacao }: { situacao: SituacaoDaTarefa }) {
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO_DA_TAREFA[situacao]}</Selo>
}

/** Botões de situação. A Equipe só mexe nas próprias tarefas. */
export function AcoesDaTarefa({
  tarefa,
  ehGestao,
  membroAtualId,
  aoFalhar,
}: {
  tarefa: TarefaDeServico
  ehGestao: boolean
  membroAtualId: string | null
  aoFalhar: (mensagem: string) => void
}) {
  const queryClient = useQueryClient()
  const mudar = useMutation({
    mutationFn: (para: SituacaoDaTarefa) =>
      mudarSituacaoDaTarefa(tarefa.id, tarefa.rowVersion, para),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [CHAVE_TAREFAS] }),
    onError: (erro) => {
      aoFalhar(mensagemDoErro(erro))
    },
  })
  const pode = ehGestao || (membroAtualId !== null && tarefa.responsavelId === membroAtualId)
  if (!pode) return null
  return (
    <div className="flex flex-wrap gap-(--e-1)">
      {proximasSituacoesDaTarefa(tarefa.situacao, ehGestao).map((para) => (
        <Botao
          key={para}
          tamanho="compacto"
          aparencia={para === 'concluida' ? 'primario' : 'padrao'}
          disabled={mudar.isPending}
          aria-label={`${rotuloDaAcaoDaTarefa(tarefa.situacao, para)}: ${tarefa.titulo}`}
          onClick={() => {
            mudar.mutate(para)
          }}
        >
          {rotuloDaAcaoDaTarefa(tarefa.situacao, para)}
        </Botao>
      ))}
    </div>
  )
}

/** Editar uma tarefa (com `tarefa`) ou acrescentar uma nova ao orçamento aprovado (sem ela). */
export function DialogoTarefa({
  aberto,
  aoMudarAberto,
  orcamentoId,
  tarefa,
  pessoas,
  hoje,
}: {
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  orcamentoId: string
  tarefa: TarefaDeServico | null
  pessoas: readonly { id: string; nome: string }[]
  hoje: DataCivil
}) {
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudarAberto}
      titulo={tarefa ? 'Editar tarefa' : 'Adicionar tarefa'}
      largura={520}
    >
      {aberto ? (
        <FormularioDaTarefa
          key={tarefa?.id ?? 'nova'}
          orcamentoId={orcamentoId}
          tarefa={tarefa}
          pessoas={pessoas}
          hoje={hoje}
          aoTerminar={() => {
            aoMudarAberto(false)
          }}
        />
      ) : null}
    </Dialogo>
  )
}

function FormularioDaTarefa({
  orcamentoId,
  tarefa,
  pessoas,
  hoje,
  aoTerminar,
}: {
  orcamentoId: string
  tarefa: TarefaDeServico | null
  pessoas: readonly { id: string; nome: string }[]
  hoje: DataCivil
  aoTerminar: () => void
}) {
  const queryClient = useQueryClient()
  const idResponsavel = useId()
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '')
  const [responsavelId, setResponsavelId] = useState<string | null>(tarefa?.responsavelId ?? null)
  const [horas, setHoras] = useState(horasDoCampo(tarefa?.minutosEstimados ?? 0))
  const [prazo, setPrazo] = useState<DataCivil | null>(tarefa?.prazoInterno ?? null)
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const erros =
    errosDoRoteiro([
      { chave: 'x', itemId: null, titulo, responsavelId, horas, prazoInterno: prazo ?? '' },
    ]).x ?? {}

  const gravar = useMutation({
    mutationFn: async (): Promise<void> => {
      const dados = {
        titulo,
        responsavelId,
        minutos: minutosDasHoras(horas) ?? null,
        prazoInterno: prazo,
      }
      if (tarefa) await editarTarefa(tarefa.id, tarefa.rowVersion, dados)
      else await adicionarTarefa(orcamentoId, crypto.randomUUID(), dados)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHAVE_TAREFAS] })
      void queryClient.invalidateQueries({ queryKey: ['carga-da-equipe'] })
      aoTerminar()
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  return (
    <form
      className="flex flex-col gap-(--e-3)"
      onSubmit={(e) => {
        e.preventDefault()
        setTentou(true)
        setFalha(null)
        if (Object.keys(erros).length === 0) gravar.mutate()
      }}
    >
      <CampoTexto
        rotulo="Tarefa"
        value={titulo}
        maxLength={200}
        erro={tentou ? erros.titulo : undefined}
        onChange={(e) => {
          setTitulo(e.target.value)
        }}
      />
      <label htmlFor={idResponsavel} className="flex flex-col gap-(--e-1)">
        <span className="rotulo">Responsável</span>
        <select
          id={idResponsavel}
          className={classeCampo}
          value={responsavelId ?? ''}
          onChange={(e) => {
            setResponsavelId(e.target.value || null)
          }}
        >
          <option value="">Sem responsável</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-(--e-3) sm:grid-cols-2">
        <CampoTexto
          rotulo="Horas"
          inputMode="decimal"
          placeholder="—"
          value={horas}
          erro={tentou ? erros.horas : undefined}
          onChange={(e) => {
            setHoras(e.target.value)
          }}
        />
        <CampoData rotulo="Prazo interno" valor={prazo} aoMudar={setPrazo} hoje={hoje} />
      </div>
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      <div className="flex justify-end gap-(--e-2)">
        <Botao type="button" onClick={aoTerminar}>
          Cancelar
        </Botao>
        <Botao
          type="submit"
          aparencia="primario"
          disabled={gravar.isPending}
          aria-busy={gravar.isPending || undefined}
        >
          {gravar.isPending ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  )
}
