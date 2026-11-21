import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ItemDoPlacar, Placar } from './placar'
import { Segmentado } from './segmentado'

const MODOS = [
  { valor: 'lista', rotulo: 'Lista' },
  { valor: 'mes', rotulo: 'Mês' },
] as const

function Alternador({ inicial = 'lista' }: { inicial?: 'lista' | 'mes' | null }) {
  const [modo, setModo] = useState<'lista' | 'mes' | null>(inicial)
  return <Segmentado rotulo="Visualização" opcoes={MODOS} valor={modo} aoMudar={setModo} />
}

describe('Segmentado', () => {
  it('é um grupo com nome, uma opção marcada por aria-pressed, e o clique troca a marcada', async () => {
    render(<Alternador />)
    const grupo = screen.getByRole('group', { name: 'Visualização' })
    const [lista, mes] = within(grupo).getAllByRole('button')
    expect(lista).toHaveAccessibleName('Lista')
    expect(lista).toHaveAttribute('aria-pressed', 'true')
    expect(mes).toHaveAttribute('aria-pressed', 'false')
    expect(lista).toHaveAttribute('type', 'button')

    await userEvent.click(screen.getByRole('button', { name: 'Mês' }))
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sem valor, nenhuma opção fica marcada', () => {
    render(<Alternador inicial={null} />)
    for (const botao of screen.getAllByRole('button')) {
      expect(botao).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('desabilitado não muda o valor', async () => {
    const aoMudar = vi.fn()
    render(
      <Segmentado rotulo="Margens" opcoes={MODOS} valor="lista" aoMudar={aoMudar} desabilitado />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }))
    expect(aoMudar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mês' })).toBeDisabled()
  })

  it('largura total no celular marca o grupo (a ação da página se alarga junto)', () => {
    render(
      <Segmentado
        rotulo="Quais"
        opcoes={MODOS}
        valor="mes"
        aoMudar={vi.fn()}
        larguraTotalNoCelular
      />,
    )
    expect(screen.getByRole('group', { name: 'Quais' })).toHaveAttribute('data-largura-total')
  })
})

describe('Placar', () => {
  it('com ação, cada casa é um botão com aria-pressed e nome "número rótulo"', async () => {
    const aoClicar = vi.fn()
    render(
      <Placar rotulo="Contadores">
        <ItemDoPlacar rotulo="Atrasadas" valor={3} tom="atraso" ativo aoClicar={aoClicar} />
        <ItemDoPlacar rotulo="Vencem hoje" valor={0} tom="hoje" ativo={false} aoClicar={vi.fn()} />
      </Placar>,
    )
    const grupo = screen.getByRole('group', { name: 'Contadores' })
    const atrasadas = within(grupo).getByRole('button', { name: '3 Atrasadas' })
    expect(atrasadas).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: '0 Vencem hoje' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await userEvent.click(atrasadas)
    expect(aoClicar).toHaveBeenCalledOnce()
    // Faixa de botões não é lista de definição.
    expect(grupo.querySelector('dl')).toBeNull()
  })

  it('sem ação, as casas são blocos estáticos em lista de definição (rótulo e valor)', () => {
    render(
      <Placar rotulo="Indicadores" tamanho="medio">
        <ItemDoPlacar rotulo="Em elaboração" valor={2} />
        <ItemDoPlacar rotulo="Aprovados" valor="R$ 1.600,00" detalhe="1 sem preço" />
      </Placar>,
    )
    const grupo = screen.getByRole('group', { name: 'Indicadores' })
    expect(within(grupo).queryByRole('button')).toBeNull()
    expect(
      within(grupo)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Em elaboração', 'Aprovados'])
    expect(
      within(grupo)
        .getAllByRole('definition')
        .map((d) => d.textContent),
    ).toEqual(['2', 'R$ 1.600,00', '1 sem preço'])
  })

  it('zero fica apagado e o tom só acende com valor', () => {
    render(
      <Placar rotulo="Contadores">
        <ItemDoPlacar rotulo="Atrasadas" valor={0} tom="atraso" aoClicar={vi.fn()} />
        <ItemDoPlacar rotulo="Hoje" valor={2} tom="hoje" aoClicar={vi.fn()} />
      </Placar>,
    )
    const zero = screen.getByText('0')
    expect(zero).toHaveClass('text-(--tinta-3)')
    expect(zero).not.toHaveClass('text-(--atraso-texto)')
    // "Hoje" com valor ganha a plaqueta verde.
    expect(screen.getByText('2')).toHaveClass('bg-(--sinal)')
  })
})
