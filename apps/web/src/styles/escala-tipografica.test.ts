// Escala de texto em quatro níveis (docs/design-system/tipografia.md, 23/11/2026): título da página,
// título de seção, texto e texto secundário. Negrito só em título de seção, número-chave e botão.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function papel(nome: string): string {
  const linha = new RegExp(`--${nome}:\\s*([^;]+);`).exec(tokens)
  if (!linha?.[1]) throw new Error(`token --${nome} ausente`)
  return linha[1].trim()
}

describe('escala tipográfica', () => {
  it('rótulo e cabeçalho de tabela são texto secundário: 12px, peso normal', () => {
    expect(papel('tipo-rotulo')).toBe(
      '400 var(--tam-legenda) / var(--entrelinha-legenda) var(--fonte)',
    )
    expect(papel('tipo-coluna')).toBe(
      '400 var(--tam-legenda) / var(--entrelinha-legenda) var(--fonte)',
    )
    expect(papel('tam-legenda')).toMatch(/^12px/)
  })

  it('título de seção é o único texto em negrito fora de botão e número', () => {
    expect(papel('tipo-secao')).toMatch(/^600 var\(--tam-secao\)/)
    expect(papel('tipo-corpo')).toMatch(/^400 /)
    // O antigo título de painel (20/650) agora é título de seção.
    expect(papel('tipo-painel')).toBe('var(--tipo-secao)')
  })

  it('os papéis só usam os pesos 400 e 600', () => {
    const pesos = [...tokens.matchAll(/--tipo-[a-z-]+:\s*(\d{3}) /g)].map((m) => m[1])
    expect(pesos.length).toBeGreaterThan(0)
    expect(new Set(pesos)).toEqual(new Set(['400', '600']))
  })
})
