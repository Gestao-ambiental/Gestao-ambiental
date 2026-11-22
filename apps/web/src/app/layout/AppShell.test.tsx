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

  it('a Gestão vê 11 itens em três grupos, com a Triagem ao lado de Orçamentos; Planejamento fica fora', async () => {
    renderizarApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Minha semana',
      'Visão da equipe',
      'Calendário',
      'Empreendimentos',
      'Acompanhamentos',
      'Campo',
      'Resíduos',
      'Orçamentos',
      'Triagem',
      'Painel',
      'Configurações',
    ])
    expect(within(menu).getByText('Trabalho')).toBeInTheDocument()
    expect(within(menu).getByText('Gestão')).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/painel')
    expect(within(menu).getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/configuracoes',
    )
    expect(within(menu).getByRole('link', { name: 'Triagem' })).toHaveAttribute('href', '/triagem')
    expect(within(menu).queryByRole('link', { name: 'Planejamento' })).not.toBeInTheDocument()
  })

  it('a Equipe vê 7 itens, sem o grupo Gestão', async () => {
    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
    })
    renderizarApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Minha semana',
      'Visão da equipe',
      'Calendário',
      'Empreendimentos',
      'Acompanhamentos',
      'Campo',
      'Resíduos',
    ])
    expect(within(menu).queryByText('Gestão')).not.toBeInTheDocument()
  })

  it('a rota da Triagem abre a página da triagem', async () => {
    renderizarApp('/triagem')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Triagem de licenciamento' }),
    ).toBeInTheDocument()
  })

  it('o menu principal é navegável por teclado (Tab chega aos links na ordem)', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    const links = within(menu).getAllByRole('link')

    links[1]?.focus()
    await usuario.tab()
    expect(links[2]).toHaveFocus()
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
    expect(screen.getByRole('button', { name: /^Tema:/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Conta de / })).toBeInTheDocument()
    // Com um vínculo só, a consultoria aparece fixa no rail (sem seletor), como no design system
    expect(screen.getByRole('group', { name: /^Consultoria: / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Consultoria: / })).not.toBeInTheDocument()
  })

  it('no celular, a barra inferior leva aos atalhos e "Mais" abre o menu, que fecha ao navegar', async () => {
    // A barra inferior só existe abaixo de 768px (o jsdom não tem matchMedia: simula o celular).
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: consulta.includes('max-width'),
      media: consulta,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    const usuario = userEvent.setup()
    renderizarApp('/')
    const atalhos = await screen.findByRole('navigation', { name: 'Atalhos' })
    expect(
      within(atalhos)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Semana', 'Início', 'Calendário', 'Campo'])
    expect(within(atalhos).getByRole('button', { name: 'Mais' })).toBeInTheDocument()
    expect(within(atalhos).getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await usuario.click(within(atalhos).getByRole('button', { name: 'Mais' }))

    const gaveta = await screen.findByRole('dialog')
    const menuGaveta = within(gaveta).getByRole('navigation', { name: 'Menu principal' })
    await usuario.click(within(menuGaveta).getByRole('link', { name: 'Empreendimentos' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Empreendimentos' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('no desktop não há barra inferior', async () => {
    renderizarApp('/')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('navigation', { name: 'Atalhos' })).not.toBeInTheDocument()
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
