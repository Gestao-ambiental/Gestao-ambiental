import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

import { CHAVE_BLOQUEIO } from './contexto-bloqueio'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

function cenario(extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: ana,
    sessaoAoEntrar: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_empreendimentos: { data: [] },
      listar_prazos: { data: [] },
      contar_prazos: { data: [] },
    },
    tabelas: { membro: [], instrumento: [], unidade: [] },
    ...extra,
  }
}

async function bloquearPeloMenu(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole('button', { name: 'Conta de Ana Ribeiro' }))
  await usuario.click(await screen.findByRole('menuitem', { name: /Bloquear tela/ }))
  return screen.findByRole('dialog', { name: 'Tela bloqueada' })
}

describe('bloquear tela (ACC-05)', () => {
  beforeEach(() => {
    localStorage.clear()
    falso.reiniciar(cenario())
  })

  it('pelo menu da conta: esconde o conteúdo e o título da aba, sem sair', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos')
    await screen.findByRole('heading', { level: 1, name: 'Empreendimentos' })

    const tela = await bloquearPeloMenu(usuario)
    expect(within(tela).getByText('Ana Ribeiro')).toBeInTheDocument()
    expect(within(tela).getByLabelText('Senha')).toHaveFocus()
    expect(screen.queryByRole('heading', { level: 1, name: 'Empreendimentos' })).toBeNull()
    expect(document.title).toBe('Tela bloqueada · Grama')
    expect(router.state.location.pathname).toBe('/empreendimentos')
    expect(falso.cliente.auth.signOut).not.toHaveBeenCalled()
    expect(localStorage.getItem(CHAVE_BLOQUEIO)).toBe(ana.user.id)
  })

  it('senha errada não desbloqueia', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar(
      cenario({ entrar: { error: { code: 'invalid_credentials', status: 400, message: 'x' } } }),
    )
    renderizarApp('/empreendimentos')
    const tela = await bloquearPeloMenu(usuario)

    await usuario.click(within(tela).getByRole('button', { name: 'Desbloquear' }))
    expect(within(tela).getByText('Digite sua senha')).toBeInTheDocument()

    await usuario.type(within(tela).getByLabelText('Senha'), 'errada')
    await usuario.click(within(tela).getByRole('button', { name: 'Desbloquear' }))
    expect(await within(tela).findByText('Senha incorreta.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Tela bloqueada' })).toBeInTheDocument()
    expect(falso.cliente.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@filtroville.test',
      password: 'errada',
    })
  })

  it('no meio de um cadastro: Ctrl+Shift+L bloqueia e a senha devolve o formulário intacto', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos')
    await usuario.click(await screen.findByRole('button', { name: 'Novo empreendimento' }))
    const formulario = await screen.findByRole('dialog', { name: 'Novo empreendimento' })
    await usuario.type(within(formulario).getByLabelText('Nome do empreendimento'), 'Metalúrgica')

    await usuario.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')
    const tela = await screen.findByRole('dialog', { name: 'Tela bloqueada' })
    await usuario.type(within(tela).getByLabelText('Senha'), 'senha-certa')
    await usuario.click(within(tela).getByRole('button', { name: 'Desbloquear' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Tela bloqueada' })).toBeNull()
    })
    const deVolta = screen.getByRole('dialog', { name: 'Novo empreendimento' })
    expect(within(deVolta).getByLabelText('Nome do empreendimento')).toHaveValue('Metalúrgica')
    expect(router.state.location.pathname).toBe('/empreendimentos')
    expect(localStorage.getItem(CHAVE_BLOQUEIO)).toBeNull()
  })

  it('recarregar com a tela bloqueada continua bloqueado', async () => {
    localStorage.setItem(CHAVE_BLOQUEIO, ana.user.id)
    renderizarApp('/empreendimentos')
    expect(await screen.findByRole('dialog', { name: 'Tela bloqueada' })).toBeInTheDocument()
  })

  it('bloqueio de outra conta não vale para esta', async () => {
    localStorage.setItem(CHAVE_BLOQUEIO, 'u-outra@filtroville.test')
    renderizarApp('/empreendimentos')
    await screen.findByRole('heading', { level: 1, name: 'Empreendimentos' })
    expect(screen.queryByRole('dialog', { name: 'Tela bloqueada' })).toBeNull()
  })

  it('sessão revogada enquanto bloqueada volta ao login', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos')
    await bloquearPeloMenu(usuario)

    falso.expirarSessao()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/entrar')
    })
    expect(localStorage.getItem(CHAVE_BLOQUEIO)).toBeNull()
  })

  it('"Sair e entrar com outra conta" avisa e sai', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos')
    const tela = await bloquearPeloMenu(usuario)

    await usuario.click(within(tela).getByRole('button', { name: 'Sair e entrar com outra conta' }))
    expect(within(tela).getByText('O que não foi salvo nesta tela se perde.')).toBeInTheDocument()
    await usuario.click(within(tela).getByRole('button', { name: 'Sair' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/entrar')
    })
    expect(falso.cliente.auth.signOut).toHaveBeenCalled()
    expect(localStorage.getItem(CHAVE_BLOQUEIO)).toBeNull()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos')
    await bloquearPeloMenu(usuario)
    const resultado = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
