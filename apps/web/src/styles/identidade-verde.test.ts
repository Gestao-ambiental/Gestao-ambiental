// ADR-0051: o software usa o verde-escuro; o lima é só do site. Os componentes usam semânticos.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = resolve(__dirname, '..')
const tokens = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(tsx?|css)$/.test(nome) ? [caminho] : []
  })
}

function bloco(seletor: string): string {
  const inicio = tokens.indexOf(seletor)
  return tokens.slice(inicio, tokens.indexOf('}', inicio))
}

function luminancia(hex: string): number {
  const linear = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
}
function contraste(a: string, b: string): number {
  const x = luminancia(a)
  const y = luminancia(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function primitivo(nome: string): string {
  const achado = new RegExp(`--${nome}: *(#[0-9a-f]{6})`).exec(tokens)?.[1]
  if (!achado) throw new Error(`primitivo ${nome} não existe`)
  return achado
}

describe('verde-escuro no software (ADR-0051)', () => {
  it('nenhum arquivo do app usa --lima nem o #cdf22b do site', () => {
    for (const arquivo of arquivos(RAIZ)) {
      if (arquivo.endsWith('identidade-verde.test.ts')) continue
      const texto = readFileSync(arquivo, 'utf8')
      expect(texto, arquivo).not.toMatch(/--lima/)
      expect(texto.toLowerCase(), arquivo).not.toContain('#cdf22b')
    }
  })

  it('componentes não usam os primitivos do destaque', () => {
    for (const arquivo of arquivos(RAIZ)) {
      if (arquivo.endsWith('tokens.css') || arquivo.endsWith('identidade-verde.test.ts')) continue
      expect(readFileSync(arquivo, 'utf8'), arquivo).not.toMatch(/var\(--destaque/)
    }
  })

  it('o destaque é o verde-escuro aprovado, com texto branco nos dois temas', () => {
    expect(primitivo('destaque')).toBe('#1b4332')
    expect(primitivo('destaque-noite')).toBe('#2f7a57')
    expect(bloco("[data-theme='light']")).toMatch(/--acao-texto: var\(--branco\)/)
    expect(bloco("[data-theme='dark']")).toMatch(/--acao-texto: var\(--branco\)/)
    expect(bloco("[data-theme='dark']")).toMatch(/--link: var\(--destaque-brilho\)/)
  })

  it('texto branco sobre o destaque e o verde como texto passam no AA', () => {
    const branco = '#ffffff'
    for (const nome of [
      'destaque',
      'destaque-toque',
      'destaque-aperto',
      'destaque-noite',
      'destaque-noite-toque',
      'destaque-noite-aperto',
    ]) {
      expect(contraste(branco, primitivo(nome)), nome).toBeGreaterThanOrEqual(4.5)
    }
    expect(contraste(primitivo('destaque'), primitivo('papel'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(primitivo('destaque'), primitivo('destaque-claro'))).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(contraste(primitivo('destaque-brilho'), primitivo('noite'))).toBeGreaterThanOrEqual(4.5)
    expect(
      contraste(primitivo('destaque-brilho'), primitivo('destaque-noite-fundo')),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
