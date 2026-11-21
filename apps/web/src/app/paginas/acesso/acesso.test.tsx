import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

describe('entrar e sair (ACC-01)', () => {
  beforeEach(() => {
    falso.reiniciar({
      sessaoAoEntrar: eduardo,
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
    })
  })

  it('sem sessão, rota do app leva para /entrar e volta para ela depois do login', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/calendario')

    await screen.findByRole('heading', { level: 1, name: 'Entrar no Grama' })
    expect(router.state.location.pathname).toBe('/entrar')

    await usuario.type(screen.getByLabelText('E-mail'), 'eduardo@filtroville.test')
    await usuario.type(screen.getByLabelText('Senha'), 'grama-dev-123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
  })

  it('enviar vazio mostra o erro em cada campo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/entrar')
    await usuario.click(await screen.findByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Informe o e-mail')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(falso.cliente.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('credencial errada: mensagem genérica, senha limpa e e-mail mantido', async () => {
    falso.reiniciar({ entrar: { error: { code: 'invalid_credentials', status: 400 } } })
    const usuario = userEvent.setup()
    renderizarApp('/entrar')

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@filtroville.test')
    await usuario.type(screen.getByLabelText('Senha'), 'errada-123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
    expect(screen.getByLabelText('Senha')).toHaveValue('')
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@filtroville.test')
  })

  it('limite do Auth (429) mostra "Muitas tentativas"', async () => {
    falso.reiniciar({ entrar: { error: { code: 'over_request_rate_limit', status: 429 } } })
    const usuario = userEvent.setup()
    renderizarApp('/entrar')

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@filtroville.test')
    await usuario.type(screen.getByLabelText('Senha'), 'qualquer-1')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas seguidas')
  })

  it('o olho mostra e esconde a senha', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/entrar')
    const senha = await screen.findByLabelText('Senha')
    expect(senha).toHaveAttribute('type', 'password')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument()
  })

  it('Sair encerra a sessão e volta para /entrar', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
    })
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')

    await usuario.click(await screen.findByRole('button', { name: 'Conta de Eduardo Karnopp' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Sair' }))

    await screen.findByRole('heading', { level: 1, name: 'Entrar no Grama' })
    expect(router.state.location.pathname).toBe('/entrar')
    expect(falso.cliente.auth.signOut).toHaveBeenCalled()
    expect(screen.queryByText('Sua sessão terminou. Entre de novo para continuar.')).toBeNull()
  })

  it('sessão que acaba sem pedir mostra o aviso no login', async () => {
    falso.reiniciar({
      sessao: eduardo,
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
    })
    renderizarApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' })

    falso.expirarSessao()

    expect(
      await screen.findByText('Sua sessão terminou. Entre de novo para continuar.'),
    ).toBeInTheDocument()
  })
})

