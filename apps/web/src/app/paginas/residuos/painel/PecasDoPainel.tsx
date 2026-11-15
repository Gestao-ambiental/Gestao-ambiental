// Filtro de empreendimento e paginação da conferência e do painel de resíduos.

import { useQuery } from '@tanstack/react-query'

import { BotaoIcone } from '@/components/ui/botao-icone'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'

import { classeSelect } from './comum'

export function FiltroEmpreendimento({
  consultoriaId,
  valor,
  aoMudar,
  rotuloTodos,
}: {
  consultoriaId: string
  valor: string | null
  aoMudar: (id: string | null) => void
  rotuloTodos: string
}) {
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', consultoriaId, '', 'filtro'],
    queryFn: () => listarEmpreendimentos(consultoriaId, '', 0),
  })
  return (
    <label className="flex min-w-0 flex-col gap-(--space-050)">
      <span className="rotulo">Empreendimento</span>
      <select
        className={classeSelect}
        value={valor ?? ''}
        onChange={(evento) => {
          aoMudar(evento.target.value || null)
        }}
      >
        <option value="">{rotuloTodos}</option>
        {(empreendimentos.data?.itens ?? []).map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Paginacao({
  pagina,
  tamanho,
  total,
  aoMudar,
}: {
  pagina: number
  tamanho: number
  total: number
  aoMudar: (pagina: number) => void
}) {
  if (total <= tamanho) return null
  const inicio = pagina * tamanho
  const fim = Math.min(total, inicio + tamanho)
  return (
    <div className="flex items-center gap-(--space-100) border-t px-(--space-150) py-(--space-100)">
      <span className="flex-1 corpo text-(--text)" aria-live="polite">
        {inicio + 1}–{fim} de {total}
      </span>
      <BotaoIcone
        icone="chevron-left"
        rotulo="Página anterior"
        disabled={pagina === 0}
        onClick={() => {
          aoMudar(Math.max(0, pagina - 1))
        }}
      />
      <BotaoIcone
        icone="chevron-right"
        rotulo="Próxima página"
        disabled={fim >= total}
        onClick={() => {
          aoMudar(pagina + 1)
        }}
      />
    </div>
  )
}
