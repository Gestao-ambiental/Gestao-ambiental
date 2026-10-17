/** Até duas iniciais em maiúsculas ("Metalúrgica Rio Cubatão" → "MR"). */
export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()
}
