// Prospecto: quem pediu orçamento sem estar cadastrado (ORC-02). A tela confere o formato para
// avisar cedo; o banco confere de novo (private.gravar_prospecto). Nunca pedimos CPF.

import { mascararCnpj, normalizarCnpj, situacaoDoCnpj } from '@gestao-ambiental/domain'

import type { Prospecto } from '@/lib/api/orcamentos'

export interface CamposDoProspecto {
  nome: string
  cnpj: string
  contato: string
  email: string
  telefone: string
}

export type ErrosDoProspecto = Partial<Record<keyof CamposDoProspecto, string>>

export const PROSPECTO_VAZIO: CamposDoProspecto = {
  nome: '',
  cnpj: '',
  contato: '',
  email: '',
  telefone: '',
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function camposDoProspecto(p: Prospecto | null): CamposDoProspecto {
  if (!p) return PROSPECTO_VAZIO
  return {
    nome: p.nome,
    cnpj: p.cnpj ? mascararCnpj(p.cnpj) : '',
    contato: p.contato ?? '',
    email: p.email ?? '',
    telefone: p.telefone ?? '',
  }
}

/** Lê o que foi digitado. Devolve o prospecto ou os erros por campo. */
export function lerProspecto(
  c: CamposDoProspecto,
): { prospecto: Prospecto } | { erros: ErrosDoProspecto } {
  const erros: ErrosDoProspecto = {}
  if (!c.nome.trim()) erros.nome = 'Informe o nome da empresa ou do cliente'
  if (situacaoDoCnpj(c.cnpj) === 'incompleto') erros.cnpj = 'CNPJ incompleto: são 14 caracteres'
  if (c.email.trim() && !EMAIL.test(c.email.trim())) erros.email = 'E-mail inválido'
  if (Object.keys(erros).length > 0) return { erros }
  const vazioViraNulo = (texto: string) => texto.trim() || null
  return {
    prospecto: {
      nome: c.nome.trim(),
      cnpj: situacaoDoCnpj(c.cnpj) === 'completo' ? normalizarCnpj(c.cnpj) : null,
      contato: vazioViraNulo(c.contato),
      email: vazioViraNulo(c.email),
      telefone: vazioViraNulo(c.telefone),
    },
  }
}
