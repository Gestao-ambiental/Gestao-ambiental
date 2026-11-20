import { cn } from '@/lib/utils'

/**
 * Coluna "Faltam" do quadro de partidas: quantos dias faltam (ou passaram) em numeral tabular
 * grande. Hoje vira plaqueta verde-lima; atraso fica em vermelho com sinal de menos. É reforço
 * visual: a situação por extenso está na coluna Situação, então o número fica fora do leitor de
 * tela. O número "vira" ao chegar, como plaqueta de painel (respeita movimento reduzido).
 */
export function Contagem({ dias, ordem = 0 }: { dias: number; ordem?: number }) {
  const atraso = dias < 0
  const hoje = dias === 0
  const valor = Math.abs(dias)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 flex-col items-start leading-none virar-placa',
        hoje ? 'w-auto' : 'w-[56px]',
      )}
      style={{ animationDelay: `${String(Math.min(ordem, 8) * 22)}ms` }}
    >
      {hoje ? (
        <span className="rounded-(--raio-mini) bg-(--sinal) px-(--e-15) py-(--e-1) text-xs font-[850] tracking-[0.06em] text-(--sinal-texto) uppercase">
          hoje
        </span>
      ) : (
        <>
          <span
            className={cn(
              'numero-contagem',
              atraso ? 'text-(--atraso-texto)' : valor <= 7 ? 'text-(--tinta)' : 'text-(--tinta-2)',
            )}
          >
            {atraso ? `−${String(valor)}` : valor}
          </span>
          <span className="mt-(--e-05) text-[11px] font-[700] text-(--tinta-3)">
            {atraso ? 'atraso' : valor === 1 ? 'dia' : 'dias'}
          </span>
        </>
      )}
    </span>
  )
}
