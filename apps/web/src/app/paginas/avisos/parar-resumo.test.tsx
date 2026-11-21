// /avisos/parar#<token> (ADR-0047): descadastro sem login. Abrir a página não desliga; só o botão.
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp } from '@/test/renderizar'
import { falso } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const TOKEN =
  'v1.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222.assinatura'

describe('parar de receber o resumo diário', () => {
  beforeEach(() => {
    falso.reiniciar({ funcoes: { 'preferencias-por-link': { data: { desligado: true } } } })
  })

  it('abrir a página não chama a função; o botão desliga com o token do fragmento', async () => {
    const usuario = userEvent.setup()
    renderizarApp(`/avisos/parar#${TOKEN}`)

    expect(
      await screen.findByRole('heading', { name: 'Parar de receber o resumo diário' }),
    ).toBeInTheDocument()
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Parar de receber' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pronto. O resumo diário foi desligado.',
    )
    expect(falso.cliente.functions.invoke).toHaveBeenCalledWith('preferencias-por-link', {
      body: { token: TOKEN },
    })
    expect(screen.queryByRole('button', { name: 'Parar de receber' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar no Grama' })).toHaveAttribute('href', '/entrar')
  })

  it('sem token: link inválido, sem botão', async () => {
    renderizarApp('/avisos/parar')
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido')
    expect(screen.queryByRole('button', { name: 'Parar de receber' })).not.toBeInTheDocument()
    expect(falso.cliente.functions.invoke).not.toHaveBeenCalled()
  })

  it('link recusado pela função: mensagem de link inválido', async () => {
    falso.reiniciar({
      funcoes: {
        'preferencias-por-link': {
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ erro: 'link_invalido' }), { status: 400 }),
          ),
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp(`/avisos/parar#${TOKEN}`)

    await usuario.click(await screen.findByRole('button', { name: 'Parar de receber' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este link não vale mais. Desligue o resumo pelo Perfil.',
    )
    expect(screen.queryByRole('button', { name: 'Parar de receber' })).not.toBeInTheDocument()
  })

  it('falha de rede: erro com tentar de novo', async () => {
    let falhar = true
    falso.reiniciar({
      funcoes: {
        'preferencias-por-link': () =>
          falhar
            ? { error: new FunctionsFetchError(new Error('sem rede')) }
            : { data: { desligado: true } },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp(`/avisos/parar#${TOKEN}`)

    await usuario.click(await screen.findByRole('button', { name: 'Parar de receber' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível desligar')

    falhar = false
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pronto. O resumo diário foi desligado.',
    )
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp(`/avisos/parar#${TOKEN}`)
    await screen.findByRole('button', { name: 'Parar de receber' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
