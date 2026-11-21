// Painel do dono (P8, ADR-0054): ordena os clientes em risco pela gravidade e, no empate, pelo valor
// aprovado; descreve em palavras por que cada um está ali. O banco só conta; a regra mora aqui.

export interface ContagensDeRisco {
  prazosAtrasados: number
  laoAlemDoLimite: number
  laoPertoDoLimite: number
  vencimentosVencidos: number
  receberVencidoCentavos: number
  aprovadoCentavos: number
}

export interface ClienteEmRisco extends ContagensDeRisco {
  chave: string
  nome: string
}

/**
 * Peso de cada critério: o que já passou do prazo pesa mais que o que está chegando, e o dinheiro
 * atrasado pesa menos que o risco ambiental (a licença do cliente vem antes da cobrança).
 */
export const PESOS_DO_RISCO = {
  laoAlemDoLimite: 5,
  prazosAtrasados: 4,
  vencimentosVencidos: 3,
  laoPertoDoLimite: 2,
  receberVencido: 1,
} as const

/** Gravidade: soma dos pesos dos critérios presentes (cada critério conta uma vez). */
export function gravidadeDoRisco(c: ContagensDeRisco): number {
  return (
    (c.laoAlemDoLimite > 0 ? PESOS_DO_RISCO.laoAlemDoLimite : 0) +
    (c.prazosAtrasados > 0 ? PESOS_DO_RISCO.prazosAtrasados : 0) +
    (c.vencimentosVencidos > 0 ? PESOS_DO_RISCO.vencimentosVencidos : 0) +
    (c.laoPertoDoLimite > 0 ? PESOS_DO_RISCO.laoPertoDoLimite : 0) +
    (c.receberVencidoCentavos > 0 ? PESOS_DO_RISCO.receberVencido : 0)
  )
}

/** Mais grave primeiro; no empate, maior valor aprovado; depois o nome. Não altera a lista. */
export function ordenarClientesEmRisco<T extends ClienteEmRisco>(lista: readonly T[]): T[] {
  return [...lista]
    .filter((c) => gravidadeDoRisco(c) > 0)
    .sort(
      (a, b) =>
        gravidadeDoRisco(b) - gravidadeDoRisco(a) ||
        b.aprovadoCentavos - a.aprovadoCentavos ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )
}

function contar(n: number, singular: string, plural: string): string {
  return `${String(n)} ${n === 1 ? singular : plural}`
}

/** Motivos em palavras, na ordem da gravidade (o valor a receber vem formatado de fora). */
export function motivosDoRisco(c: ContagensDeRisco, receberVencido: string): string[] {
  const motivos: string[] = []
  if (c.laoAlemDoLimite > 0) {
    motivos.push(
      `${contar(c.laoAlemDoLimite, 'LAO passou', 'LAOs passaram')} do limite de protocolo`,
    )
  }
  if (c.prazosAtrasados > 0) motivos.push(contar(c.prazosAtrasados, 'atrasado', 'atrasados'))
  if (c.vencimentosVencidos > 0) {
    motivos.push(contar(c.vencimentosVencidos, 'vencimento vencido', 'vencimentos vencidos'))
  }
  if (c.laoPertoDoLimite > 0) {
    motivos.push(`${contar(c.laoPertoDoLimite, 'LAO perto', 'LAOs perto')} do limite de protocolo`)
  }
  if (c.receberVencidoCentavos > 0) motivos.push(`${receberVencido} a receber vencido`)
  return motivos
}
