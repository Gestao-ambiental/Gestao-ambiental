import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

describe('shell do app', () => {
  beforeEach(() => {
    falso.reiniciar({
      sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
    })
  })

  it('renderiza a Visão da equipe e navega para o Calendário pelo menu', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()

    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    const linkVisao = within(menu).getByRole('link', { name: 'Visão da equipe' })
    expect(linkVisao).toHaveAttribute('aria-current', 'page')

    await usuario.click(within(menu).getByRole('link', { name: 'Calendário' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/calendario')
    expect(within(menu).getByRole('link', { name: 'Calendário' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(linkVisao).not.toHaveAttribute('aria-current')
  })

  it('o menu principal é navegável por teclado (Tab chega aos links na ordem)', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    const links = within(menu).getAllByRole('link')

    links[0]?.focus()
    await usuario.tab()
    expect(links[1]).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
  })

  it('tem link "Pular para o conteúdo" e botões de ícone com nome acessível', async () => {
    renderizarApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    )
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tema:/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Conta de / })).toBeInTheDocument()
    // Com um vínculo só, a consultoria aparece fixa no rail (sem seletor), como no design system
    expect(screen.getByRole('group', { name: /^Consultoria: / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Consultoria: / })).not.toBeInTheDocument()
  })

  it('a gaveta do celular abre pelo botão, mostra o menu e fecha ao navegar', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: 'Abrir menu' }))

    const gaveta = await screen.findByRole('dialog')
    const menuGaveta = within(gaveta).getByRole('navigation', { name: 'Menu principal' })
    await usuario.click(within(menuGaveta).getByRole('link', { name: 'Empreendimentos' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Empreendimentos' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('/entrar abre o layout público sem o menu do app', async () => {
    falso.reiniciar({})
    renderizarApp('/entrar')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Entrar no Grama' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument()
  })

  it('endereço desconhecido mostra "Página não encontrada" dentro do shell', async () => {
    renderizarApp('/nao-existe')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/')
    await screen.findByRole('heading', { level: 1 })
    // Contraste depende de layout real (o jsdom não calcula); foi conferido à parte nos tokens.
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
