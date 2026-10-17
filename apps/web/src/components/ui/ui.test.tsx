import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConsultoriaAtual } from '@/app/layout/ConsultoriaAtual'

import { Botao } from './botao'
import { BotaoIcone } from './botao-icone'
import { Icone, URL_DOS_ICONES } from './icone'
import { NOMES_ICONES } from './nomes-icones'
import { Selo } from './selo'

describe('Icone', () => {
  it('a lista tipada de nomes bate com os SVGs copiados do design system', () => {
    expect([...NOMES_ICONES].sort()).toEqual(Object.keys(URL_DOS_ICONES).sort())
    expect(NOMES_ICONES).toHaveLength(64)
  })

  it('é decorativo sem rótulo e vira imagem com nome acessível quando rotulado', () => {
    const { container } = render(<Icone nome="calendar" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    render(<Icone nome="triangle-alert" rotulo="Atenção" />)
    expect(screen.getByRole('img', { name: 'Atenção' })).toBeInTheDocument()
  })

  it('pinta com currentColor por máscara (a cor vem do texto ao redor)', () => {
    const { container } = render(<Icone nome="check" />)
    const estilo = (container.firstElementChild as HTMLElement).style
    expect(estilo.backgroundColor).toBe('currentcolor')
    expect(estilo.width).toBe('16px')
  })
})

describe('Botao e BotaoIcone', () => {
  it('Botao chama a ação e indica selecionado com aria-pressed', async () => {
    const aoClicar = vi.fn()
    render(
      <Botao aparencia="primario" iconeAntes="plus" selecionado onClick={aoClicar}>
        Cadastrar licença
      </Botao>,
    )
    const botao = screen.getByRole('button', { name: 'Cadastrar licença' })
    expect(botao).toHaveAttribute('type', 'button')
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(botao)
    expect(aoClicar).toHaveBeenCalledOnce()
  })

  it('Botao desabilitado não dispara a ação', async () => {
    const aoClicar = vi.fn()
    render(
      <Botao disabled onClick={aoClicar}>
        Enviar evidência
      </Botao>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enviar evidência' }))
    expect(aoClicar).not.toHaveBeenCalled()
  })

  it('BotaoIcone exige rótulo e o usa como nome acessível e dica', () => {
    render(<BotaoIcone icone="bell" rotulo="Notificações" />)
    const botao = screen.getByRole('button', { name: 'Notificações' })
    expect(botao).toHaveAttribute('title', 'Notificações')
  })
})

describe('Selo', () => {
  it('mostra a palavra do estado (a cor nunca é o único sinal)', () => {
    render(<Selo tom="perigo">Atrasada</Selo>)
    expect(screen.getByText('Atrasada')).toBeInTheDocument()
  })
})

describe('ConsultoriaAtual', () => {
  it('com mais de um vínculo vira seletor', () => {
    render(
      <ConsultoriaAtual
        consultorias={[
          { id: 'a', nome: 'Filtroville Consultoria Ambiental', sigla: 'FV', papel: 'Gestão' },
          { id: 'b', nome: 'Verde Sul Ambiental', sigla: 'VS', papel: 'Equipe' },
        ]}
      />,
    )
    expect(
      screen.getByRole('button', { name: /^Consultoria: Filtroville Consultoria Ambiental/ }),
    ).toBeInTheDocument()
  })
})
