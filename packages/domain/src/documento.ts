// Documento de quem paga o plano (ADR-0026): CNPJ ou CPF, validado pelos dígitos verificadores.
// O CPF nunca é gravado: vai do formulário para a Edge Function asaas-assinar e dali para o Asaas.
// A Edge Function repete esta regra (supabase/functions/_shared/documento.ts).

import { normalizarCnpj } from './cnpj'

export type TipoDeDocumento = 'cpf' | 'cnpj'

/** Só dígitos e letras maiúsculas (o CNPJ alfanumérico tem letras), no máximo 14. */
export function normalizarDocumento(texto: string): string {
  return normalizarCnpj(texto)
}

function valorDoCaractere(caractere: string): number {
  // Regra da Receita para o CNPJ alfanumérico: código ASCII menos 48 ("0" = 0, "A" = 17).
  return caractere.charCodeAt(0) - 48
}

/** CPF com 11 dígitos e os dois verificadores certos; recusa sequências repetidas (111.111.111-11). */
export function cpfValido(texto: string): boolean {
  const cpf = texto.replace(/\D/g, '')
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digitos = cpf.split('').map(Number)
  for (const tamanho of [9, 10]) {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += (digitos[i] ?? 0) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    if ((resto === 10 ? 0 : resto) !== digitos[tamanho]) return false
  }
  return true
}

/** CNPJ (numérico ou alfanumérico) com os dois verificadores certos. */
function cnpjValido(texto: string): boolean {
  const cnpj = normalizarCnpj(texto)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const valores = cnpj.split('').map(valorDoCaractere)
  for (const tamanho of [12, 13]) {
    let soma = 0
    let peso = tamanho - 7
    for (let i = 0; i < tamanho; i++) {
      soma += (valores[i] ?? 0) * peso
      peso = peso === 2 ? 9 : peso - 1
    }
    const resto = soma % 11
    if ((resto < 2 ? 0 : 11 - resto) !== valores[tamanho]) return false
  }
  return true
}

/** Tipo do documento válido; nulo quando não é CPF nem CNPJ válido. */
export function tipoDoDocumento(texto: string): TipoDeDocumento | null {
  const valor = normalizarDocumento(texto)
  if (valor.length === 11 && cpfValido(valor)) return 'cpf'
  if (valor.length === 14 && cnpjValido(valor)) return 'cnpj'
  return null
}

/**
 * Máscara enquanto a pessoa digita: até 11 dígitos, 000.000.000-00; depois (ou com letra),
 * 00.000.000/0000-00.
 */
export function mascararDocumento(texto: string): string {
  const valor = normalizarDocumento(texto)
  if (valor.length > 11 || /[A-Z]/.test(valor)) {
    const corpo = valor.slice(0, 12)
    const verificador = valor.slice(12).replace(/\D/g, '')
    const v = corpo + (corpo.length === 12 ? verificador : '')
    let saida = v.slice(0, 2)
    if (v.length > 2) saida += `.${v.slice(2, 5)}`
    if (v.length > 5) saida += `.${v.slice(5, 8)}`
    if (v.length > 8) saida += `/${v.slice(8, 12)}`
    if (v.length > 12) saida += `-${v.slice(12, 14)}`
    return saida
  }
  let saida = valor.slice(0, 3)
  if (valor.length > 3) saida += `.${valor.slice(3, 6)}`
  if (valor.length > 6) saida += `.${valor.slice(6, 9)}`
  if (valor.length > 9) saida += `-${valor.slice(9, 11)}`
  return saida
}
