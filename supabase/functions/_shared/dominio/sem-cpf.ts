// Gerado por scripts/normas/espelhar-dominio-no-edge.mjs a partir de packages/domain/src. Não edite.

// Sem CPF no nosso banco (CLAUDE.md): textos coletados de diários e portais (atos, portarias,
// pareceres) passam por aqui antes de gravar. Troca o CPF, inteiro ou mascarado, por um marcador.
// CNPJ, números de processo e datas ficam como estão.

export const MARCADOR_DE_CPF = '[CPF removido]'

// Dígito ou caractere de máscara (X, *, •).
const D = '[0-9Xx*•]'

// 000.000.000-00, 004.XXX.XXX-61, ***.123.456-**. Não pode estar colado a outro número, ponto ou
// barra (processo "12345.000123/2024-11", CNJ "0001234-56.2024.8.24.0038").
const CPF_FORMATADO = new RegExp(
  `(?<![0-9Xx*•./-])${D}{3}\\.${D}{3}\\.${D}{3}-${D}{2}(?![0-9Xx*•]|[./-][0-9])`,
  'g',
)

// 11 dígitos seguidos, só quando a palavra CPF vem antes ("CPF: 12345678901", "CPF/MF nº ...").
const CPF_SO_DIGITOS = /(CPF(?:\/MF)?\s*(?:n\.?\s*[º°o]\.?|n[º°])?\s*[:\-–]?\s*)\d{11}(?!\d)/giu

/** Troca todo CPF do texto por "[CPF removido]". */
export function removerCpf(texto: string): string {
  return texto
    .replace(CPF_FORMATADO, MARCADOR_DE_CPF)
    .replace(CPF_SO_DIGITOS, `$1${MARCADOR_DE_CPF}`)
}

/** Diz se o texto tem algum CPF, inteiro ou mascarado. */
export function contemCpf(texto: string): boolean {
  return removerCpf(texto) !== texto
}
