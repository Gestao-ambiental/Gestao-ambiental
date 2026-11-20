// Renovação de LAO vira orçamento (ADR-0044): horizonte do radar, objeto do rascunho, "é o IMA" e a
// taxa sugerida da renovação (ADR-0042: fase LAO da classe, Decreto 421/2023).
//
// O horizonte espelha o filtro de listar_renovacoes (validade <= hoje + meses, com a soma de meses
// do calendário). A taxa é sugestão editável: o banco grava o valor que a Gestão revê.

import { CATALOGO_CONSEMA_250 } from './catalogo-consema-250'
import { adicionarMeses, type DataCivil } from './data-civil'
import { calcularTaxaDoIma } from './taxa-do-ima'
import {
  enquadrarAtividade,
  type CatalogoDeAtividades,
  type Medidas,
  type Porte,
} from './triagem-licenciamento'

export const HORIZONTES_DA_RENOVACAO = [3, 6, 12] as const
export type HorizonteDaRenovacao = (typeof HORIZONTES_DA_RENOVACAO)[number]
export const HORIZONTE_PADRAO_DA_RENOVACAO: HorizonteDaRenovacao = 6

export function ehHorizonteDaRenovacao(valor: unknown): valor is HorizonteDaRenovacao {
  return HORIZONTES_DA_RENOVACAO.some((h) => h === valor)
}

/** Último dia do horizonte (espelho do SQL): adicionarMeses(hoje, meses). 31/08 + 6 = 28/02 (29/02). */
export function fimDoHorizonte(hoje: DataCivil, meses: number): DataCivil {
  return adicionarMeses(hoje, meses)
}

/** validade <= fimDoHorizonte(hoje, meses); vencidas entram. */
export function dentroDoHorizonte(validade: DataCivil, hoje: DataCivil, meses: number): boolean {
  return validade <= fimDoHorizonte(hoje, meses)
}

/** "Renovação da LAO 4821/2023"; licença nula/vazia → "Renovação da LAO" (espelho do objeto do banco). */
export function objetoDaRenovacao(licenca: string | null): string {
  const nome = (licenca ?? '').replace(/\s+/g, ' ').trim()
  return `Renovação da ${nome || 'LAO'}`
}

function normalizarOrgao(orgao: string): string {
  return orgao
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[-/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sem acento, maiúsculas, sem pontuação (- / .), espaços colapsados: "IMA", "IMA SC" ou começa com
 * "INSTITUTO DO MEIO AMBIENTE". FATMA não.
 */
export function orgaoEhIma(orgao: string | null | undefined): boolean {
  if (!orgao) return false
  const nome = normalizarOrgao(orgao)
  return nome === 'IMA' || nome === 'IMA SC' || nome.startsWith('INSTITUTO DO MEIO AMBIENTE')
}

export interface AtividadeDaLicenca {
  codigo: string
  porte: Porte
  medidas: Medidas
}

/** Valor da fase LAO de uma atividade gravada, ou nulo quando ela não tem valor de licença. */
function centavosDaLao(gravada: AtividadeDaLicenca, catalogo: CatalogoDeAtividades): number | null {
  const atividade = catalogo.atividades.find((a) => a.codigo === gravada.codigo)
  if (!atividade) return null
  const enquadramento = enquadrarAtividade(atividade, gravada.medidas)
  const faixa =
    enquadramento.tipo === 'enquadrada'
      ? enquadramento.faixa
      : atividade.faixas.find((f) => f.porte === gravada.porte)
  if (!faixa) return null
  const taxa = calcularTaxaDoIma(atividade, faixa, gravada.medidas)
  if (taxa.tipo !== 'licencas') return null
  return taxa.fases.find((f) => f.fase === 'LAO')?.centavos ?? null
}

/**
 * ADR-0042/0044: maior valor da fase LAO entre as atividades; null se o órgão não é o IMA, se não
 * há atividade ou se nenhuma tem valor. Centavos inteiros.
 */
export function taxaSugeridaDaRenovacao(
  orgao: string | null,
  atividades: readonly AtividadeDaLicenca[],
  catalogo: CatalogoDeAtividades = CATALOGO_CONSEMA_250,
): number | null {
  if (!orgaoEhIma(orgao)) return null
  let maior: number | null = null
  for (const gravada of atividades) {
    const centavos = centavosDaLao(gravada, catalogo)
    if (centavos !== null && (maior === null || centavos > maior)) maior = centavos
  }
  return maior
}
