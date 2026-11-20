// Aviso "Sair sem salvar?" (editor do orçamento, Primeiros passos, checklist do Campo): com
// alteração não salva, sair para outra página pede confirmação e fechar a aba pede a confirmação do
// navegador. Trocar de etapa fica na mesma página e não pergunta.

import { useEffect } from 'react'
import { useBlocker } from 'react-router'

import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'

export function AvisoDeSaida({
  bloquear,
  sujo,
  descricao,
}: {
  /** Lida na hora de sair: há alteração não salva? */
  bloquear: () => boolean
  /** Liga o aviso do navegador ao fechar a aba. */
  sujo: boolean
  descricao: string
}) {
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      bloquear() && currentLocation.pathname !== nextLocation.pathname,
  )
  // Saída barrada por uma gravação ainda em curso: se ela termina bem, a saída segue sem perguntar.
  useEffect(() => {
    if (bloqueio.state === 'blocked' && !sujo) bloqueio.proceed()
  }, [bloqueio, sujo])
  useEffect(() => {
    if (!sujo) return
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
    }
    window.addEventListener('beforeunload', avisar)
    return () => {
      window.removeEventListener('beforeunload', avisar)
    }
  }, [sujo])

  return (
    <Dialogo
      aberto={bloqueio.state === 'blocked'}
      aoMudar={(aberto) => {
        if (!aberto && bloqueio.state === 'blocked') bloqueio.reset()
      }}
      titulo="Sair sem salvar?"
      descricao={descricao}
      acoes={
        <>
          <Botao
            onClick={() => {
              if (bloqueio.state === 'blocked') bloqueio.reset()
            }}
          >
            Continuar aqui
          </Botao>
          <Botao
            aparencia="perigo"
            onClick={() => {
              if (bloqueio.state === 'blocked') bloqueio.proceed()
            }}
          >
            Sair sem salvar
          </Botao>
        </>
      }
    />
  )
}
