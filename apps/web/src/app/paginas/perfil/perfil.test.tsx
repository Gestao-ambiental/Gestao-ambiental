import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

function cenario(membro: Record<string, unknown> = {}): Cenario {
  return {
    sessao: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe', { membro_id: 'm-ana' })] },
      definir_profissao_e_cargo: { data: null },
      definir_meu_genero: { data: null },
      registrar_foto_membro: (args) => ({ data: args.p_versao_id }),
      remover_foto_membro: { data: null },
    },
    tabelas: {
      membro: [
        { id: 'm-ana', nome: 'Ana Ribeiro', papel: 'equipe', cargo: null, foto: null, ...membro },
      ],
    },
  }
}

describe('meu perfil: foto, profissão e cargo', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('chega pelo menu da conta', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')
    await usuario.click(await screen.findByRole('button', { name: 'Conta de Ana Ribeiro' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Meu perfil' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/perfil')
    })
  })

  it('escolhe profissão e cargo nas listas, sem digitar (ADR-0021)', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const profissao = await screen.findByRole('combobox', { name: 'Profissão' })
    const salvar = screen.getByRole('button', { name: 'Salvar profissão e cargo' })
    expect(salvar).toBeDisabled()
    expect(screen.queryByRole('textbox', { name: 'Cargo' })).not.toBeInTheDocument()
    await usuario.selectOptions(profissao, 'Engenheiro ambiental')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Cargo' }), 'Estagiário')
    await usuario.click(salvar)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'm-ana',
      p_profissao: 'eng_ambiental',
      p_cargo: 'estagiario',
      p_outras_profissoes: [],
      p_profissao_em_curso: false,
    })
  })

  it('"Ainda estou cursando" fica junto da profissão e vai para o banco', async () => {
    falso.reiniciar(cenario({ profissao: 'eng_ambiental', cargo: 'estagiario' }))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const cursando = await screen.findByRole('checkbox', { name: 'Ainda estou cursando' })
    expect(cursando).not.toBeChecked()
    const salvar = screen.getByRole('button', { name: 'Salvar profissão e cargo' })
    expect(salvar).toBeDisabled()
    await usuario.click(cursando)
    expect(salvar).toBeEnabled()
    await usuario.click(salvar)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'm-ana',
      p_profissao: 'eng_ambiental',
      p_cargo: 'estagiario',
      p_outras_profissoes: [],
      p_profissao_em_curso: true,
    })
  })

  it('sem profissão, a caixa de "em curso" fica desabilitada', async () => {
    renderizarApp('/perfil')
    expect(await screen.findByRole('checkbox', { name: 'Ainda estou cursando' })).toBeDisabled()
  })

  it('formatura: desmarcar a caixa manda em curso falso', async () => {
    falso.reiniciar(cenario({ profissao: 'biologo', profissao_em_curso: true }))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const cursando = await screen.findByRole('checkbox', { name: 'Ainda estou cursando' })
    expect(cursando).toBeChecked()
    await usuario.click(cursando)
    await usuario.click(screen.getByRole('button', { name: 'Salvar profissão e cargo' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'definir_profissao_e_cargo',
      expect.objectContaining({ p_profissao: 'biologo', p_profissao_em_curso: false }),
    )
  })

  it('sem a profissão principal, não deixa adicionar outra formação', async () => {
    renderizarApp('/perfil')
    const adicionar = await screen.findByRole('combobox', { name: 'Adicionar outra formação' })
    expect(adicionar).toBeDisabled()
    expect(adicionar).toHaveDisplayValue('Escolha a profissão primeiro')
    // As ajudas cinza dos campos saíram.
    expect(screen.queryByText('No que a pessoa é formada.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Para o que foi contratada/)).not.toBeInTheDocument()
  })

  it('adiciona e tira outras formações concluídas e salva com a principal (ADR-0021)', async () => {
    falso.reiniciar(
      cenario({
        profissao: 'eng_ambiental',
        cargo: 'analista_pleno',
        outras_profissoes: ['biologo'],
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const grupo = await screen.findByRole('group', { name: 'Outras formações concluídas' })
    const itens = () =>
      within(grupo)
        .queryAllByRole('listitem')
        .map((item) => item.textContent)
    expect(itens()).toEqual(['Biólogo'])
    const salvar = screen.getByRole('button', { name: 'Salvar profissão e cargo' })
    expect(salvar).toBeDisabled()

    const adicionar = within(grupo).getByRole('combobox', { name: 'Adicionar outra formação' })
    expect(adicionar).toBeEnabled()
    // A principal e as já escolhidas não aparecem de novo.
    expect(
      within(adicionar).queryByRole('option', { name: 'Engenheiro ambiental' }),
    ).not.toBeInTheDocument()
    expect(within(adicionar).queryByRole('option', { name: 'Biólogo' })).not.toBeInTheDocument()
    await usuario.selectOptions(adicionar, 'Geólogo')
    expect(itens()).toEqual(['Biólogo', 'Geólogo'])
    expect(adicionar).toHaveDisplayValue('Adicionar outra formação')
    expect(salvar).toBeEnabled()

    await usuario.click(within(grupo).getByRole('button', { name: 'Tirar Biólogo' }))
    expect(itens()).toEqual(['Geólogo'])
    // A que saiu volta a poder ser adicionada.
    expect(within(adicionar).getByRole('option', { name: 'Biólogo' })).toBeInTheDocument()

    await usuario.click(salvar)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'm-ana',
      p_profissao: 'eng_ambiental',
      p_cargo: 'analista_pleno',
      p_outras_profissoes: ['geologo'],
      p_profissao_em_curso: false,
    })
  })

  it('a própria pessoa escolhe o gênero e a profissão passa a ser escrita nele (ADR-0021)', async () => {
    falso.reiniciar(cenario({ profissao: 'eng_ambiental', genero: 'masculino' }))
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    const grupo = await screen.findByRole('group', { name: 'Gênero' })
    expect(within(grupo).getByRole('radio', { name: 'Masculino' })).toBeChecked()
    const salvar = screen.getByRole('button', { name: 'Salvar gênero' })
    expect(salvar).toBeDisabled()
    const profissao = screen.getByRole('combobox', { name: 'Profissão' })
    expect(profissao).toHaveDisplayValue('Engenheiro ambiental')

    await usuario.click(within(grupo).getByRole('radio', { name: 'Feminino' }))
    expect(profissao).toHaveDisplayValue('Engenheira ambiental')
    await usuario.click(salvar)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_meu_genero', { p_genero: 'feminino' })
    // Gênero não vai junto da profissão e do cargo.
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith(
      'definir_profissao_e_cargo',
      expect.anything(),
    )
  })

  it('cargo digitado antes aparece como antigo até escolher um da lista', async () => {
    falso.reiniciar(cenario({ cargo_antigo: 'Analista ambiental' }))
    renderizarApp('/perfil')
    const cargo = await screen.findByRole('combobox', { name: 'Cargo' })
    expect(cargo).toHaveDisplayValue('Analista ambiental (antigo, escolha na lista)')
  })

  it('envia a foto como objeto novo e registra a versão', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await screen.findByRole('button', { name: 'Enviar foto' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(entrada, new File(['png'], 'ana.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'registrar_foto_membro',
        expect.objectContaining({
          p_membro_id: 'm-ana',
          p_nome_original: 'ana.png',
          p_caminho: expect.stringMatching(
            /^c-Filtroville\/membro\/[0-9a-f-]{36}\.png$/,
          ) as unknown,
        }) as unknown,
      )
    })
  })

  it('recusa imagem acima de 2 MB antes do envio', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await screen.findByRole('button', { name: 'Enviar foto' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    const grande = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', {
      type: 'image/png',
    })
    await usuario.upload(entrada, grande)

    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem passa de 2 MB.')
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('registrar_foto_membro', expect.anything())
  })

  it('com foto: mostra a imagem e permite tirar', async () => {
    falso.reiniciar(
      cenario({
        cargo: 'analista_pleno',
        foto: { excluido_em: null, versao: { caminho: 'c-Filtroville/membro/f1.png' } },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/perfil')

    await usuario.click(await screen.findByRole('button', { name: 'Tirar foto' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('remover_foto_membro', { p_membro_id: 'm-ana' })
    expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument()
    expect(
      document.querySelector('img[src="https://falso.test/c-Filtroville/membro/f1.png"]'),
    ).not.toBeNull()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/perfil')
    await screen.findByRole('combobox', { name: 'Cargo' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
