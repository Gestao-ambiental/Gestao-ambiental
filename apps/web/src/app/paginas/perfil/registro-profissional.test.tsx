import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

function cenario(membro: Record<string, unknown> = {}, registros: unknown[] = []): Cenario {
  return {
    sessao: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe', { membro_id: 'm-ana' })] },
      declarar_registro_profissional: { data: 'r-novo' },
      remover_registro_profissional: { data: null },
      definir_cadastro_federal: { data: null },
    },
    tabelas: {
      membro: [
        {
          id: 'm-ana',
          nome: 'Ana Ribeiro',
          papel: 'equipe',
          cargo: null,
          foto: null,
          profissao: 'biologo',
          outras_profissoes: ['eng_ambiental'],
          profissao_em_curso: false,
          genero: 'feminino',
          ...membro,
        },
      ],
      registro_profissional: registros,
    },
  }
}

const registroDaAna = {
  id: 'r-1',
  row_version: 2,
  membro_id: 'm-ana',
  profissao: 'biologo',
  conselho: 'crbio',
  numero: '12345',
  uf: 'SC',
  valido_ate: '2027-03-31',
  confirmado_em: '2026-11-10T12:00:00Z',
}

describe('meu perfil: registro profissional e Cadastro Técnico Federal', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('lista só as profissões concluídas e já sugere o conselho de cada uma', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const profissao = await screen.findByRole('combobox', { name: 'Profissão do registro' })
    expect(
      within(profissao)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha a profissão', 'Bióloga', 'Engenheira ambiental'])

    const conselho = screen.getByRole('combobox', { name: 'Conselho' })
    await usuario.selectOptions(profissao, 'Engenheira ambiental')
    expect(conselho).toHaveDisplayValue('Crea')
    await usuario.selectOptions(profissao, 'Bióloga')
    expect(conselho).toHaveDisplayValue('CRBio')
  })

  it('informa o registro e manda conselho, número, UF e validade para o banco', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await usuario.selectOptions(
      await screen.findByRole('combobox', { name: 'Profissão do registro' }),
      'Bióloga',
    )
    await usuario.type(screen.getByRole('textbox', { name: 'Número do registro' }), '12345')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'UF do registro' }), 'SC')
    await usuario.click(screen.getByRole('button', { name: 'Salvar registro' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith('declarar_registro_profissional', {
      p_membro_id: 'm-ana',
      p_profissao: 'biologo',
      p_conselho: 'crbio',
      p_numero: '12345',
      p_uf: 'SC',
      p_valido_ate: null,
    })
  })

  // Padrão de botões (23/11/2026): sem profissão escolhida não há o que salvar, então o botão não
  // aparece (antes ficava como secundário); depois de salvar, fica a confirmação.
  it('o Salvar registro só aparece com uma profissão escolhida', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const profissao = await screen.findByRole('combobox', { name: 'Profissão do registro' })
    expect(screen.queryByRole('button', { name: 'Salvar registro' })).not.toBeInTheDocument()
    await usuario.selectOptions(profissao, 'Bióloga')
    await usuario.type(screen.getByRole('textbox', { name: 'Número do registro' }), '12345')
    await usuario.click(screen.getByRole('button', { name: 'Salvar registro' }))
    expect(await screen.findByText('Registro salvo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar registro' })).not.toBeInTheDocument()
  })

  it('sem número, avisa no campo e não chama o banco', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await usuario.selectOptions(
      await screen.findByRole('combobox', { name: 'Profissão do registro' }),
      'Bióloga',
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar registro' }))

    expect(await screen.findByText('Informe o número do registro')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'declarar_registro_profissional',
      expect.anything(),
    )
  })

  it('mostra o registro salvo com a situação e permite remover', async () => {
    falso.reiniciar(cenario({}, [registroDaAna]))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    expect(await screen.findByText(/CRBio-SC 12345 · válido até 31\/03\/2027/)).toBeInTheDocument()
    expect(screen.getByText('Confirmado')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remover registro de Bióloga' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('remover_registro_profissional', {
      p_registro_id: 'r-1',
      p_row_version: 2,
    })
  })

  it('escolher uma profissão que já tem registro carrega o que está salvo', async () => {
    falso.reiniciar(cenario({}, [registroDaAna]))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await screen.findByText('Confirmado')
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Profissão do registro' }),
      'Bióloga',
    )
    expect(screen.getByRole('textbox', { name: 'Número do registro' })).toHaveValue('12345')
    expect(screen.getByRole('combobox', { name: 'UF do registro' })).toHaveDisplayValue('SC')
  })

  it('formação em curso sem registro salvo: a seção some', async () => {
    falso.reiniciar(cenario({ outras_profissoes: [], profissao_em_curso: true }))
    renderizarApp('/perfil')

    await screen.findByRole('heading', { name: 'Cadastro Técnico Federal' })
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Registro profissional' }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('combobox', { name: 'Profissão do registro' }),
    ).not.toBeInTheDocument()
  })

  it('salva o Cadastro Técnico Federal só quando muda', async () => {
    falso.reiniciar(cenario({ ctf_numero: '111', ctf_valido_ate: null }))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const numero = await screen.findByRole('textbox', { name: 'Número no cadastro' })
    expect(numero).toHaveValue('111')
    // Regra mudou de propósito (padrão de botões, 23/11/2026): sem alteração o botão não aparece
    // (antes ficava cinza e desabilitado).
    expect(screen.queryByRole('button', { name: 'Salvar cadastro' })).not.toBeInTheDocument()
    await usuario.clear(numero)
    await usuario.type(numero, '1234567')
    await usuario.click(screen.getByRole('button', { name: 'Salvar cadastro' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_cadastro_federal', {
      p_membro_id: 'm-ana',
      p_numero: '1234567',
      p_valido_ate: null,
    })
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(cenario({}, [registroDaAna]))
    const { container } = renderizarApp('/perfil')
    await screen.findByText('Confirmado')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
