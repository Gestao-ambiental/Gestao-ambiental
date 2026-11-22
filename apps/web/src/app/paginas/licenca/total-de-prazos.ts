/** "1 prazo", "17 prazos". */
export function totalDePrazos(total: number): string {
  return total === 1 ? '1 prazo' : `${total.toLocaleString('pt-BR')} prazos`
}
