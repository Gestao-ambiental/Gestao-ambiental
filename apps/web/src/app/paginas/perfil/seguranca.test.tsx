import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { SEGREDO_FALSO, falso, sessaoDe, type CenarioDoisFatores } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

function cenario(doisFatores: CenarioDoisFatores = {}) {
  falso.reiniciar({
    sessao: ana,
    doisFatores,
    rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
  })
}

const secao = () => screen.findByRole('region', { name: 'Dois fatores' })

describe('segurança: dois fatores (ADR-0024)', () => {
  it('chega pelo menu da conta', async () => {
    const usuario = userEvent.setup()
    cenario()
    const { router } = renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: 'Conta de Ana Ribeiro' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Segurança' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/seguranca')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Segurança' })).toBeInTheDocument()
  })

  it('sem fator: ativa com QR code, chave e o primeiro código', async () => {
    const usuario = userEvent.setup()
    cenario()
    renderizarApp('/seguranca')
    const regiao = await secao()
    expect(await within(regiao).findByText('Desativados')).toBeInTheDocument()

    await usuario.click(within(regiao).getByRole('button', { name: 'Ativar dois fatores' }))
    expect(
      await within(regiao).findByRole('img', { name: 'QR code para o aplicativo autenticador' }),
    ).toBeInTheDocument()
    expect(within(regiao).getByText(SEGREDO_FALSO)).toBeInTheDocument()

    await usuario.type(
      within(regiao).getByRole('textbox', { name: 'Código de 6 dígitos' }),
      '123456',
    )
    await usuario.click(within(regiao).getByRole('button', { name: 'Ativar' }))

    expect(await within(regiao).findByRole('status')).toHaveTextContent('Dois fatores ativados.')
    expect(await within(regiao).findByText('Ativados')).toBeInTheDocument()
    expect(falso.cliente.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'fator-novo',
      code: '123456',
    })
  })

  it('cancelar depois do QR code volta ao começo', async () => {
    const usuario = userEvent.setup()
    cenario()
    renderizarApp('/seguranca')
    const regiao = await secao()
    await usuario.click(await within(regiao).findByRole('button', { name: 'Ativar dois fatores' }))
    await within(regiao).findByRole('img', { name: 'QR code para o aplicativo autenticador' })
    await usuario.click(within(regiao).getByRole('button', { name: 'Cancelar' }))
    expect(
      await within(regiao).findByRole('button', { name: 'Ativar dois fatores' }),
    ).toBeInTheDocument()
    expect(within(regiao).queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()
  })

  it('com fator e sessão confirmada (aal2): remove', async () => {
    const usuario = userEvent.setup()
    cenario({ nivel: 'aal2', fatores: [{ id: 'fator-1', status: 'verified' }] })
    renderizarApp('/seguranca')
    const regiao = await secao()
    expect(await within(regiao).findByText('Ativados')).toBeInTheDocument()

    await usuario.click(within(regiao).getByRole('button', { name: 'Remover dois fatores' }))
    expect(within(regiao).queryByRole('textbox')).not.toBeInTheDocument()
    await usuario.click(within(regiao).getByRole('button', { name: 'Remover dois fatores' }))

    expect(await within(regiao).findByRole('status')).toHaveTextContent('Dois fatores removidos.')
    expect(await within(regiao).findByText('Desativados')).toBeInTheDocument()
    expect(falso.cliente.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'fator-1' })
  })

  it('com fator e sessão só com senha (aal1): pede o código antes de remover', async () => {
    const usuario = userEvent.setup()
    cenario({ nivel: 'aal1', fatores: [{ id: 'fator-1', status: 'verified' }] })
    renderizarApp('/seguranca')
    const regiao = await secao()
    await usuario.click(await within(regiao).findByRole('button', { name: 'Remover dois fatores' }))
    await usuario.type(
      within(regiao).getByRole('textbox', { name: 'Código de 6 dígitos' }),
      '111222',
    )
    await usuario.click(within(regiao).getByRole('button', { name: 'Confirmar e remover' }))

    expect(await within(regiao).findByRole('status')).toHaveTextContent('Dois fatores removidos.')
    expect(falso.cliente.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'fator-1',
      code: '111222',
    })
    expect(falso.cliente.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'fator-1' })
  })

  it('o Auth recusando a remoção mostra o erro e mantém o fator', async () => {
    const usuario = userEvent.setup()
    cenario({
      nivel: 'aal2',
      fatores: [{ id: 'fator-1', status: 'verified' }],
      remover: { error: { code: 'insufficient_aal', status: 403 } },
    })
    renderizarApp('/seguranca')
    const regiao = await secao()
    await usuario.click(await within(regiao).findByRole('button', { name: 'Remover dois fatores' }))
    await usuario.click(within(regiao).getByRole('button', { name: 'Remover dois fatores' }))
    expect(await within(regiao).findByRole('alert')).toHaveTextContent(
      'Confirme o código do aplicativo autenticador para continuar.',
    )
    expect(within(regiao).getByText('Ativados')).toBeInTheDocument()
  })

  it('erro ao carregar mostra "Tentar de novo"', async () => {
    cenario({ erroAoLer: { message: 'falha de rede' } })
    renderizarApp('/seguranca')
    const regiao = await secao()
    expect(await within(regiao).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os dois fatores.',
    )
    expect(within(regiao).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const usuario = userEvent.setup()
    cenario()
    const { container } = renderizarApp('/seguranca')
    const regiao = await secao()
    await usuario.click(await within(regiao).findByRole('button', { name: 'Ativar dois fatores' }))
    await within(regiao).findByRole('textbox', { name: 'Código de 6 dígitos' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
