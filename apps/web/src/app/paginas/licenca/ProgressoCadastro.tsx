import { PASSOS } from './passos'

/**
 * Onde o rascunho parou, em texto curto ("Parou em Identificação"). O texto acessível diz o passo
 * por extenso ("Rascunho no passo 2 de 5: Identificação").
 */
export function ProgressoCadastro({ passo }: { passo: number }) {
  const atual = PASSOS[passo] ?? PASSOS[0]
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <span className="text-(--tinta-2)" aria-hidden="true">
        Parou em <span className="corpo-medio text-(--tinta)">{atual.rotulo}</span>
      </span>
      <span className="sr-only">
        Rascunho no passo {passo + 1} de {PASSOS.length}: {atual.rotulo}
      </span>
    </span>
  )
}
