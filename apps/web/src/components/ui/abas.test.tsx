import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { type Aba, Abas, AbasDeFiltro, AbasDeRota, PainelDeAba } from './abas'

type Valor = 'todas' | 'abertas' | 'fechadas'

const ABAS: Aba<Valor>[] = [
  { valor: 'todas', rotulo: 'Todas', contagem: 5 },
  { valor: 'abertas', rotulo: 'Abertas', contagem: 0 },
  { valor: 'fechadas', rotulo: 'Fechadas', contagem: 2, lerContagem: (n) => `${String(n)} itens` },
]

function Controladas({ abas = ABAS, aoMudar }: { abas?: Aba<Valor>[]; aoMudar?: () => void }) {
  const [valor, setValor] = useState<Valor>('todas')
  return (
    <>
      <Abas
        rotulo="Situação"
        abas={abas}
        valor={valor}
        idBase="t"
        aoMudar={(v) => {
          setValor(v)
          aoMudar?.()
        }}
      />
      <PainelDeAba idBase="t" valor={valor}>
        Painel {valor}
      </PainelDeAba>
    </>
  )
}

describe('Abas (estado)', () => {
  it('lista com nome, aba ativa marcada e ligada ao painel', () => {
    render(<Controladas />)
    const lista = screen.getByRole('tablist', { name: 'Situação' })
    const todas = within(lista).getByRole('tab', { name: 'Todas 5' })
    expect(todas).toHaveAttribute('aria-selected', 'true')
    expect(todas).toHaveAttribute('tabindex', '0')
    const painel = screen.getByRole('tabpanel', { name: 'Todas 5' })
    expect(todas).toHaveAttribute('aria-controls', painel.id)
    expect(within(lista).getByRole('tab', { name: 'Abertas' })).toHaveAttribute('tabindex', '-1')
  })

  it('contagem zero não aparece; contagem com leitura própria vai para o leitor', () => {
    render(<Controladas />)
    expect(screen.getByRole('tab', { name: 'Abertas' })).toHaveTextContent(/^Abertas$/)
    expect(screen.getByRole('tab', { name: 'Fechadas: 2 itens' })).toBeInTheDocument()
  })

  it('setas, Home e End movem o foco e escolhem a aba', async () => {
    const usuario = userEvent.setup()
    render(<Controladas />)
    await usuario.tab()
    expect(screen.getByRole('tab', { name: 'Todas 5' })).toHaveFocus()

    await usuario.keyboard('{ArrowRight}')
    const abertas = screen.getByRole('tab', { name: 'Abertas' })
    expect(abertas).toHaveFocus()
    expect(abertas).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel abertas')

    await usuario.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /^Fechadas/ })).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Todas 5' })).toHaveFocus()
    await usuario.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /^Fechadas/ })).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Todas 5' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clique troca a aba; clicar na ativa não chama de novo', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(<Controladas aoMudar={aoMudar} />)
    await usuario.click(screen.getByRole('tab', { name: 'Todas 5' }))
    expect(aoMudar).not.toHaveBeenCalled()
    await usuario.click(screen.getByRole('tab', { name: /^Fechadas/ }))
    expect(aoMudar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel fechadas')
  })

  it('aba oculta fica de fora, inclusive das setas', async () => {
    const usuario = userEvent.setup()
    render(
      <Controladas abas={ABAS.map((a) => (a.valor === 'abertas' ? { ...a, oculta: true } : a))} />,
    )
    expect(screen.queryByRole('tab', { name: 'Abertas' })).toBeNull()
    await usuario.tab()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /^Fechadas/ })).toHaveFocus()
  })

  it('rótulo curto no celular sem perder o nome completo', () => {
    render(
      <Abas
        rotulo="Acompanhamentos"
        abas={[{ valor: 'a', rotulo: 'Aguardando conferência', curto: 'Conferência' }]}
        valor="a"
        aoMudar={vi.fn()}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Aguardando conferência' })).not.toHaveAttribute(
      'aria-controls',
    )
  })
})

