import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  concluirOcorrencia,
  concluirSemEvidencia,
  reabrirOcorrencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

type Acao = 'sem_evidencia' | 'reabrir'

const DIALOGOS: Record<
  Acao,
  { titulo: string; descricao: string; campo: string; botao: string; vazio: string }
> = {
  sem_evidencia: {
    titulo: 'Concluir sem evidência',
    descricao: 'Use só quando não há arquivo a apresentar. A justificativa fica no histórico.',
    campo: 'Justificativa',
    botao: 'Concluir sem evidência',
    vazio: 'Informe a justificativa',
  },
  reabrir: {
    titulo: 'Reabrir ocorrência',
    descricao: 'A ocorrência volta a ficar aberta para novo envio. O motivo fica no histórico.',
    campo: 'Motivo',
    botao: 'Reabrir',
    vazio: 'Informe o motivo',
  },
}

/**
 * Conclusão (DEM-04): só a Gestão conclui, depois da evidência aprovada; sem evidência, com
 * justificativa; reabrir pede motivo. row_version evita decidir em cima de tela velha.
 */
export function SecaoConclusao({
  ocorrencia,
  ultimaAprovada,
  ehGestao,
  fuso,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  ultimaAprovada: boolean
  ehGestao: boolean
  fuso: string
  aoMudar: () => Promise<void>
}) {
  const [acao, setAcao] = useState<Acao | null>(null)
  const [texto, setTexto] = useState('')
  const [erroTexto, setErroTexto] = useState<string | null>(null)

  const executar = useMutation({
    mutationFn: (qual: Acao | 'concluir') => {
      if (qual === 'concluir') return concluirOcorrencia(ocorrencia.id, ocorrencia.rowVersion)
      if (qual === 'sem_evidencia')
        return concluirSemEvidencia(ocorrencia.id, texto, ocorrencia.rowVersion)
      return reabrirOcorrencia(ocorrencia.id, texto, ocorrencia.rowVersion)
    },
    onSuccess: async () => {
      setAcao(null)
      setTexto('')
      await aoMudar()
    },
  })

  const concluida = ocorrencia.situacao === 'concluida'
  const dialogo = acao ? DIALOGOS[acao] : null

  return (
    <section aria-labelledby="titulo-conclusao" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-conclusao" className="rotulo-maiusculo text-(--text-subtle)">
        Conclusão
      </h2>
      {executar.isError && !acao ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(executar.error)}
        </MensagemSecao>
      ) : null}

      {concluida ? (
        <p className="corpo">
          {ocorrencia.concluidaSemEvidencia ? 'Concluída sem evidência' : 'Concluída'}
          {ocorrencia.concluidaPorNome ? ` por ${ocorrencia.concluidaPorNome}` : ''}
          {ocorrencia.concluidaEm
            ? ` em ${formatarInstanteComHora(ocorrencia.concluidaEm, fuso)}`
            : ''}
          .
        </p>
      ) : !ehGestao ? (
        <p className="text-xs text-(--text-subtle)">Só a Gestão conclui, depois da aprovação.</p>
      ) : ultimaAprovada ? (
        <p className="text-xs text-(--text-subtle)">Evidência aprovada. Falta concluir.</p>
      ) : (
        <p className="text-xs text-(--text-subtle)">
          Concluir fica disponível depois da evidência aprovada.
        </p>
      )}

      {ehGestao ? (
        <div className="flex flex-wrap gap-(--space-100)">
          {concluida ? (
            <Botao
              onClick={() => {
                setAcao('reabrir')
              }}
            >
              Reabrir
            </Botao>
          ) : (
            <>
              <Botao
                aparencia="primario"
                iconeAntes="check"
                disabled={!ultimaAprovada || executar.isPending}
                onClick={() => {
                  executar.mutate('concluir')
                }}
              >
                Concluir ocorrência
              </Botao>
              {ultimaAprovada ? null : (
                <Botao
                  onClick={() => {
                    setAcao('sem_evidencia')
                  }}
                >
                  Concluir sem evidência
                </Botao>
              )}
            </>
          )}
        </div>
      ) : null}

      <Dialogo
        aberto={acao !== null}
        aoMudar={(aberto) => {
          if (!aberto) {
            setAcao(null)
            setErroTexto(null)
            executar.reset()
          }
        }}
        titulo={dialogo?.titulo ?? ''}
        descricao={dialogo?.descricao}
        acoes={
          <>
            <Botao
              onClick={() => {
                setAcao(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={executar.isPending}
              onClick={() => {
                if (!acao || !dialogo) return
                if (!texto.trim()) {
                  setErroTexto(dialogo.vazio)
                  return
                }
                executar.mutate(acao)
              }}
            >
              {dialogo?.botao}
            </Botao>
          </>
        }
      >
        {executar.isError && acao ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(executar.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo={dialogo?.campo ?? ''}
          value={texto}
          erro={erroTexto ?? undefined}
          onChange={(evento) => {
            setTexto(evento.target.value)
            setErroTexto(null)
          }}
        />
      </Dialogo>
    </section>
  )
}
