import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      options: { data: { nome: 'Carla Menezes' }, emailRedirectTo: `${window.location.origin}/` },
    })
  })

  it('conta sem vínculo cai em "Escolher consultoria" e cria a primeira', async () => {
    let vinculos: unknown[] = []
    falso.reiniciar({
      sessao: sessaoDe('carla@exemplo.test', 'Carla Menezes'),
      rpc: {
        meus_vinculos: () => ({ data: vinculos }),
        criar_consultoria: (args) => {
          vinculos = [vinculoFalso('Ecossis', 'gestao')]
          return { data: args.p_id }
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

    await usuario.type(screen.getByLabelText('Nome da consultoria'), 'Ecossis')
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
    await usuario.type(screen.getByLabelText('Senha'), 'senha-boa-1')
    await usuario.type(screen.getByLabelText('Repita a senha'), 'senha-boa-1')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Visão da equipe' }),
    ).toBeInTheDocument()
    expect(falso.cliente.auth.updateUser).toHaveBeenCalledWith({
      password: 'senha-boa-1',
      data: { nome: 'Carla Menezes' },
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
