import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { BotaoMais, type ItemDoMenuMais } from './botao-mais'

function renderizar(ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/destino" element={<p>Página destino</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BotaoMais', () => {
  it('nome padrão "Mais ações"; na linha, "Ações de <nome>"', () => {
    const itens: ItemDoMenuMais[] = [{ rotulo: 'Duplicar', aoEscolher: vi.fn() }]
    renderizar(
      <>
        <BotaoMais itens={itens} />
        <BotaoMais itens={itens} de="Ana Ribeiro" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    )
    expect(screen.getByRole('button', { name: 'Ações de Ana Ribeiro' })).toBeInTheDocument()
  })

  it('abre pelo teclado, escolhe a ação e deixa de fora o item oculto', async () => {
    const usuario = userEvent.setup()
    const duplicar = vi.fn()
    const arquivar = vi.fn()
    renderizar(
      <BotaoMais
        itens={[
          { rotulo: 'Duplicar', icone: 'copy', aoEscolher: duplicar },
          { rotulo: 'Oculto', aoEscolher: vi.fn(), oculto: true },
          { rotulo: 'Arquivar', perigo: true, separadoAntes: true, aoEscolher: arquivar },
        ]}
      />,
    )
    await usuario.tab()
    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Oculto' })).toBeNull()
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Arquivar' })).toHaveClass('text-(--atraso-texto)')
    await usuario.click(screen.getByRole('menuitem', { name: 'Duplicar' }))
    expect(duplicar).toHaveBeenCalledTimes(1)
    expect(arquivar).not.toHaveBeenCalled()
  })

  it('item desabilitado não dispara e mostra o detalhe', async () => {
    const usuario = userEvent.setup()
    const desligar = vi.fn()
    renderizar(
      <BotaoMais
        de="Ana"
        itens={[
          {
            rotulo: 'Desligar',
            detalhe: 'É a última pessoa da Gestão.',
            desabilitado: true,
            aoEscolher: desligar,
          },
        ]}
      />,
    )
    await usuario.click(screen.getByRole('button', { name: 'Ações de Ana' }))
    const item = await screen.findByRole('menuitem', { name: /Desligar/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveTextContent('É a última pessoa da Gestão.')
    await usuario.click(item)
    expect(desligar).not.toHaveBeenCalled()
  })

  it('item com link navega', async () => {
    const usuario = userEvent.setup()
    renderizar(<BotaoMais itens={[{ rotulo: 'Ir', para: '/destino' }]} />)
    await usuario.click(screen.getByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Ir' }))
    expect(await screen.findByText('Página destino')).toBeInTheDocument()
  })

  it('sem itens visíveis o botão não aparece', () => {
    const { container } = renderizar(
      <>
        <BotaoMais itens={[{ rotulo: 'Oculto', aoEscolher: vi.fn(), oculto: true }]} />
        <BotaoMais itens={[]} />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('botão desabilitado', () => {
    renderizar(<BotaoMais desabilitado itens={[{ rotulo: 'A', aoEscolher: vi.fn() }]} />)
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeDisabled()
  })
})
