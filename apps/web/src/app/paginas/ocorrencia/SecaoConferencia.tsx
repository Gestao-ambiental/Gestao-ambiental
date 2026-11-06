import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirEvidencia, type Evidencia, type Ocorrencia } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

import { podeConferirPorPapel } from './apoio'

/**
 * Conferência (DEM-03), da visão do conferente (fora do desenho da Tela 16 v2, que é de quem
 * executa): aprovar ou devolver com motivo. Com a independência, quem enviou não confere. A tela
 * só explica; o banco recusa o resto.
 */
export function SecaoConferencia({
  ocorrencia,
  ultima,
  membroId,
  ehGestao,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  ultima: Evidencia | undefined
  membroId: string
  ehGestao: boolean
  aoMudar: () => Promise<void>
}) {
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const conferir = useMutation({
    mutationFn: ({ decisao, texto }: { decisao: 'aprovada' | 'devolvida'; texto: string }) => {
      if (!ultima) throw new Error('sem evidência')
      return conferirEvidencia(ultima.id, decisao, texto)
    },
    onSuccess: async () => {
      setDevolvendo(false)
      setMotivo('')
      await aoMudar()
    },
  })

  const aguardando =
    ocorrencia.situacao === 'em_conferencia' && ultima?.situacao === 'em_conferencia'
  if (!aguardando || !podeConferirPorPapel(ocorrencia, membroId, ehGestao)) return null
  const enviei = ultima.enviadaPorId === membroId
  if (ocorrencia.conferenciaIndependente && enviei) {
    return (
      <MensagemSecao tom="atencao">
        Você enviou esta evidência. Outra pessoa precisa conferir.
      </MensagemSecao>
    )
  }

  return (
    <section aria-labelledby="titulo-conferencia" className="flex flex-col gap-(--space-150)">
      <h2 id="titulo-conferencia" className="titulo-secao">
        Conferência
      </h2>
      {conferir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(conferir.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap gap-(--space-100)">
        <Botao
          aparencia="primario"
          iconeAntes="check"
          disabled={conferir.isPending}
          onClick={() => {
            conferir.mutate({ decisao: 'aprovada', texto: '' })
          }}
        >
          Aprovar
        </Botao>
        <Botao
          disabled={conferir.isPending}
          onClick={() => {
            setDevolvendo(true)
          }}
        >
          Devolver para correção
        </Botao>
      </div>
      <Dialogo
        aberto={devolvendo}
        aoMudar={setDevolvendo}
        titulo="Devolver para correção"
        descricao="A evidência volta para quem enviou corrigir. O motivo aparece para a pessoa e fica na atividade."
        acoes={
          <>
            <Botao
              onClick={() => {
                setDevolvendo(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={conferir.isPending}
              onClick={() => {
                if (!motivo.trim()) {
                  setErroMotivo('Informe o motivo')
                  return
                }
                conferir.mutate({ decisao: 'devolvida', texto: motivo })
              }}
            >
              Devolver
            </Botao>
          </>
        }
      >
        <CampoTexto
          rotulo="Motivo"
          value={motivo}
          erro={erroMotivo ?? undefined}
          onChange={(evento) => {
            setMotivo(evento.target.value)
            setErroMotivo(null)
          }}
        />
      </Dialogo>
    </section>
  )
}
