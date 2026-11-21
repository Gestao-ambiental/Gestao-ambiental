// Arquivos do domínio copiados para o Edge (o Deno não lê packages/domain): o corpo tem de ser igual.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '../../../..')
const corpo = (texto: string) => texto.slice(texto.indexOf('export '))

describe('espelho do domínio no Edge', () => {
  it('aviso-de-norma.ts é igual nos dois lados (só muda o cabeçalho)', () => {
    const dominio = readFileSync(resolve(RAIZ, 'packages/domain/src/aviso-de-norma.ts'), 'utf8')
    const edge = readFileSync(resolve(RAIZ, 'supabase/functions/_shared/aviso-de-norma.ts'), 'utf8')
    expect(corpo(edge)).toBe(corpo(dominio))
  })
})
