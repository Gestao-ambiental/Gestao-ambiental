// Microtransições (DESIGN.md, "Movimento"): as peças existem, anunciam o que precisam e o
// movimento reduzido troca movimento por cor. O jsdom não anima CSS: os testes não dependem de tempo.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { ConfirmacaoSalva } from './confirmacao-salva'
import { Segmentado } from './segmentado'

function SegmentadoDeTeste() {
  const [valor, setValor] = useState<'minhas' | 'todas'>('minhas')
  return (
    <Segmentado
      rotulo="Mostrar"
      valor={valor}
      aoMudar={setValor}
      opcoes={[
        { valor: 'minhas', rotulo: 'Minhas' },
        { valor: 'todas', rotulo: 'Todas' },
      ]}
    />
  )
}

describe('microtransições', () => {
  it('o segmentado tem um indicador só, que segue a opção escolhida', async () => {
    const usuario = userEvent.setup()
    const { container } = render(<SegmentadoDeTeste />)
    expect(container.querySelectorAll('[data-indicador]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Minhas' })).toHaveAttribute('aria-pressed', 'true')
    await usuario.click(screen.getByRole('button', { name: 'Todas' }))
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelectorAll('[data-indicador]')).toHaveLength(1)
    // O indicador é decorativo: leitor de tela não o vê.
    expect(container.querySelector('[data-indicador]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('a confirmação de salvo anuncia o texto, com o check só visual', () => {
    render(<ConfirmacaoSalva>Nome salvo.</ConfirmacaoSalva>)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Nome salvo.')
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('com movimento reduzido, nada se mexe: durações zeradas e só troca de cor', () => {
    const css = (arquivo: string) =>
      readFileSync(resolve(__dirname, '../../styles', arquivo), 'utf8')
    const tokens = css('tokens.css')
    const global = css('global.css')
    const reduzido = (texto: string) =>
      texto.slice(texto.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduzido(tokens)).toMatch(/--dur-indicador: 0ms/)
    expect(reduzido(tokens)).toMatch(/--dur-media: 0ms/)
    expect(reduzido(global)).toMatch(/\.entrar,\s*\.marcar\s*\{\s*animation: none/)
    expect(reduzido(global)).toMatch(/\.acender\s*\{\s*animation-name: acender-cor/)
    expect(reduzido(global)).toMatch(/\[data-esqueleto\]\s*\{\s*animation: none/)
  })
})