describe('AbasDeFiltro', () => {
  function Filtro({ aoMudar }: { aoMudar?: () => void }) {
    const [valor, setValor] = useState<Valor>('todas')
    return (
      <AbasDeFiltro
        rotulo="Situação"
        abas={ABAS}
        valor={valor}
        aoMudar={(v) => {
          setValor(v)
          aoMudar?.()
        }}
      />
    )
  }

  it('grupo de botões com aria-pressed, sem tablist nem painel', () => {
    render(<Filtro />)
    const grupo = screen.getByRole('group', { name: 'Situação' })
    expect(within(grupo).getByRole('button', { name: 'Todas 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(grupo).getByRole('button', { name: 'Fechadas: 2 itens' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('Tab passa por cada filtro; setas não escolhem; Enter escolhe uma vez', async () => {
    const usuario = userEvent.setup()
    const aoMudar = vi.fn()
    render(<Filtro aoMudar={aoMudar} />)
    await usuario.tab()
    expect(screen.getByRole('button', { name: 'Todas 5' })).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(aoMudar).not.toHaveBeenCalled()
    await usuario.tab()
    expect(screen.getByRole('button', { name: 'Abertas' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(aoMudar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Abertas' })).toHaveAttribute('aria-pressed', 'true')
    await usuario.click(screen.getByRole('button', { name: 'Abertas' }))
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('o traço da ativa é um elemento só, decorativo, que segue o filtro escolhido', async () => {
    // jsdom não mede: cada botão ganha uma caixa conforme a posição dele na faixa.
    const medir = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const irmaos = this.parentElement ? [...this.parentElement.children] : []
        const x = this.tagName === 'BUTTON' ? irmaos.indexOf(this) * 100 : 0
        return DOMRect.fromRect({
          x,
          y: 0,
          width: this.tagName === 'BUTTON' ? 80 : 400,
          height: 44,
        })
      })
    try {
      const usuario = userEvent.setup()
      const { container } = render(<Filtro />)
      const tracos = () => container.querySelectorAll('[data-indicador]')
      expect(tracos()).toHaveLength(1)
      expect(tracos()[0]).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('button', { name: 'Todas 5' })).toHaveClass('border-transparent')
      const antes = (tracos()[0] as HTMLElement).style.transform
      await usuario.click(screen.getByRole('button', { name: 'Abertas' }))
      expect(tracos()).toHaveLength(1)
      expect((tracos()[0] as HTMLElement).style.transform).not.toBe(antes)
    } finally {
      medir.mockRestore()
    }
  })

  it('sem medida (primeira pintura), a própria aba ativa desenha o traço', () => {
    const { container } = render(<Filtro />)
    expect(container.querySelector('[data-indicador]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Todas 5' })).toHaveClass('border-(--marca-linha)')
  })
})

describe('AbasDeRota', () => {
  function renderizar(caminho: string) {
    return render(
      <MemoryRouter initialEntries={[caminho]}>
        <AbasDeRota
          rotulo="Configurações"
          abas={[
            { para: '/configuracoes', rotulo: 'Consultoria', exata: true },
            { para: '/configuracoes/custos', rotulo: 'Custos', contagem: 0 },
            { para: '/configuracoes/equipe', rotulo: 'Equipe', contagem: 3 },
            {
              para: '/configuracoes/pendencias',
              rotulo: 'Pendências',
              contagem: 2,
              alerta: true,
              lerContagem: (n) => `${String(n)} pendências`,
            },
            { para: '/configuracoes/oculta', rotulo: 'Oculta', oculta: true },
          ]}
        />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('navegação com nome e o link da rota atual com aria-current="page"', () => {
    renderizar('/configuracoes/custos')
    const nav = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(nav).getByRole('link', { name: 'Custos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Consultoria' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(within(nav).getByRole('link', { name: 'Equipe 3' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Oculta' })).toBeNull()
  })

  it('contagem em alerta: plaqueta de alerta fora da rota, lida pelo leitor de tela', async () => {
    const usuario = userEvent.setup()
    renderizar('/configuracoes')
    const link = screen.getByRole('link', { name: 'Pendências: 2 pendências' })
    expect(within(link).getByText('2')).toHaveClass('bg-(--alerta-fundo)')
    await usuario.click(link)
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(within(link).getByText('2')).toHaveClass('bg-(--tinta)')
  })

  it('clicar no link troca a rota ativa', async () => {
    const usuario = userEvent.setup()
    renderizar('/configuracoes')
    expect(screen.getByRole('link', { name: 'Consultoria' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await usuario.click(screen.getByRole('link', { name: 'Equipe 3' }))
    expect(screen.getByRole('link', { name: 'Equipe 3' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Consultoria' })).not.toHaveAttribute('aria-current')
  })
})
