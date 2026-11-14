// Visita técnica e deslocamento (decisão do Eduardo, 13/11/2026). A consultoria escolhe um modo:
// "visita" cobra só o valor fixo da visita (o km não entra); "km" cobra só o km rodado (o valor da
// visita não entra). O valor do km sai do combustível: preço do litro ÷ consumo do carro, mais um
// acréscimo por km opcional. O banco calcula igual (private.valor_do_km).

import { dividirArredondando, PRECO_MAXIMO_CENTAVOS } from './orcamento'

/** Como a consultoria cobra a visita técnica. */
export type ModoDeDeslocamento = 'visita' | 'km'

export const MODOS_DE_DESLOCAMENTO: readonly ModoDeDeslocamento[] = ['visita', 'km']

/** Consumo do carro em km por litro: até 999,99, com até duas casas (numeric(5,2) no banco). */
export const CONSUMO_MAXIMO_KM_POR_LITRO = 999.99

/**
 * O modo da base. Bases antigas, sem modo, ficam com "km" quando só o km tem valor; senão, "visita".
 */
export function modoDeDeslocamento(base: {
  deslocamentoModo?: ModoDeDeslocamento | null
  valorVisitaCentavos: number
  custoKmCentavos: number
}): ModoDeDeslocamento {
  if (base.deslocamentoModo) return base.deslocamentoModo
  return base.custoKmCentavos > 0 && base.valorVisitaCentavos === 0 ? 'km' : 'visita'
}

export interface CombustivelDoKm {
  /** Preço do litro do combustível, em centavos. */
  precoCombustivelCentavos: number | null
  /** Consumo do carro, em km por litro (até duas casas: 12,5). */
  consumoKmPorLitro: number | null
  /** Acréscimo por km, em centavos; nulo = sem acréscimo. */
  acrescimoKmCentavos: number | null
}

/** Consumo em centésimos (12,5 → 1250); `null` se não for um número de 0,01 a 999,99 com duas casas. */
function consumoEmCentesimos(consumo: number): number | null {
  if (!Number.isFinite(consumo)) return null
  const centesimos = Math.round(consumo * 100)
  if (Math.abs(centesimos - consumo * 100) > 1e-6) return null
  if (centesimos <= 0 || centesimos > Math.round(CONSUMO_MAXIMO_KM_POR_LITRO * 100)) return null
  return centesimos
}

function centavosValidos(valor: number): boolean {
  return Number.isSafeInteger(valor) && valor >= 0 && valor <= PRECO_MAXIMO_CENTAVOS
}

/**
 * Valor do km, em centavos: preço do litro ÷ consumo, arredondado ao centavo (metade para cima),
 * mais o acréscimo. R$ 6,00 ÷ 12 km/l = R$ 0,50. Sem preço e sem consumo, o combustível conta zero
 * (fica só o acréscimo). `null` quando falta só um dos dois ou algum número é inválido.
 */
export function valorDoKm(c: CombustivelDoKm): number | null {
  const acrescimo = c.acrescimoKmCentavos ?? 0
  if (!centavosValidos(acrescimo)) return null
  if (c.precoCombustivelCentavos === null && c.consumoKmPorLitro === null) return acrescimo
  if (c.precoCombustivelCentavos === null || c.consumoKmPorLitro === null) return null
  if (!centavosValidos(c.precoCombustivelCentavos)) return null
  const centesimos = consumoEmCentesimos(c.consumoKmPorLitro)
  if (centesimos === null) return null
  // round(preço × 100 ÷ centésimos), metade para cima, em inteiros (igual ao round() do banco).
  const numerador = BigInt(c.precoCombustivelCentavos) * 100n
  const divisor = BigInt(centesimos)
  const combustivel = dividirArredondando(numerador, divisor)
  const valor = combustivel + acrescimo
  return valor <= PRECO_MAXIMO_CENTAVOS ? valor : null
}
