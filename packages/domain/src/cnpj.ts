// CNPJ do empreendimento (EMP-01): opcional, só formato (consulta externa fora de escopo).
// Aceita o CNPJ alfanumérico da Receita (12 letras ou dígitos + 2 dígitos verificadores) e o
// numérico de sempre. O banco aplica a mesma regra (private.normalizar_cnpj e o check da tabela).

const TAMANHO = 14

/** Só letras maiúsculas e dígitos, no máximo 14. "12.345.678/0001-90" → "12345678000190". */
export function normalizarCnpj(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, TAMANHO)
}

/**
 * Máscara enquanto a pessoa digita: 00.000.000/0000-00, com o que já houver. As duas últimas
 * posições (dígitos verificadores) só aceitam número.
 */
export function mascararCnpj(texto: string): string {
  const base = normalizarCnpj(texto)
  const corpo = base.slice(0, 12)
  const verificador = base.slice(12).replace(/[^0-9]/g, '')
  const valor = corpo + (corpo.length === 12 ? verificador : '')
  const partes = [
    valor.slice(0, 2),
    valor.slice(2, 5),
    valor.slice(5, 8),
    valor.slice(8, 12),
    valor.slice(12, 14),
  ]
  let saida = partes[0] ?? ''
  if (partes[1]) saida += `.${partes[1]}`
  if (partes[2]) saida += `.${partes[2]}`
  if (partes[3]) saida += `/${partes[3]}`
  if (partes[4]) saida += `-${partes[4]}`
  return saida
}

/** Situação do campo: vazio (permitido), completo ou incompleto ("CNPJ incompleto", Protótipo 08). */
export function situacaoDoCnpj(texto: string): 'vazio' | 'completo' | 'incompleto' {
  const valor = normalizarCnpj(texto)
  if (valor === '') return 'vazio'
  return /^[0-9A-Z]{12}[0-9]{2}$/.test(valor) ? 'completo' : 'incompleto'
}

/** Exibição de um CNPJ gravado (14 caracteres) com a máscara. */
export function formatarCnpj(cnpj: string | null | undefined): string {
  return cnpj ? mascararCnpj(cnpj) : ''
}
