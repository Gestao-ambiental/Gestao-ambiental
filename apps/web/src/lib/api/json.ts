// Leitura defensiva do JSON que as funções do banco devolvem. Os números ficam em cada módulo:
// orçamentos aceita numeric como texto; o rascunho dos primeiros passos só aceita número.

import type { Json } from '@/lib/database.types'

export type Objeto = Record<string, Json | undefined>

export function objeto(valor: Json | undefined): Objeto | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : null
}
export function texto(valor: Json | undefined): string {
  return typeof valor === 'string' ? valor : ''
}
export function textoOuNulo(valor: Json | undefined): string | null {
  return typeof valor === 'string' ? valor : null
}
export function lista(valor: Json | undefined): Objeto[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item): Objeto[] => {
    const lido = objeto(item)
    return lido ? [lido] : []
  })
}
