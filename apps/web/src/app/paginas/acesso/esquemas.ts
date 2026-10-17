import { z } from 'zod'

// Validação de formulário (apresentação). O Supabase Auth e as RPCs validam de novo no servidor.

export const SENHA_TAMANHO_MINIMO = 8

export const campoEmail = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail')
  .refine((valor) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor), 'Informe um e-mail válido')

export const campoSenhaNova = z
  .string()
  .min(1, 'Informe a senha')
  .min(SENHA_TAMANHO_MINIMO, `Use pelo menos ${String(SENHA_TAMANHO_MINIMO)} caracteres`)

/** Senha nova + repetição (criar conta, aceitar convite, recuperar senha). */
export const esquemaSenhaNova = z
  .object({ senha: campoSenhaNova, repeticao: z.string().min(1, 'Repita a senha') })
  .refine((dados) => dados.senha === dados.repeticao, {
    message: 'As senhas não conferem',
    path: ['repeticao'],
  })

export const campoNome = z.string().trim().min(1, 'Informe o nome')
