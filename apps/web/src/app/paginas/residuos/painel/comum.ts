// Peças comuns à conferência CDF x MTR e ao painel de resíduos (fase 1, protótipo para revisão).

import { useSearchParams } from 'react-router'

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
