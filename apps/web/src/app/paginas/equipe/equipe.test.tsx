import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function membro(id: string, nome: string, papel: 'gestao' | 'equipe', situacao = 'ativo') {
  return {
    id,
    nome,
    email: `${id}@filtroville.test`,
    papel,
    situacao,
    criado_em: '2026-02-03T12:00:00Z',
    desligado_em: situacao === 'desligado' ? '2026-10-10T12:00:00Z' : null,
  }
}

const tabelas = {
  membro: [
    membro('m-Filtroville', 'Eduardo Karnopp', 'gestao'),
    membro('ana', 'Ana Ribeiro', 'equipe'),
    membro('diego', 'Diego Souza', 'equipe', 'desligado'),
  ],
  convite: [
    {
      id: 'cv1',
      email: 'gabriela@exemplo.test',
      papel: 'equipe',
      situacao: 'pendente',
      enviado_em: '2026-10-08T12:00:00Z',
      expira_em: '2999-10-15T12:00:00Z',
    },
    {
      id: 'cv2',
      email: 'rafael@exemplo.test',
      papel: 'equipe',
      situacao: 'pendente',
      enviado_em: '2026-09-28T12:00:00Z',
      expira_em: '2026-10-05T12:00:00Z',
    },
  ],
}

describe('tela Equipe (ACC-02, ACC-03)', () => {
  beforeEach(() => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        criar_convite: { data: [{ convite_id: 'novo', token: 'tok-1' }] },
        reenviar_convite: { data: 'tok-2' },
      },
      tabelas,
    })
  })

  it('Gestão vê membros (com "você" e desligado) e convites (com expirado)', async () => {
    renderizarApp('/configuracoes/equipe')

    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')
    expect(within(tabela).getByText('você')).toBeInTheDocument()
    expect(within(tabela).getByText('Desligado')).toBeInTheDocument()
    expect(within(tabela).getAllByText('03/02/2026')).toHaveLength(3)

    const convites = screen.getByRole('region', { name: 'Convites pendentes' })
    const tabelaConvites = await within(convites).findByRole('table')
    expect(within(tabelaConvites).getAllByText('Expirado')).toHaveLength(1)
  })

  it('a única Gestão não pode passar para Equipe nem se desligar, e o menu diz o motivo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Eduardo Karnopp' }))
    const menu = await screen.findByRole('menu')
    for (const item of within(menu).getAllByRole('menuitem')) {
      expect(item).toHaveAttribute('aria-disabled', 'true')
    }
    expect(
      within(menu).getAllByText('A consultoria precisa de pelo menos uma pessoa na Gestão.'),
    ).toHaveLength(2)
  })

  it('convidar chama a RPC e manda o e-mail com o link do convite', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')

    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convidar pessoa' })
    expect(within(dialogo).getByText('O convite vale por 7 dias.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('radio', { name: 'Equipe' })).toBeChecked()

    await usuario.type(within(dialogo).getByLabelText('E-mail'), 'nova@exemplo.test')
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Gestão' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))

    expect(await screen.findByText('Convite enviado para nova@exemplo.test.')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_convite', {
      p_consultoria_id: 'c-Filtroville',
      p_email: 'nova@exemplo.test',
      p_papel: 'gestao',
    })
    expect(falso.cliente.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'nova@exemplo.test',
      options: {
        emailRedirectTo: `${window.location.origin}/convite?token=tok-1`,
        shouldCreateUser: true,
      },
    })
  })

  it('desligar pede confirmação e chama a RPC', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })

    await usuario.click(
      within(await within(membros).findByRole('table')).getByRole('button', {
        name: 'Ações de Ana Ribeiro',
      }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Desligar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Desligar Ana Ribeiro' })
    expect(within(dialogo).getByText('Nada é apagado nem cancelado.')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desligar' }))

    expect(
      await screen.findByText('Acesso de Ana Ribeiro à Filtroville encerrado.'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('desligar_membro', { p_membro_id: 'ana' })
  })

  it('reenviar gera token novo e manda outro e-mail', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const convites = await screen.findByRole('region', { name: 'Convites pendentes' })
    await usuario.click(
      within(await within(convites).findByRole('table')).getByRole('button', {
        name: 'Reenviar convite para rafael@exemplo.test',
      }),
    )
    expect(
      await screen.findByText('Convite reenviado para rafael@exemplo.test.'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('reenviar_convite', { p_convite_id: 'cv2' })
  })

  it('Equipe não vê o item "Equipe" no menu e, pelo endereço, recebe "sem permissão"', async () => {
    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
      tabelas,
    })
    renderizarApp('/configuracoes/equipe')

    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(menu).queryByRole('link', { name: 'Equipe' })).toBeNull()
    expect(within(menu).getByRole('link', { name: 'Calendário' })).toBeInTheDocument()
    expect(falso.cliente.from).not.toHaveBeenCalled()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/configuracoes/equipe')
    await screen.findByRole('region', { name: 'Convites pendentes' })
    await screen.findAllByText('gabriela@exemplo.test')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
