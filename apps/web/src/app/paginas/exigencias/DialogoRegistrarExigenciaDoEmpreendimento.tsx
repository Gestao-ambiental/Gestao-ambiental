import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import type { PropsDoDialogoDaAcao } from '@/app/paginas/empreendimentos/acoes-do-empreendimento'

import { atualizarDepoisDeMudarExigencia } from './cache'
import { DialogoExigencia } from './DialogoExigencia'

/** "Registrar exigência" no "…" do Empreendimento: o empreendimento e as unidades já vêm dados. */
export function DialogoRegistrarExigenciaDoEmpreendimento({
  empreendimento,
  unidades,
  aberto,
  aoMudar,
}: PropsDoDialogoDaAcao) {
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  // Montado só aberto: cada abertura gera ids novos (o retry da mesma abertura não duplica).
  if (!aberto) return null
  return (
    <DialogoExigencia
      modo={{
        tipo: 'novo',
        empreendimento: { id: empreendimento.id, nome: empreendimento.nome },
        unidades,
      }}
      aoFechar={() => {
        aoMudar(false)
      }}
      aoSalvar={async (id) => {
        aoMudar(false)
        await atualizarDepoisDeMudarExigencia(queryClient)
        void navegar(`/exigencias/${id}`)
      }}
    />
  )
}
