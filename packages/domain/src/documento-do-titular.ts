// Documento do titular do empreendimento e do cliente do orçamento: CNPJ ou CPF (decisão do
// Eduardo de 14/11/2026, pedido do Mateus: autorizações de corte saem no CPF de uma pessoa).
// O CPF é guardado (11 dígitos) e exibido mascarado. O banco aplica a mesma regra
// (private.cnpj_valido e os checks de empreendimento e orcamento).

import { mascararCnpj } from './cnpj'
import { cpfValido, normalizarDocumento } from './documento'

export type SituacaoDoDocumento = 'vazio' | 'completo' | 'incompleto' | 'cpf_invalido'

/** Situação do campo "CNPJ ou CPF": o CNPJ confere só o formato (como sempre); o CPF, os dígitos. */
export function situacaoDoDocumentoDoTitular(texto: string): SituacaoDoDocumento {
  const valor = normalizarDocumento(texto)
  if (valor === '') return 'vazio'
  if (/^\d{11}$/.test(valor)) return cpfValido(valor) ? 'completo' : 'cpf_invalido'
  return /^[0-9A-Z]{12}[0-9]{2}$/.test(valor) ? 'completo' : 'incompleto'
}

/** Só letras e dígitos, para gravar; nulo quando o campo não está completo. */
export function documentoDoTitularParaGravar(texto: string): string | null {
  return situacaoDoDocumentoDoTitular(texto) === 'completo' ? normalizarDocumento(texto) : null
}

/** "CPF" para 11 dígitos gravados; "CNPJ" para o resto. */
export function rotuloDoDocumentoDoTitular(documento: string | null | undefined): 'CPF' | 'CNPJ' {
  return documento && /^\d{11}$/.test(documento) ? 'CPF' : 'CNPJ'
}

/** Exibição de um documento gravado: CPF mascarado (***.982.247-**) ou CNPJ com a máscara. */
export function formatarDocumentoDoTitular(documento: string | null | undefined): string {
  if (!documento) return ''
  if (/^\d{11}$/.test(documento)) {
    return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`
  }
  return mascararCnpj(documento)
}
