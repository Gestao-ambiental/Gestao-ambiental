// Peças comuns à conferência CDF x MTR e ao painel de resíduos (fase 1, protótipo para revisão).

import { useSearchParams } from 'react-router'

export const classeSelect =
  'h-(--size-control) w-full min-w-0 rounded-(--radius) border border-(--border-input) border-b-(--border-input-accessible) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-b-(--border-input-active) focus:shadow-[inset_0_-1px_0_0_var(--border-input-active)] sm:w-auto sm:max-w-[260px]'
export const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'
export const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

/** Empreendimento escolhido, guardado em ?empreendimento= para dar link a partir do empreendimento. */
export function useEmpreendimentoDaUrl(): [string | null, (id: string | null) => void] {
  const [parametros, setParametros] = useSearchParams()
  const atual = parametros.get('empreendimento')
  function mudar(id: string | null) {
    setParametros(
      (antes) => {
        const novos = new URLSearchParams(antes)
        if (id) novos.set('empreendimento', id)
        else novos.delete('empreendimento')
        return novos
      },
      { replace: true },
    )
  }
  return [atual && atual !== '' ? atual : null, mudar]
}
