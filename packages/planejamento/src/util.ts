/** Elemento de uma lista por índice; índice fora da lista é erro de programação, não de entrada. */
export function em<T>(lista: readonly T[], indice: number): T {
  const valor = lista[indice]
  if (valor === undefined) throw new Error(`Índice fora da lista: ${String(indice)}`)
  return valor
}

/** Tolerância para comparar somas de horas em ponto flutuante. */
export const EPS = 1e-9

/** Arredonda horas e razões para a saída (6 casas). */
export function arredondar(valor: number): number {
  return Math.round(valor * 1e6) / 1e6
}
