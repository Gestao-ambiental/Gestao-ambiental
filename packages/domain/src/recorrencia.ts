// Recorrência de condicionantes. Portado de dist/domain.js do protótipo
// (occurrences, suggestedFirstOccurrence, dependencyDateSuggestions).

import { adicionarDias, adicionarMeses, ehDataCivil, type DataCivil } from './data-civil'

/** Limite de segurança: uma série maior que isso indica erro de cadastro. */
export const MAXIMO_OCORRENCIAS = 1200

/**
 * Datas de entrega de uma condicionante periódica: a partir da data base, a cada `meses`,
 * até a validade (inclusive). Cada data é calculada a partir da base (base + i × meses), e não da
 * anterior, por isso o fim de mês não "deriva": 31/01 mensal dá 29/02, 31/03, 30/04.
 * Protótipo: `occurrences(base, expiry, months)`.
 */
export function ocorrencias(base: DataCivil, validade: DataCivil, meses: number): DataCivil[] {
  if (
    !ehDataCivil(base) ||
    !ehDataCivil(validade) ||
    base > validade ||
    !Number.isInteger(meses) ||
    meses < 1
  )
    throw new Error('Confira a data base, a validade e a periodicidade.')
  const datas: DataCivil[] = []
  for (let i = 0; i <= MAXIMO_OCORRENCIAS; i++) {
    const data = adicionarMeses(base, i * meses)
    if (data > validade) return datas
    datas.push(data)
  }
  throw new Error('Mais de 1.200 ocorrências: revisão necessária.')
}

/** Periodicidades com intervalo em meses. Protótipo: annual, semiannual, quarterly, monthly. */
export const MESES_POR_PERIODICIDADE = {
  anual: 12,
  semestral: 6,
  trimestral: 3,
  mensal: 1,
} as const

/** Protótipo: annual | semiannual | quarterly | monthly | once | continuous. */
export type Periodicidade = keyof typeof MESES_POR_PERIODICIDADE | 'unica' | 'continua'

/**
 * Primeira entrega sugerida para uma condicionante periódica: um intervalo depois da assinatura
 * (anual sugere o primeiro aniversário). Devolve `null` se a periodicidade não for de ciclo, se não
 * houver assinatura ou se a sugestão passar da validade.
 * Protótipo: `suggestedFirstOccurrence(type, signed, expiry)`, que devolvia "" em vez de null.
 */
export function primeiraOcorrenciaSugerida(
  periodicidade: Periodicidade,
  assinatura: DataCivil | null | undefined,
  validade?: DataCivil | null,
): DataCivil | null {
  const meses =
    periodicidade in MESES_POR_PERIODICIDADE
      ? MESES_POR_PERIODICIDADE[periodicidade as keyof typeof MESES_POR_PERIODICIDADE]
      : undefined
  if (!meses || !assinatura) return null
  const sugerida = adicionarMeses(assinatura, meses)
  return validade && sugerida > validade ? null : sugerida
}

/**
 * Dependência com prazo mínimo entre execuções (DEM-07): dadas a data da condicionante de origem e a
 * da dependente, sugere a data mais cedo da dependente e a mais tarde da origem.
 * Protótipo: `dependencyDateSuggestions(cleaningDate, analysisDate, minimumDays)`, com
 * origem = cleaning (limpeza) e dependente = analysis (análise).
 */
export function sugerirDatasDeDependencia(
  dataOrigem: DataCivil,
  dataDependente: DataCivil,
  diasMinimos = 90,
): { dependente: DataCivil; origem: DataCivil } {
  if (
    !ehDataCivil(dataOrigem) ||
    !ehDataCivil(dataDependente) ||
    !Number.isInteger(diasMinimos) ||
    diasMinimos < 1
  )
    throw new Error('Informe as duas datas e um intervalo válido.')
  return {
    dependente: adicionarDias(dataOrigem, diasMinimos),
    origem: adicionarDias(dataDependente, -diasMinimos),
  }
}
