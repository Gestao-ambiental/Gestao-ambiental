import {
  diferencaEmDias,
  proximaAcao,
  situacaoDoPrazo,
  type SituacaoExibida,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  concluirEtapa,
  concluirOcorrencia,
  concluirSemEvidencia,
  conferirEvidencia,
  reabrirOcorrencia,
  type Etapa,
  type Evidencia,
  type Ocorrencia,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { Contagem } from '../visao/Contagem'
import { SeloSituacaoPrazo } from '../visao/SeloSituacaoPrazo'

const SITUACAO: Record<SituacaoExibida, { texto: string; tom: TomSelo }> = {
  a_fazer: { texto: 'A fazer', tom: 'padrao' },
  em_conferencia: { texto: 'Em conferência', tom: 'revisao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  devolvida: { texto: 'Devolvida', tom: 'perigo' },
  concluida: { texto: 'Concluída', tom: 'sucesso' },
}

type ComTexto = 'devolver' | 'sem_evidencia' | 'reabrir'

const DIALOGOS: Record<
  ComTexto,
  { titulo: string; descricao: string; campo: string; botao: string; vazio: string }
> = {
  devolver: {
    titulo: 'Devolver para correção',
    descricao: 'O motivo aparece para quem enviou e fica no histórico.',
    campo: 'Motivo',
    botao: 'Devolver',
    vazio: 'Informe o motivo',
  },
  sem_evidencia: {
    titulo: 'Concluir sem evidência',
    descricao: 'A justificativa fica no histórico.',
    campo: 'Justificativa',
    botao: 'Concluir sem evidência',
    vazio: 'Informe a justificativa',
  },
  reabrir: {
    titulo: 'Reabrir ocorrência',
    descricao: 'O motivo fica no histórico.',
    campo: 'Motivo',
    botao: 'Reabrir',
    vazio: 'Informe o motivo',
  },
}

type Execucao =
  | { tipo: 'etapa'; etapaId: string }
  | { tipo: 'aprovar' }
  | { tipo: 'concluir' }
  | { tipo: ComTexto; texto: string }

/**
 * Topo da ocorrência (DEM-02 a DEM-04, DEM-09): quanto falta, a situação e a próxima ação como o
 * botão principal da tela. Concluir etapa, aprovar ou devolver, concluir, concluir sem evidência e
 * reabrir saem daqui. Quem pode o quê é decidido no banco; a tela só não oferece o que vai falhar.
 */
export function PainelAgora({
  ocorrencia,
  exibida,
  etapas,
  ultima,
  pronto,
  membroId,
  ehGestao,
  fuso,
  aoMudar,
  aoEnviarEvidencia,
}: {
  ocorrencia: Ocorrencia
  exibida: SituacaoExibida
  etapas: readonly Etapa[]
  ultima: Evidencia | undefined
  /** Etapas e evidências carregadas: antes disso a próxima ação não é confiável. */
  pronto: boolean
  membroId: string
  ehGestao: boolean
  fuso: string
  aoMudar: () => Promise<void>
  aoEnviarEvidencia: () => void
}) {
  const [dialogo, setDialogo] = useState<ComTexto | null>(null)
  const [texto, setTexto] = useState('')
  const [erroTexto, setErroTexto] = useState<string | null>(null)

  const executar = useMutation({
    mutationFn: (execucao: Execucao) => {
      const versao = ocorrencia.rowVersion
      switch (execucao.tipo) {
        case 'etapa':
          return concluirEtapa(execucao.etapaId)
        case 'aprovar':
        case 'devolver': {
          if (!ultima) throw new Error('sem evidência')
          return execucao.tipo === 'aprovar'
            ? conferirEvidencia(ultima.id, 'aprovada', '')
            : conferirEvidencia(ultima.id, 'devolvida', execucao.texto)
        }
        case 'concluir':
          return concluirOcorrencia(ocorrencia.id, versao)
        case 'sem_evidencia':
          return concluirSemEvidencia(ocorrencia.id, execucao.texto, versao)
        case 'reabrir':
          return reabrirOcorrencia(ocorrencia.id, execucao.texto, versao)
      }
    },
    onSuccess: async () => {
      setDialogo(null)
      setTexto('')
      await aoMudar()
    },
  })

  const concluida = exibida === 'concluida'
  const dias = diferencaEmDias(ocorrencia.prazoAtual, ocorrencia.hoje)
  const situacao = SITUACAO[exibida]
  const pendente = etapas.find((etapa) => !etapa.concluida)

  // Conferência (DEM-09): o conferente designado ou, sem designação, a Gestão; com a
  // independência, nunca quem enviou.
  const aguardando =
    ocorrencia.situacao === 'em_conferencia' && ultima?.situacao === 'em_conferencia'
  const possoConferirPorPapel = ocorrencia.conferenteId
    ? ocorrencia.conferenteId === membroId
    : ehGestao
  const bloqueadoPorIndependencia =
    ocorrencia.conferenciaIndependente && ultima?.enviadaPorId === membroId
  const possoConferir = aguardando && possoConferirPorPapel && !bloqueadoPorIndependencia
  const possoEnviar = ocorrencia.situacao === 'aberta'
  const ocupado = executar.isPending

  let detalhe: ReactNode = null
  if (concluida) {
    detalhe = [
      ocorrencia.concluidaSemEvidencia ? 'Concluída sem evidência' : 'Concluída',
      ocorrencia.concluidaPorNome ? ` por ${ocorrencia.concluidaPorNome}` : '',
      ocorrencia.concluidaEm ? ` em ${formatarInstanteComHora(ocorrencia.concluidaEm, fuso)}` : '',
    ].join('')
  } else if (exibida === 'aprovada' && !ehGestao) {
    detalhe = 'Só a Gestão conclui.'
  } else if (aguardando && bloqueadoPorIndependencia && possoConferirPorPapel) {
    detalhe = (
      <span className="text-(--alerta-texto)">
        Você enviou esta evidência. Outra pessoa precisa conferir.
      </span>
    )
  } else if (aguardando && !possoConferir) {
    detalhe = `Aguardando ${ocorrencia.conferenteNome ?? 'a Gestão'}`
  } else if (exibida === 'devolvida' && ultima?.conferencia?.motivo) {
    detalhe = (
      <>
        <span className="corpo-medio text-(--tinta)">{ultima.conferencia.conferenteNome}:</span> “
        {ultima.conferencia.motivo}”
      </>
    )
  }

  let principal: ReactNode = null
  let secundaria: ReactNode = null
  if (pronto) {
    if (concluida) {
      if (ehGestao)
        principal = (
          <Botao
            iconeAntes="refresh-cw"
            onClick={() => {
              setDialogo('reabrir')
            }}
          >
            Reabrir
          </Botao>
        )
    } else if (exibida === 'aprovada') {
      if (ehGestao)
        principal = (
          <Botao
            aparencia="primario"
            iconeAntes="check"
            disabled={ocupado}
            onClick={() => {
              executar.mutate({ tipo: 'concluir' })
            }}
          >
            Concluir ocorrência
          </Botao>
        )
    } else if (possoConferir) {
      principal = (
        <Botao
          aparencia="primario"
          iconeAntes="check"
          disabled={ocupado}
          onClick={() => {
            executar.mutate({ tipo: 'aprovar' })
          }}
        >
          Aprovar
        </Botao>
      )
      secundaria = (
        <Botao
          disabled={ocupado}
          onClick={() => {
            setDialogo('devolver')
          }}
        >
          Devolver para correção
        </Botao>
      )
    } else if (possoEnviar && exibida === 'a_fazer' && pendente) {
      principal = (
        <Botao
          aparencia="primario"
          iconeAntes="check"
          disabled={ocupado}
          onClick={() => {
            executar.mutate({ tipo: 'etapa', etapaId: pendente.id })
          }}
        >
          Concluir etapa
        </Botao>
      )
    } else if (possoEnviar) {
      principal = (
        <Botao aparencia="primario" iconeAntes="upload" onClick={aoEnviarEvidencia}>
          {exibida === 'devolvida' ? 'Reenviar evidência' : 'Enviar evidência'}
        </Botao>
      )
    }
  }
  // Concluir sem evidência é exceção: fica no menu, longe do botão principal.
  const menu = pronto && ehGestao && !concluida && exibida !== 'aprovada'

  const aberto = dialogo ? DIALOGOS[dialogo] : null

  return (
    <section aria-labelledby="titulo-agora" className="flex flex-col gap-(--e-2)">
      <div
        className={cn(
          'flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) px-(--e-5) py-(--e-4) md:flex-row md:items-center',
          !concluida && dias === 0 && 'border-(--sinal-toque) bg-(--sinal-fundo)',
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-(--e-4)">
          {concluida ? null : <Contagem dias={dias} />}
          <div className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
            <div className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-1)">
              <Selo tom={situacao.tom}>{situacao.texto}</Selo>
              {concluida ? null : (
                <SeloSituacaoPrazo
                  situacao={situacaoDoPrazo({
                    tipo: 'ocorrencia',
                    dias,
                    emConferencia: ocorrencia.situacao === 'em_conferencia',
                  })}
                />
              )}
            </div>
            <h2 id="titulo-agora" className="sr-only">
              Próxima ação
            </h2>
            <p className="titulo-painel text-pretty text-(--tinta)">
              {pronto ? proximaAcao(exibida, etapas) : '…'}
            </p>
            {detalhe ? <p className="corpo text-pretty text-(--tinta-2)">{detalhe}</p> : null}
          </div>
        </div>
        {principal || secundaria || menu ? (
          <div className="flex flex-wrap items-center gap-(--e-2) max-md:[&>button:not([aria-haspopup])]:flex-1">
            {principal}
            {secundaria}
            <BotaoMais
              itens={[
                {
                  rotulo: 'Concluir sem evidência',
                  oculto: !menu,
                  aoEscolher: () => {
                    setDialogo('sem_evidencia')
                  },
                },
              ]}
            />
          </div>
        ) : null}
      </div>

      {executar.isError && !dialogo ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(executar.error)}
        </MensagemSecao>
      ) : null}

      <Dialogo
        aberto={dialogo !== null}
        aoMudar={(estaAberto) => {
          if (!estaAberto) {
            setDialogo(null)
            setErroTexto(null)
            executar.reset()
          }
        }}
        titulo={aberto?.titulo ?? ''}
        descricao={aberto?.descricao}
        acoes={
          <>
            <Botao
              onClick={() => {
                setDialogo(null)
                setErroTexto(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia={dialogo === 'devolver' ? 'perigo' : 'primario'}
              disabled={ocupado}
              onClick={() => {
                if (!dialogo || !aberto) return
                if (!texto.trim()) {
                  setErroTexto(aberto.vazio)
                  return
                }
                executar.mutate({ tipo: dialogo, texto })
              }}
            >
              {aberto?.botao}
            </Botao>
          </>
        }
      >
        {executar.isError && dialogo ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(executar.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo={aberto?.campo ?? ''}
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
