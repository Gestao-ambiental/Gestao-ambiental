// Triagem vira orçamento (ADR-0056): da conclusão da triagem, "Orçar" abre um rascunho com os
// valores que a consultoria guardou para a modalidade e a taxa do órgão como repasse. Aqui fica o
// mapeamento modalidade → licenças do pacote, o objeto, o nome dos valores e a despesa da taxa.
import { FONTE_DA_TAXA_IMA } from './taxa-do-ima'
import { ROTULO_DA_MODALIDADE, type Modalidade } from './triagem-licenciamento'

/** Licenças que o pacote da modalidade cobre, na ordem do licenciamento. */
export const LICENCAS_DA_MODALIDADE: Readonly<Record<Modalidade, readonly string[]>> = {
  trifasica: ['LAP', 'LAI', 'LAO'],
  AuA: ['AuA'],
  LAO: ['LAO'],
}

export const MODALIDADES: readonly Modalidade[] = ['trifasica', 'AuA', 'LAO']

export function ehModalidade(valor: unknown): valor is Modalidade {
  return typeof valor === 'string' && (MODALIDADES as readonly string[]).includes(valor)
}

/** "Licenciamento trifásico (LAP, LAI e LAO) · Cerâmica Itaum". */
export function objetoDoOrcamentoDaTriagem(
  modalidade: Modalidade,
  empreendimento: string | null,
): string {
  const nome = empreendimento?.trim()
  return nome ? `${ROTULO_DA_MODALIDADE[modalidade]} · ${nome}` : ROTULO_DA_MODALIDADE[modalidade]
}

/** Nome do modelo que guarda os valores da modalidade. */
export function nomeDosValoresDaModalidade(modalidade: Modalidade): string {
  return `Valores · ${ROTULO_DA_MODALIDADE[modalidade]}`
}

export interface TaxaDaAtividade {
  codigo: string
  centavos: number
}

export interface DespesaDaTaxa {
  descricao: string
  /** Nulo = a cotar (nunca zero). */
  estimativaCentavos: number | null
}

/**
 * A taxa do órgão vira despesa de repasse (paga direto pelo cliente). No IMA, uma licença cobre o
 * empreendimento: vale a maior taxa entre as atividades (como na renovação, ADR-0044). Sem valor
 * calculado, a cotar. No município, a taxa é dele e fica a cotar.
 */
export function despesaDaTaxa(
  orgao: 'estadual' | 'municipal' | null,
  taxas: readonly TaxaDaAtividade[],
): DespesaDaTaxa | null {
  if (orgao === 'municipal') return { descricao: 'Taxa do município', estimativaCentavos: null }
  if (orgao !== 'estadual') return null
  const maior = taxas.reduce<number | null>(
    (atual, t) => (atual === null || t.centavos > atual ? t.centavos : atual),
    null,
  )
  return { descricao: `Taxa do IMA (${FONTE_DA_TAXA_IMA})`, estimativaCentavos: maior }
}
