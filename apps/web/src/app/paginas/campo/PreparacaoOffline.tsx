import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { listarItensDaVistoria, obterVistoria } from '@/lib/api/vistorias'
import { prepararAplicativo, useConectado } from '@/lib/vistoria-offline/app'
import {
  criarRascunho,
  gravarRascunho,
  lerRascunhos,
  PRAZO_OFFLINE,
} from '@/lib/vistoria-offline/rascunho'

export function PreparacaoOffline({ id }: { id: string }) {
  const { atual, suporte } = useConsultoria()
  const { sessao } = useSessao()
  const conectado = useConectado()
  const navegar = useNavigate()
  const cliente = useQueryClient()
  const usuarioId = sessao?.user.id

  const preparar = useMutation({
    mutationFn: async () => {
      if (!usuarioId || !conectado || suporte)
        throw new Error('Conecte-se para preparar esta vistoria.')
      const [visita, itens] = await Promise.all([obterVistoria(id), listarItensDaVistoria(id)])
      if (
        visita?.consultoriaId !== atual.consultoriaId ||
        !visita.podeRegistrar ||
        itens.length === 0
      ) {
        throw new Error('A vistoria precisa estar aberta e disponível para você.')
      }
      await prepararAplicativo().catch(() => {
        throw new Error(
          'O navegador não conseguiu preparar o Grama offline. Tente novamente com conexão.',
        )
      })
      const rascunhos = await lerRascunhos(usuarioId, atual.consultoriaId)
      const salvo = rascunhos.find((r) => r.visita.id === id)
      if (salvo && salvo.membroId !== atual.membroId) {
        throw new Error('O registro neste aparelho pertence a um vínculo anterior.')
      }
      await gravarRascunho(
        salvo
          ? { ...salvo, acessoAte: Date.now() + PRAZO_OFFLINE }
          : criarRascunho(usuarioId, atual.membroId, visita, itens),
      )
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({
        queryKey: ['campo-offline', usuarioId, atual.consultoriaId],
      })
      await navegar(`/campo/offline/${id}`)
    },
  })

  if (!usuarioId || suporte || !conectado) return null
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Botao
        iconeAntes="download"
        className="min-h-11 self-start"
        disabled={preparar.isPending}
        onClick={() => {
          preparar.mutate()
        }}
      >
        {preparar.isPending ? 'Preparando…' : 'Preparar para usar sem sinal'}
      </Botao>
      <p className="text-xs text-(--text-subtle)">
        Disponível neste aparelho por 24 horas após preparar.
      </p>
      {preparar.isError ? (
        <p role="alert" className="text-(--text-danger)">
          {preparar.error instanceof Error
            ? preparar.error.message
            : 'Não foi possível preparar a vistoria.'}
        </p>
      ) : null}
    </div>
  )
}
