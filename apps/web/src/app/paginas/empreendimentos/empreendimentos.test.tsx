import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ana = sessaoDe('ana@filtroville.test', 'Ana Ribeiro')

function linha(id: string, nome: string, cliente: string | null, unidades: number, total: number) {
  return {
    id,
    nome,
    cliente_nome: cliente,
    cnpj: null,
    unidades,
    criado_em: '2026-10-01T12:00:00Z',
    total,
  }
}

const carteira = [
  linha('e1', 'Metalúrgica Rio Cubatão', 'Rio Cubatão Participações Ltda.', 2, 2),
  linha('e2', 'Transportes Itapocu', null, 1, 2),
]

function cenario(extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: ana,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      listar_empreendimentos: { data: carteira },
      empreendimentos_parecidos: { data: [] },
      criar_empreendimento: (args) => ({ data: args.p_id }),
      ...extra.rpc,
    },
    tabelas: {
      empreendimento: [
        {
          id: 'e1',
          nome: 'Metalúrgica Rio Cubatão',
          cnpj: '12345678000190',
          cliente: { nome: 'Rio Cubatão Participações Ltda.' },
        },
      ],
      unidade: [
        { id: 'u1', nome: 'Matriz', endereco: 'Rua Dona Francisca, 8300, Joinville' },
        { id: 'u2', nome: 'Filial Distrito Industrial', endereco: null },
      ],
      ...extra.tabelas,
    },
  }
}

describe('carteira de empreendimentos (EMP-01)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('lista com cliente "Não informado", unidades e o total', async () => {
    renderizarApp('/empreendimentos')
    const tabela = await screen.findByRole('table')
    const linhas = within(tabela).getAllByRole('row')
    expect(linhas).toHaveLength(3)
    expect(
      within(within(tabela).getByRole('row', { name: /Transportes Itapocu/ })).getByText(
        'Não informado',
      ),
    ).toBeInTheDocument()
    expect(within(tabela).getAllByText('Sem licença')).toHaveLength(2)
    expect(screen.getByText('2 empreendimentos')).toBeInTheDocument()
  })

  it('busca vai para o servidor e mostra "nada encontrado"', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          listar_empreendimentos: (args) => ({ data: args.p_busca ? [] : carteira }),
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos')
    await screen.findByRole('table')

    await usuario.type(screen.getByLabelText('Buscar empreendimentos'), 'zzz')
    expect(await screen.findByText('Nenhum empreendimento encontrado')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_empreendimentos',
      expect.objectContaining({ p_busca: 'zzz' }) as unknown,
    )
  })

  it('carteira vazia mostra o estado vazio com a ação', async () => {
    falso.reiniciar(cenario({ rpc: { listar_empreendimentos: { data: [] } } }))
    renderizarApp('/empreendimentos')
    expect(await screen.findByText('Nenhum empreendimento ainda')).toBeInTheDocument()
  })

  it('Equipe cria: só o nome é obrigatório, CNPJ incompleto é recusado, e abre a tela nova', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos')

    await usuario.click(await screen.findByRole('button', { name: 'Novo empreendimento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo empreendimento' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe o nome do empreendimento')).toBeInTheDocument()

    await usuario.type(
      within(dialogo).getByLabelText('Nome do empreendimento'),
      'Cerâmica Pirabeiraba',
    )
    await usuario.type(within(dialogo).getByLabelText('CNPJ'), '1234567800')
    expect(within(dialogo).getByLabelText('CNPJ')).toHaveValue('12.345.678/00')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('CNPJ incompleto')).toBeInTheDocument()

    await usuario.type(within(dialogo).getByLabelText('CNPJ'), '0190')
    await usuario.type(within(dialogo).getByLabelText('Primeira unidade'), 'Matriz')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Empreendimento criado.')).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/empreendimentos\/[0-9a-f-]{36}$/)
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_empreendimento',
      expect.objectContaining({
        p_consultoria_id: 'c-Filtroville',
        p_nome: 'Cerâmica Pirabeiraba',
        p_cnpj: '12.345.678/0001-90',
        p_primeira_unidade: 'Matriz',
      }) as unknown,
    )
  })

  it('nome repetido avisa sem bloquear: "Criar mesmo assim" cria', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          empreendimentos_parecidos: {
            data: [
              { id: 'e1', nome: 'Metalúrgica Rio Cubatão', mesmo_nome: true, mesmo_cnpj: false },
            ],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos')

    await usuario.click(await screen.findByRole('button', { name: 'Novo empreendimento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo empreendimento' })
    await usuario.type(
      within(dialogo).getByLabelText('Nome do empreendimento'),
      'metalurgica rio cubatao',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(
      await within(dialogo).findByText('Já existe Metalúrgica Rio Cubatão com este nome.'),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('criar_empreendimento', expect.anything())
    expect(within(dialogo).getByRole('button', { name: 'Abrir o existente' })).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar mesmo assim' }))
    expect(await screen.findByText('Empreendimento criado.')).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/empreendimentos')
    await screen.findByRole('table')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('tela do empreendimento (EMP-02)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra cabeçalho com cliente e CNPJ, filtro por unidade e licenças vazias', async () => {
    renderizarApp('/empreendimentos/e1')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Metalúrgica Rio Cubatão' }),
    ).toBeInTheDocument()
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument()
    expect(screen.getByText('Rio Cubatão Participações Ltda.')).toBeInTheDocument()

    const filtro = screen.getByRole('group', { name: 'Filtrar por unidade' })
    expect(
      await within(filtro).findByRole('button', { name: /Filial Distrito Industrial/ }),
    ).toBeInTheDocument()
    expect(within(filtro).getByRole('button', { name: /Todos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    expect(screen.getByText('Nenhuma licença cadastrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para Empreendimentos' })).toHaveAttribute(
      'href',
      '/empreendimentos',
    )
  })

  it('gerenciar unidades lista, mostra endereço ausente e adiciona', async () => {
    falso.reiniciar(cenario({ rpc: { criar_unidade: (args) => ({ data: args.p_id }) } }))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    await usuario.click(await screen.findByRole('button', { name: 'Gerenciar unidades' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Unidades' })
    expect(within(dialogo).getByText('Endereço não informado')).toBeInTheDocument()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Adicionar unidade' }))
    const form = within(dialogo).getByRole('form', { name: 'Nova unidade' })
    await usuario.click(within(form).getByRole('button', { name: 'Salvar unidade' }))
    expect(await within(form).findByText('Informe o nome da unidade')).toBeInTheDocument()

    await usuario.type(within(form).getByLabelText('Nome da unidade'), 'Filial Norte')
    await usuario.click(within(form).getByRole('button', { name: 'Salvar unidade' }))

    expect(
      await within(dialogo).findByRole('button', { name: 'Adicionar unidade' }),
    ).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_unidade',
      expect.objectContaining({
        p_empreendimento_id: 'e1',
        p_nome: 'Filial Norte',
        p_endereco: '',
      }) as unknown,
    )
  })

  it('empreendimento de outra consultoria (ou inexistente) aparece como não encontrado', async () => {
    falso.reiniciar(cenario({ tabelas: { empreendimento: [] } }))
    renderizarApp('/empreendimentos/outro')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Empreendimento não encontrado' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ele não existe ou não é da Filtroville.')).toBeInTheDocument()
  })
})
