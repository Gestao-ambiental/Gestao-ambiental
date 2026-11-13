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
    // Profissão e cargo continuam editáveis (ADR-0021); papel e desligamento, não.
    for (const item of within(menu).getAllByRole('menuitem')) {
      if (item.textContent === 'Profissão e cargo')
        expect(item).not.toHaveAttribute('aria-disabled')
      else expect(item).toHaveAttribute('aria-disabled', 'true')
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
    // Só o próprio vínculo é lido (o cadastro completo, antes do sistema, e a foto do menu da
    // conta); a tela não carrega equipe nem convites.
    expect(falso.cliente.from.mock.calls).toEqual([['membro'], ['membro']])
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/configuracoes/equipe')
    await screen.findByRole('region', { name: 'Convites pendentes' })
    await screen.findAllByText('gabriela@exemplo.test')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('profissão e cargo na Equipe (ADR-0021)', () => {
  beforeEach(() => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        definir_profissao_e_cargo: { data: null },
      },
      tabelas: {
        membro: [
          { ...membro('m-Filtroville', 'Eduardo Karnopp', 'gestao'), profissao: 'eng_ambiental' },
          { ...membro('ana', 'Ana Ribeiro', 'equipe'), cargo_antigo: 'Analista ambiental' },
        ],
        convite: [],
      },
    })
  })

  it('mostra profissão e cargo e a Gestão escolhe nas listas', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')
    expect(within(tabela).getByText('Engenheiro ambiental')).toBeInTheDocument()
    expect(within(tabela).getByText('Analista ambiental (cargo antigo)')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Ana Ribeiro' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Profissão e cargo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Profissão e cargo de Ana Ribeiro' })
    expect(within(dialogo).getByRole('combobox', { name: 'Cargo' })).toHaveDisplayValue(
      'Analista ambiental (antigo, escolha na lista)',
    )
    await usuario.selectOptions(
      within(dialogo).getByRole('combobox', { name: 'Profissão' }),
      'Biólogo',
    )
    await usuario.selectOptions(
      within(dialogo).getByRole('combobox', { name: 'Cargo' }),
      'Analista pleno',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'ana',
      p_profissao: 'biologo',
      p_cargo: 'analista_pleno',
      p_outras_profissoes: [],
      p_profissao_em_curso: false,
    })
    expect(await screen.findByText('Profissão e cargo de Ana Ribeiro salvos.')).toBeInTheDocument()
  })

  it('escreve a profissão no gênero de cada pessoa, também no diálogo (ADR-0021)', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
      tabelas: {
        membro: [
          {
            ...membro('m-Filtroville', 'Eduardo Karnopp', 'gestao'),
            profissao: 'eng_ambiental_sanitarista',
            genero: 'masculino',
          },
          {
            ...membro('helena', 'Helena Duarte', 'gestao'),
            profissao: 'eng_ambiental',
            outras_profissoes: ['biologo'],
            genero: 'feminino',
          },
          {
            ...membro('ana', 'Ana Ribeiro', 'equipe'),
            profissao: 'geologo',
            genero: 'nao_informar',
          },
        ],
        convite: [],
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')
    expect(within(tabela).getByText('Engenheiro ambiental e sanitarista')).toBeInTheDocument()
    expect(within(tabela).getByText('Engenheira ambiental · Bióloga')).toBeInTheDocument()
    expect(within(tabela).getByText('Geólogo(a)')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Helena Duarte' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Profissão e cargo' }))
    const dialogo = await screen.findByRole('dialog', {
      name: 'Profissão e cargo de Helena Duarte',
    })
    expect(within(dialogo).getByRole('combobox', { name: 'Profissão' })).toHaveDisplayValue(
      'Engenheira ambiental',
    )
    expect(within(dialogo).getByRole('listitem')).toHaveTextContent('Bióloga')
  })

  it('mostra as outras formações depois da principal e a Gestão tira e adiciona no diálogo', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        definir_profissao_e_cargo: { data: null },
      },
      tabelas: {
        membro: [
          membro('m-Filtroville', 'Eduardo Karnopp', 'gestao'),
          {
            ...membro('ana', 'Ana Ribeiro', 'equipe'),
            profissao: 'biologo',
            outras_profissoes: ['geologo', 'quimico'],
            cargo: 'analista_pleno',
          },
        ],
        convite: [],
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')
    expect(within(tabela).getByText('Biólogo · Geólogo · Químico')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Ana Ribeiro' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Profissão e cargo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Profissão e cargo de Ana Ribeiro' })
    const grupo = within(dialogo).getByRole('group', { name: 'Outras formações concluídas' })
    await usuario.click(within(grupo).getByRole('button', { name: 'Tirar Geólogo' }))
    await usuario.selectOptions(
      within(grupo).getByRole('combobox', { name: 'Adicionar outra formação' }),
      'Ecólogo',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'ana',
      p_profissao: 'biologo',
      p_cargo: 'analista_pleno',
      p_outras_profissoes: ['quimico', 'ecologo'],
      p_profissao_em_curso: false,
    })
  })

  it('formação em curso aparece como "Estudante de …" e a Gestão marca no diálogo', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        definir_profissao_e_cargo: { data: null },
      },
      tabelas: {
        membro: [
          membro('m-Filtroville', 'Eduardo Karnopp', 'gestao'),
          {
            ...membro('lia', 'Lia Souza', 'equipe'),
            profissao: 'eng_ambiental',
            profissao_em_curso: true,
            genero: 'feminino',
            cargo: 'estagiario',
          },
          {
            ...membro('ana', 'Ana Ribeiro', 'equipe'),
            profissao: 'biologo',
            outras_profissoes: ['geologo'],
            genero: 'feminino',
          },
        ],
        convite: [],
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/configuracoes/equipe')
    const membros = await screen.findByRole('region', { name: 'Membros' })
    const tabela = await within(membros).findByRole('table')
    expect(within(tabela).getByText('Estudante de engenharia ambiental')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Lia Souza' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Profissão e cargo' }))
    const dialogoLia = await screen.findByRole('dialog', { name: 'Profissão e cargo de Lia Souza' })
    expect(within(dialogoLia).getByRole('checkbox', { name: 'Ainda está cursando' })).toBeChecked()
    await usuario.click(within(dialogoLia).getByRole('button', { name: 'Cancelar' }))

    await usuario.click(within(tabela).getByRole('button', { name: 'Ações de Ana Ribeiro' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Profissão e cargo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Profissão e cargo de Ana Ribeiro' })
    await usuario.click(within(dialogo).getByRole('checkbox', { name: 'Ainda está cursando' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'ana',
      p_profissao: 'biologo',
      p_cargo: null,
      p_outras_profissoes: ['geologo'],
      p_profissao_em_curso: true,
    })
  })
})