describe('recuperar senha (ACC-01)', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('confirma o envio sem revelar se a conta existe', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/recuperar-senha')

    await usuario.type(await screen.findByLabelText('E-mail'), 'quem@exemplo.test')
    await usuario.click(screen.getByRole('button', { name: 'Enviar link' }))

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(/Se houver uma conta com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reenviar em/ })).toBeDisabled()
    expect(falso.cliente.auth.resetPasswordForEmail).toHaveBeenCalledWith('quem@exemplo.test', {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
  })

  it('aberto sem link válido, avisa que expirou e oferece outro', async () => {
    renderizarApp('/redefinir-senha')
    expect(await screen.findByText('Este link expirou ou já foi usado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })
})

describe('criar conta e consultoria (ACC-01, ACC-02)', () => {
  it('criar conta pede confirmação do e-mail', async () => {
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/criar-conta')

    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Menezes')
    await usuario.type(screen.getByLabelText('E-mail'), 'carla@exemplo.test')
    await usuario.click(screen.getByRole('radio', { name: 'Feminino' }))
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Formação' }),
      'Engenheira ambiental',
    )
    await usuario.type(screen.getByLabelText('Senha'), 'senha-boa-1')
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-2')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument()

    await usuario.clear(screen.getByLabelText('Repita a senha'))
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-1')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(falso.cliente.auth.signUp).toHaveBeenCalledWith({
      email: 'carla@exemplo.test',
      password: 'senha-boa-1',
      options: {
        data: {
          nome: 'Carla Menezes',
          profissao: 'eng_ambiental',
          genero: 'feminino',
          profissao_em_curso: false,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
  })

  it('criar conta com "Ainda estou cursando" manda a formação como em curso', async () => {
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/criar-conta')

    await usuario.type(await screen.findByLabelText('Nome'), 'Lia Souza')
    await usuario.type(screen.getByLabelText('E-mail'), 'lia@exemplo.test')
    await usuario.click(screen.getByRole('radio', { name: 'Feminino' }))
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Formação' }),
      'Engenheira ambiental',
    )
    const cursando = screen.getByRole('checkbox', { name: 'Ainda estou cursando' })
    expect(cursando).not.toBeChecked()
    await usuario.click(cursando)
    await usuario.type(screen.getByLabelText('Senha'), 'senha-boa-1')
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-1')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(falso.cliente.auth.signUp).toHaveBeenCalledWith({
      email: 'lia@exemplo.test',
      password: 'senha-boa-1',
      options: {
        data: {
          nome: 'Lia Souza',
          profissao: 'eng_ambiental',
          genero: 'feminino',
          profissao_em_curso: true,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
  })

  it('criar conta exige gênero e formação, com o erro ligado a cada campo', async () => {
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/criar-conta')

    await usuario.type(await screen.findByLabelText('Nome'), 'Carla Menezes')
    await usuario.type(screen.getByLabelText('E-mail'), 'carla@exemplo.test')
    await usuario.type(screen.getByLabelText('Senha'), 'senha-boa-1')
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-1')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText('Escolha o gênero')).toBeInTheDocument()
    const grupo = screen.getByRole('group', { name: 'Gênero' })
    for (const opcao of within(grupo).getAllByRole('radio')) {
      expect(opcao).toHaveAttribute('aria-invalid', 'true')
      expect(opcao).toHaveAccessibleDescription('Escolha o gênero')
    }
    const formacao = screen.getByRole('combobox', { name: 'Formação' })
    expect(formacao).toHaveAttribute('aria-invalid', 'true')
    expect(formacao).toHaveAccessibleDescription('Escolha a formação')
    expect(falso.cliente.auth.signUp).not.toHaveBeenCalled()

    // Ordem: nome, e-mail, gênero, formação, senha.
    const campos = [
      screen.getByLabelText('Nome'),
      screen.getByLabelText('E-mail'),
      screen.getByRole('radio', { name: 'Feminino' }),
      formacao,
      screen.getByLabelText('Senha'),
    ]
    campos.slice(1).forEach((campo, i) => {
      expect(campos[i]?.compareDocumentPosition(campo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  it('a formação muda de rótulo conforme o gênero', async () => {
    falso.reiniciar({})
    const usuario = userEvent.setup()
    renderizarApp('/criar-conta')

    const formacao = await screen.findByRole('combobox', { name: 'Formação' })
    expect(within(formacao).getByRole('option', { name: 'Engenheiro ambiental' })).toBeTruthy()

    await usuario.click(screen.getByRole('radio', { name: 'Feminino' }))
    expect(within(formacao).getByRole('option', { name: 'Engenheira ambiental' })).toBeTruthy()
    await usuario.selectOptions(formacao, 'Bióloga')

    // A escolha continua; só o texto muda.
    await usuario.click(screen.getByRole('radio', { name: 'Prefiro não dizer' }))
    expect(formacao).toHaveDisplayValue('Biólogo(a)')
    expect(within(formacao).getByRole('option', { name: 'Engenheiro(a) ambiental' })).toBeTruthy()
    await usuario.click(screen.getByRole('radio', { name: 'Masculino' }))
    expect(formacao).toHaveDisplayValue('Biólogo')
  })

  it('criar conta com erros não tem violações detectáveis pelo axe', async () => {
    falso.reiniciar({})
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/criar-conta')
    await usuario.click(await screen.findByRole('button', { name: 'Criar conta' }))
    await screen.findByText('Escolha o gênero')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('conta sem vínculo cai em "Escolher consultoria" e cria a primeira', async () => {
    let vinculos: unknown[] = []
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        meus_vinculos: () => ({ data: vinculos }),
        abrir_consultoria: (args) => {
          vinculos = [vinculoFalso('Ecossis', 'gestao')]
          return { data: [{ consultoria_id: args.p_id, acesso: 'beta' }] }
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/')

    expect(
      await screen.findByText(
        'Você não participa de nenhuma consultoria. Peça um convite à gestão ou crie uma consultoria.',
      ),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Criar consultoria' }))

    await usuario.click(await screen.findByRole('button', { name: 'Criar consultoria' }))
    expect(await screen.findByText('Informe o nome da consultoria')).toBeInTheDocument()
    expect(screen.getByText('Informe o CNPJ')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Nome da consultoria'), 'Ecossis')
    await usuario.type(screen.getByLabelText('CNPJ'), '11222333000182')
    await usuario.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(await screen.findByText('CNPJ inválido')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('abrir_consultoria', expect.anything())

    await usuario.clear(screen.getByLabelText('CNPJ'))
    await usuario.type(screen.getByLabelText('CNPJ'), '11222333000181')
    expect(screen.getByLabelText('CNPJ')).toHaveValue('11.222.333/0001-81')
    await usuario.click(screen.getByRole('button', { name: 'Criar consultoria' }))

    expect(
      await screen.findByRole('heading', { name: 'Boas-vindas à Ecossis' }),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Fazer isso depois' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Consultoria: Ecossis' })).toBeInTheDocument()
  })

  it('sem convite do beta, mostra o motivo e leva à lista de espera do site', async () => {
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        meus_vinculos: { data: [] },
        abrir_consultoria: { error: { message: 'convite_do_beta_obrigatorio' } },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/criar-consultoria')
    await usuario.type(await screen.findByLabelText('Nome da consultoria'), 'Ecossis')
    await usuario.type(screen.getByLabelText('CNPJ'), '11.222.333/0001-81')
    await usuario.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Falta o convite do beta')
    expect(within(alerta).getByRole('link', { name: 'Entrar na lista de espera' })).toHaveAttribute(
      'href',
      'https://gramaapp.com.br/',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith('abrir_consultoria', {
      p_id: expect.any(String) as unknown,
      p_nome: 'Ecossis',
      p_cnpj: '11.222.333/0001-81',
    })
  })

  it('quem já usou o teste abre a consultoria e vai direto para o plano', async () => {
    let vinculos: unknown[] = []
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        meus_vinculos: () => ({ data: vinculos }),
        abrir_consultoria: (args) => {
          vinculos = [vinculoFalso('Ecossis', 'gestao')]
          return { data: [{ consultoria_id: args.p_id, acesso: 'sem_teste' }] }
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/criar-consultoria')
    await usuario.type(await screen.findByLabelText('Nome da consultoria'), 'Ecossis')
    await usuario.type(screen.getByLabelText('CNPJ'), '11222333000181')
    await usuario.click(screen.getByRole('button', { name: 'Criar consultoria' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configurações' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plano e cobrança' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('heading', { name: 'Boas-vindas à Ecossis' })).not.toBeInTheDocument()
  })
  it('criar consultoria com logo grava a razão social e envia o logo para as propostas', async () => {
    let vinculos: unknown[] = []
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        meus_vinculos: () => ({ data: vinculos }),
        abrir_consultoria: (args) => {
          vinculos = [vinculoFalso('Ecossis', 'gestao')]
          return { data: [{ consultoria_id: args.p_id, acesso: 'beta' }] }
        },
        salvar_identidade_da_consultoria: { data: 1 },
        registrar_logo_da_consultoria: { data: null },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/criar-consultoria')

    await usuario.type(await screen.findByLabelText('Nome da consultoria'), 'Ecossis')
    await usuario.type(screen.getByLabelText('CNPJ'), '11222333000181')
    const arquivo = new File(['logo'], 'logo.png', { type: 'image/png' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('sem campo de arquivo')
    await usuario.upload(entrada, arquivo)
    expect(screen.getByText('logo.png')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Criar consultoria' }))

    expect(
      await screen.findByRole('heading', { name: 'Boas-vindas à Ecossis' }),
    ).toBeInTheDocument()
    const identidade = falso.cliente.rpc.mock.calls.find(
      ([nome]) => nome === 'salvar_identidade_da_consultoria',
    )
    expect(identidade?.[1]).toMatchObject({
      p_row_version: 0,
      p_dados: { razao_social: 'Ecossis' },
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'registrar_logo_da_consultoria',
      expect.objectContaining({ p_nome_original: 'logo.png' }),
    )
    expect(screen.queryByText('O logo não foi enviado.')).not.toBeInTheDocument()
  })
})

describe('escolher e trocar de consultoria (ACC-04)', () => {
  const carla = sessaoDe('carla@exemplo.test', 'Carla Menezes')

  it('com dois vínculos ativos pede a escolha; encerrado fica desabilitado', async () => {
    falso.reiniciar({
      sessao: carla,
      rpc: {
        meus_vinculos: {
          data: [
            vinculoFalso('Filtroville', 'equipe'),
            vinculoFalso('Verdeplan', 'gestao'),
            vinculoFalso('Ecossis', 'equipe', {
              situacao: 'desligado',
              desligado_em: '2026-09-02T15:00:00Z',
            }),
          ],
        },
      },
    })
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')

    const lista = await screen.findByRole('list', { name: 'Suas consultorias' })
    expect(router.state.location.pathname).toBe('/escolher-consultoria')
    expect(
      screen.getByText('Você participa de 2 consultorias. Escolha onde quer trabalhar agora.'),
    ).toBeInTheDocument()
    expect(within(lista).getByRole('button', { name: /Ecossis/ })).toBeDisabled()
    expect(within(lista).getByText('Acesso encerrado em 02/09/2026')).toBeInTheDocument()

    await usuario.click(within(lista).getByRole('button', { name: /Verdeplan/ }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Consultoria: Verdeplan. Trocar consultoria' })[0],
    ).toBeInTheDocument()
  })

  it('consultoria atual encerrada pela gestão, sem outra: sai e avisa no login', async () => {
    window.localStorage.setItem(`grama:consultoria:${carla.user.id}`, 'c-Filtroville')
    falso.reiniciar({
      sessao: carla,
      rpc: {
        meus_vinculos: {
          data: [
            vinculoFalso('Filtroville', 'equipe', {
              situacao: 'desligado',
              desligado_em: '2026-10-17T12:00:00Z',
            }),
          ],
        },
      },
    })
    const { router } = renderizarApp('/')

    expect(await screen.findByText('Seu acesso à Filtroville foi encerrado.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(falso.cliente.auth.signOut).toHaveBeenCalled()
  })
})

describe('convite (ACC-02)', () => {
  const pendente = {
    consultoria_nome: 'Filtroville',
    consultoria_fuso: 'America/Sao_Paulo',
    convidado_por_nome: 'Ana Ribeiro',
    email: 'carla@exemplo.test',
    papel: 'equipe',
    situacao: 'pendente',
    expira_em: '2026-10-24T12:00:00Z',
    conta_com_senha: true,
  }

  it('sem login e com conta: mostra quem convidou e "Entrar e aceitar"', async () => {
    falso.reiniciar({ rpc: { consultar_convite: { data: [pendente] } } })
    renderizarApp('/convite?token=abc')

    expect(await screen.findByText(/convidou você para a/)).toHaveTextContent(
      'Ana Ribeiro convidou você para a Filtroville como Equipe.',
    )
    expect(screen.getByRole('link', { name: 'Entrar e aceitar' })).toHaveAttribute(
      'href',
      `/entrar?para=${encodeURIComponent('/convite?token=abc&aceitar=1')}`,
    )
  })

  it('logado com a conta do convite e sem senha: cria a senha e aceita', async () => {
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        consultar_convite: { data: [{ ...pendente, conta_com_senha: false }] },
        aceitar_convite: { data: 'c-Filtroville' },
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/convite?token=abc')

    expect(await screen.findByLabelText('E-mail')).toHaveValue('carla@exemplo.test')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))
    expect(await screen.findByText('Escolha o gênero')).toBeInTheDocument()
    expect(screen.getByText('Escolha a formação')).toBeInTheDocument()
    expect(falso.cliente.auth.updateUser).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('radio', { name: 'Masculino' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Formação' }), 'Biólogo')
    await usuario.type(screen.getByLabelText('Senha'), 'senha-boa-1')
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-1')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(falso.cliente.auth.updateUser).toHaveBeenCalledWith({
      password: 'senha-boa-1',
      data: {
        nome: 'Carla Menezes',
        profissao: 'biologo',
        genero: 'masculino',
        profissao_em_curso: false,
      },
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('aceitar_convite', { p_token: 'abc' })
  })

  it('aberto por outra conta: pede para sair e continuar', async () => {
    falso.reiniciar({
      sessao: sessaoDe('bruno@exemplo.test', 'Bruno Kist'),
      rpc: { consultar_convite: { data: [pendente] } },
    })
    renderizarApp('/convite?token=abc')
    expect(await screen.findByText(/mas o convite é para/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair e continuar' })).toBeInTheDocument()
  })

  it('expirado mostra a data no fuso da consultoria', async () => {
    falso.reiniciar({
      rpc: {
        consultar_convite: {
          data: [{ ...pendente, situacao: 'expirado', expira_em: '2026-10-05T02:00:00Z' }],
        },
      },
    })
    renderizarApp('/convite?token=abc')
    expect(
      await screen.findByText(
        'Este convite expirou em 04/10/2026. Peça um novo à gestão da Filtroville.',
      ),
    ).toBeInTheDocument()
  })

  it('token desconhecido: já usado ou cancelado', async () => {
    falso.reiniciar({ rpc: { consultar_convite: { data: [] } } })
    renderizarApp('/convite?token=zzz')
    expect(
      await screen.findByText('Este convite já foi usado ou foi cancelado.'),
    ).toBeInTheDocument()
  })
})

describe('complete seu cadastro (ADR-0021)', () => {
  const cenario = (cadastro: {
    profissao: string | null
    genero: string | null
    profissao_em_curso?: boolean
  }) => ({
    sessao: eduardo,
    cadastro,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      completar_cadastro: { data: null },
    },
  })

  it('conta sem formação pede formação e gênero antes do sistema e libera ao salvar', async () => {
    falso.reiniciar(cenario({ profissao: null, genero: 'feminino' }))
    const usuario = userEvent.setup()
    renderizarApp('/calendario')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull()
    // O que já existe vem preenchido.
    expect(screen.getByRole('radio', { name: 'Feminino' })).toBeChecked()

    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByText('Escolha a formação')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('completar_cadastro', expect.anything())

    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Formação' }),
      'Engenheira ambiental',
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('completar_cadastro', {
      p_profissao: 'eng_ambiental',
      p_genero: 'feminino',
      p_em_curso: false,
    })
  })

  it('"Ainda estou cursando" vai para o banco ao completar o cadastro', async () => {
    falso.reiniciar(cenario({ profissao: null, genero: 'masculino' }))
    const usuario = userEvent.setup()
    renderizarApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' })
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Formação' }),
      'Engenheiro ambiental',
    )
    await usuario.click(screen.getByRole('checkbox', { name: 'Ainda estou cursando' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('completar_cadastro', {
      p_profissao: 'eng_ambiental',
      p_genero: 'masculino',
      p_em_curso: true,
    })
  })

  it('a caixa vem marcada quando a formação já está em curso', async () => {
    falso.reiniciar(cenario({ profissao: 'biologo', genero: null, profissao_em_curso: true }))
    renderizarApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' })
    expect(screen.getByRole('checkbox', { name: 'Ainda estou cursando' })).toBeChecked()
  })

  it('conta sem gênero também para na tela, com a formação já escolhida', async () => {
    falso.reiniciar(cenario({ profissao: 'biologo', genero: null }))
    const usuario = userEvent.setup()
    renderizarApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' })
    const formacao = screen.getByRole('combobox', { name: 'Formação' })
    expect(formacao).toHaveDisplayValue('Biólogo')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByText('Escolha o gênero')).toBeInTheDocument()

    await usuario.click(screen.getByRole('radio', { name: 'Prefiro não dizer' }))
    expect(formacao).toHaveDisplayValue('Biólogo(a)')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('completar_cadastro', {
      p_profissao: 'biologo',
      p_genero: 'nao_informar',
      p_em_curso: false,
    })
  })

  it('erro do banco aparece e a pessoa continua na tela', async () => {
    falso.reiniciar({
      ...cenario({ profissao: null, genero: null }),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        completar_cadastro: { error: { message: 'genero_invalido' } },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' })
    await usuario.click(screen.getByRole('radio', { name: 'Masculino' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Formação' }), 'Geólogo')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o gênero.')
    expect(screen.getByRole('heading', { level: 1, name: 'Complete seu cadastro' })).toBeTruthy()
  })

  it('cadastro completo vai direto para o sistema', async () => {
    falso.reiniciar(cenario({ profissao: 'geologo', genero: 'masculino' }))
    renderizarApp('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Complete seu cadastro' })).toBeNull()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(cenario({ profissao: null, genero: null }))
    const { container } = renderizarApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Complete seu cadastro' })
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
