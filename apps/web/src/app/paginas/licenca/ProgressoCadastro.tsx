import { cn } from '@/lib/utils'

import { PASSOS } from './passos'

/**
 * Linha de progresso do cadastro de um rascunho: um ponto por passo, ligados por traço; os
 * concluídos e o atual preenchidos, os seguintes vazados; ao lado, o nome do passo atual. O texto
 * acessível diz o passo por extenso, sem depender da cor.
 */
export function ProgressoCadastro({ passo }: { passo: number }) {
  const atual = PASSOS[passo] ?? PASSOS[0]
  return (
    <span className="inline-flex items-center gap-(--space-100)">
      <span aria-hidden="true" className="inline-flex items-center">
        {PASSOS.map((item, indice) => (
          <span key={item.chave} className="inline-flex items-center">
            {indice > 0 ? (
              <span
                className={cn(
                  'h-0.5 w-3',
                  indice <= passo ? 'bg-(--brand)' : 'bg-(--border-strong)',
                )}
              />
            ) : null}
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full border-2',
                indice < passo && 'border-(--brand) bg-(--brand)',
                indice === passo && 'border-(--brand) bg-(--surface)',
                indice > passo && 'border-(--border-strong) bg-(--surface)',
              )}
            />
          </span>
        ))}
      </span>
      <span className="text-xs whitespace-nowrap text-(--text)" aria-hidden="true">
        {atual.rotulo}
      </span>
      <span className="sr-only">
        Rascunho no passo {passo + 1} de {PASSOS.length}: {atual.rotulo}
      </span>
    </span>
  )
}
