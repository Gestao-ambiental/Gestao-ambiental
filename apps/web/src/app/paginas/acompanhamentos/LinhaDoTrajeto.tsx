import { formatarDataCivil } from '@gestao-ambiental/domain'

import { Icone } from '@/components/ui/icone'
import { cn } from '@/lib/utils'

import type { Estacao } from './trajeto-da-renovacao'

const TRACEJADO_VERTICAL =
  'bg-[repeating-linear-gradient(180deg,var(--regra-forte)_0_6px,transparent_6px_10px)]'
const TRACEJADO_HORIZONTAL =
  'md:bg-[repeating-linear-gradient(90deg,var(--regra-forte)_0_6px,transparent_6px_10px)]'

function dias(n: number): string {
  return n === 1 ? '1 dia' : `${String(n)} dias`
}

/**
 * Linha do tempo da renovação como linha de trajeto, na linguagem da Trilha: estação cheia com
 * visto = já passou, lima com aro = hoje, vazada com linha tracejada = ainda vem. Entre as
 * estações, quantos dias corridos. Horizontal no desktop, vertical no celular.
 */
export function LinhaDoTrajeto({ estacoes }: { estacoes: readonly Estacao[] }) {
  return (
    <ol
      aria-label="Linha do tempo da renovação"
      className="flex flex-col md:grid md:pt-(--e-6)"
      style={{ gridTemplateColumns: `repeat(${String(estacoes.length)}, minmax(0, 1fr))` }}
    >
      {estacoes.map((estacao, indice) => {
        const proxima = estacoes[indice + 1]
        // A linha até a próxima é cheia quando a próxima já chegou (passou ou é hoje).
        const trechoFeito = proxima ? proxima.estado !== 'futuro' : false
        const descricao = [
          estacao.rotulo,
          formatarDataCivil(estacao.data),
          estacao.ehHoje && estacao.chave !== 'hoje' ? 'hoje' : null,
          estacao.estado === 'feito' ? 'já passou' : null,
        ]
          .filter(Boolean)
          .join(', ')
        return (
          <li
            key={estacao.chave}
            aria-current={estacao.estado === 'atual' ? 'step' : undefined}
            className="relative flex gap-(--e-3) pb-(--e-6) last:pb-0 md:flex-col md:items-center md:gap-(--e-2) md:pb-0 md:text-center"
          >
            {proxima ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-7 bottom-0 left-[12.5px] w-[3px]',
                  'md:top-[12.5px] md:bottom-auto md:left-1/2 md:h-[3px] md:w-full',
                  trechoFeito
                    ? 'bg-(--estacao-feita)'
                    : cn(TRACEJADO_VERTICAL, TRACEJADO_HORIZONTAL),
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-(--raio-redondo)',
                estacao.estado === 'atual' &&
                  'bg-(--sinal) text-(--sinal-texto) shadow-[0_0_0_2px_var(--folha),0_0_0_4px_var(--marca-linha)]',
                estacao.estado === 'feito' && 'bg-(--estacao-feita) text-(--folha)',
                estacao.estado === 'futuro' && 'border-2 border-(--regra-forte) bg-(--folha)',
              )}
            >
              {estacao.estado === 'feito' ? <Icone nome="check" tamanho={12} /> : null}
            </span>
            <span className="sr-only">{descricao}</span>
            <span aria-hidden className="flex min-w-0 flex-col gap-(--e-05) md:items-center">
              <span
                className={cn(
                  'text-xs font-[750]',
                  estacao.chave === 'vencimento'
                    ? 'text-(--atraso-texto)'
                    : estacao.estado === 'atual'
                      ? 'text-(--tinta)'
                      : 'text-(--tinta-2)',
                )}
              >
                {estacao.rotulo}
                {estacao.ehHoje && estacao.chave !== 'hoje' ? ' · hoje' : ''}
              </span>
              <span
                className={cn(
                  'corpo-medio numero',
                  estacao.estado === 'futuro' ? 'text-(--tinta-2)' : 'text-(--tinta)',
                  estacao.estado === 'atual' && 'titulo-secao',
                )}
              >
                {formatarDataCivil(estacao.data)}
              </span>
              {estacao.diasAteAProxima !== null ? (
                <span className="text-xs text-(--tinta-3) numero md:hidden">
                  +{dias(estacao.diasAteAProxima)}
                </span>
              ) : null}
            </span>
            {estacao.diasAteAProxima !== null ? (
              <span
                aria-hidden
                className="absolute -top-5 left-full hidden -translate-x-1/2 text-xs whitespace-nowrap text-(--tinta-3) numero md:block"
              >
                {dias(estacao.diasAteAProxima)}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
