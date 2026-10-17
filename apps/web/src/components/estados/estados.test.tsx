import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '.'

describe('componentes de estado', () => {
  it('EstadoVazio mostra título, descrição e ação', () => {
    render(
      <EstadoVazio
        titulo="Nada aqui"
        descricao="Explicação"
        acaoPrincipal={<button type="button">Agir</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nada aqui' })).toBeInTheDocument()
    expect(screen.getByText('Explicação')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agir' })).toBeInTheDocument()
  })

  it('Carregando é anunciado como status, com o esqueleto oculto de leitores de tela', () => {
    render(<Carregando rotulo="Carregando prazos" linhas={3} />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando prazos')
  })

  it('EstadoErro é um alerta e "Tentar de novo" chama a função', async () => {
    const aoTentarDeNovo = vi.fn()
    render(<EstadoErro aoTentarDeNovo={aoTentarDeNovo} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalledOnce()
  })

  it('EstadoErro sem função não mostra botão que não faz nada', () => {
    render(<EstadoErro />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('SemPermissao explica sem revelar o recurso', () => {
    render(<SemPermissao />)
    expect(
      screen.getByRole('heading', { name: 'Você não tem acesso a esta área' }),
    ).toBeInTheDocument()
  })
})
