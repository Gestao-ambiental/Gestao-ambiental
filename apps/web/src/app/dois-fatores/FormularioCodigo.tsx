import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { confirmarCodigo } from '@/lib/api/dois-fatores'
import { mensagemDoErro } from '@/lib/erros'

interface Props {
  fatorId: string
  /** Texto do botão de enviar. */
  rotuloBotao?: string
  /** Chamado depois que o Auth aceitou o código (a sessão já é aal2). */
  aoConfirmar: () => void
  /** Botão ao lado do enviar (ex.: Cancelar). */
  secundario?: ReactNode
}

/** Campo do código de 6 dígitos do aplicativo autenticador e o envio (challenge + verify). */
export function FormularioCodigo({
  fatorId,
  rotuloBotao = 'Confirmar',
  aoConfirmar,
  secundario,
}: Props) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const confirmar = useMutation({
    mutationFn: (valor: string) => confirmarCodigo(fatorId, valor),
    onSuccess: aoConfirmar,
    onError: () => {
      setCodigo('')
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-(--space-150)"
      onSubmit={(evento) => {
        evento.preventDefault()
        const limpo = codigo.replace(/\s/g, '')
        if (!/^\d{6}$/.test(limpo)) {
          setErro('Informe os 6 dígitos')
          return
        }
        setErro(null)
        confirmar.mutate(limpo)
      }}
    >
      {confirmar.error ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(confirmar.error)}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Código de 6 dígitos"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={codigo}
        erro={erro ?? undefined}
        className="max-w-48"
        onChange={(evento) => {
          setCodigo(evento.target.value)
        }}
      />
      <div className="flex flex-wrap items-center gap-(--space-100)">
        <Botao type="submit" aparencia="primario" disabled={confirmar.isPending}>
          {confirmar.isPending ? 'Confirmando…' : rotuloBotao}
        </Botao>
        {secundario}
      </div>
    </form>
  )
}
