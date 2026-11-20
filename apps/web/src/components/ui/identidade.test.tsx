import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Pagina } from '@/app/paginas/Pagina'
import { Contagem } from '@/app/paginas/visao/Contagem'

import { Selo } from './selo'
import { Trilha } from './trilha'

describe('identidade "quadro de partidas"', () => {
  it('Contagem mostra hoje, dias que faltam e atraso com sinal de menos, fora do leitor de tela', () => {
    const { container, rerender } = render(<Contagem dias={0} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container).toHaveTextContent('hoje')

    rerender(<Contagem dias={1} />)
    expect(container).toHaveTextContent('1dia')

    rerender(<Contagem dias={6} />)
    expect(container).toHaveTextContent('6dias')

    rerender(<Contagem dias={-12} />)
    expect(container).toHaveTextContent('−12atraso')
  })

  it('Selo leva a palavra e uma marca de forma; o atraso grave vira plaqueta sem marca', () => {
    const { container, rerender } = render(<Selo tom="atencao">Vence em 3 dias</Selo>)
    expect(screen.getByText('Vence em 3 dias')).toBeInTheDocument()
    expect(container.querySelector('[data-tom="atencao"] [aria-hidden]')).not.toBeNull()

    rerender(<Selo tom="perigoForte">Vencida</Selo>)
    expect(screen.getByText('Vencida')).toBeInTheDocument()
    expect(container.querySelector('[data-tom="perigoForte"] [aria-hidden]')).toBeNull()
  })

  it('Pagina mostra o título, a ação principal, a meta e o voltar', () => {
    render(
      <MemoryRouter>
        <Pagina
          titulo="Empreendimentos"
          meta="3 empreendimentos"
          voltar={{ para: '/', rotulo: 'Início' }}
          acao={<button type="button">Novo empreendimento</button>}
        >
          <p>conteúdo</p>
        </Pagina>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Empreendimentos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo empreendimento' })).toBeInTheDocument()
    expect(screen.getByText('3 empreendimentos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/')
    expect(document.title).toBe('Empreendimentos · Grama')
  })

  it('Trilha marca o passo atual e diz os concluídos por extenso', () => {
    render(
      <Trilha
        rotulo="Cadastro"
        atual={1}
        passos={[
          { id: 'a', titulo: 'Documento' },
          { id: 'b', titulo: 'Identificação' },
          { id: 'c', titulo: 'Prazos' },
        ]}
      />,
    )
    expect(screen.getByText('Documento, concluída')).toBeInTheDocument()
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('Identificação')
  })
})
