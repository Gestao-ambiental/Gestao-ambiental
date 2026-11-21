// Classificação do ato publicado (catálogo de normas, ADR-0050): pela ementa (ou pelo texto), diz se
// o ato altera, revoga ou regulamenta outras normas, ou se é uma norma nova, e quais normas atinge.

import { lerTodosOsIdentificadores } from './norma'
import type { IdentificadorDeNorma } from './norma'

export type AcaoDoAto = 'altera' | 'revoga' | 'regulamenta' | 'nova'

export interface ClassificacaoDoAto {
  acao: AcaoDoAto
  /** Normas atingidas: as citadas a partir do primeiro verbo. Vazio quando o ato é norma nova. */
  alvos: IdentificadorDeNorma[]
}

// Palavra inteira: "altera" não pega "alterações", "inclui" não pega "incluído".
const FIM = '(?![\\p{L}\\p{N}])'
const INICIO = '(?<![\\p{L}\\p{N}])'

const ALTERA = new RegExp(
  `${INICIO}(?:alter(?:a|am)|acrescent(?:a|am)|inclu(?:i|em)|d(?:[áa]|[ãa]o)\\s+nova\\s+reda[çc][ãa]o)${FIM}`,
  'iu',
)
const REVOGA = new RegExp(
  `${INICIO}(?:revog(?:a|am)(?:-se)?|fica(?:m)?\\s+revogad[oa]s?)${FIM}`,
  'iu',
)
const REGULAMENTA = new RegExp(`${INICIO}regulament(?:a|am)${FIM}`, 'iu')

// Cláusula de praxe que não revoga nenhuma norma identificada.
const DISPOSICOES_EM_CONTRARIO =
  /(?:ficam\s+)?revoga(?:m-se|das)\s+as\s+disposi[çc][õo]es\s+em\s+contr[áa]rio/giu

/**
 * Classifica o ato. Prioridade: altera, revoga, regulamenta, nova. Ato que altera uma norma e revoga
 * trechos dela (ou de outra) vale como "altera": as normas atingidas continuam vigentes, com nova
 * redação, e a revogação de dispositivos aparece na comparação de versões. Os alvos são as normas
 * citadas a partir do primeiro verbo reconhecido, o que deixa de fora o próprio ato quando a ementa
 * começa pela identificação dele ("Portaria IMA 096/2026 – Revoga a ...").
 */
export function classificarAto(ementaOuTexto: string): ClassificacaoDoAto {
  const texto = ementaOuTexto.replace(DISPOSICOES_EM_CONTRARIO, ' ')
  const verbos: [AcaoDoAto, RegExpExecArray | null][] = [
    ['altera', ALTERA.exec(texto)],
    ['revoga', REVOGA.exec(texto)],
    ['regulamenta', REGULAMENTA.exec(texto)],
  ]
  const achados = verbos.filter((v): v is [AcaoDoAto, RegExpExecArray] => v[1] !== null)
  const principal = achados[0]
  if (principal === undefined) return { acao: 'nova', alvos: [] }

  const inicio = Math.min(...achados.map(([, achado]) => achado.index))
  return { acao: principal[0], alvos: lerTodosOsIdentificadores(texto.slice(inicio)) }
}
