// Peças comuns à conferência CDF x MTR e ao painel de resíduos (fase 1, protótipo para revisão).

import { useSearchParams } from 'react-router'

export const classeSelect =
  'h-(--controle) w-full min-w-0 rounded-(--raio) border border-(--campo-borda) border-b-(--campo-borda) bg-(--campo) px-(--e-2) corpo text-(--tinta) outline-none focus:border-b-(--campo-borda-ativa) focus:shadow-[inset_0_-1px_0_0_var(--campo-borda-ativa)] sm:w-auto sm:max-w-[260px]'
export const classeCabecalho =
  'h-10 border-b px-(--e-2) text-left rotulo whitespace-nowrap first:pl-(--e-3)'
export const classeCelula = 'h-10 border-b px-(--e-2) align-middle first:pl-(--e-3)'

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
