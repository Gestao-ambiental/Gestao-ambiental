import { screen, waitFor, within } from '@testing-library/react'
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
    // CNPJ ou CPF: CPF com dígito errado é recusado; até 11 dígitos a máscara é de CPF.
    const documento = within(dialogo).getByLabelText('CNPJ ou CPF')
    await usuario.type(documento, '52998224726')
    expect(documento).toHaveValue('529.982.247-26')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('CPF inválido')).toBeInTheDocument()

    await usuario.clear(documento)
    await usuario.type(documento, '1234567800')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('CNPJ ou CPF incompleto')).toBeInTheDocument()

    await usuario.type(documento, '0190')
    expect(documento).toHaveValue('12.345.678/0001-90')
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
    // Volta pelo cabeçalho da página (Pagina `voltar`), acima do título.
    const titulo = screen.getByRole('heading', { level: 1, name: 'Metalúrgica Rio Cubatão' })
    const cabecalho = titulo.closest('header')
    if (!cabecalho) throw new Error('cabeçalho ausente')
    expect(within(cabecalho).getByRole('link', { name: 'Empreendimentos' })).toHaveAttribute(
      'href',
      '/empreendimentos',
    )
  })

  it('gestão abre Novo orçamento pelo menu "…", já com o empreendimento; equipe não vê', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
          criar_orcamento: () => ({ error: { message: 'Failed to fetch' } }),
        },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/empreendimentos/e1')
    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Novo orçamento' }))
    // A rota pode carregar sob demanda: espera a navegação terminar.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/orcamentos/novo')
    })
    expect(router.state.location.search).toBe('?empreendimento=e1')
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith(
        'criar_orcamento',
        expect.objectContaining({ p_empreendimento_id: 'e1' }) as unknown,
      )
    })
  })

  it('equipe não vê o menu de orçamento no empreendimento', async () => {
    renderizarApp('/empreendimentos/e1')
    await screen.findByRole('heading', { level: 1, name: 'Metalúrgica Rio Cubatão' })
    expect(
      screen.queryByRole('button', { name: 'Mais ações do empreendimento' }),
    ).not.toBeInTheDocument()
  })

  it('rascunho mostra a linha de progresso do cadastro e continua no passo em que parou', async () => {
    const instrumento = (id: string, extra: Record<string, unknown>) => ({
      id,
      numero: '4821/2023',
      orgao: 'IMA',
      validade: '2027-02-15',
      criado_em: '2026-10-01T12:00:00Z',
      antecedencia_renovacao_dias: 30,
      unidade_id: 'u1',
      tipo_id: 't-lao',
      marco: 'assinatura',
      tipo: { sigla: 'LAO', nome: 'Licença Ambiental de Operação' },
      unidade: { nome: 'Matriz' },
      plano: null,
      condicionante: [{ count: 2 }],
      ...extra,
    })
    falso.reiniciar(
      cenario({
        rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
        tabelas: {
          instrumento: [
            instrumento('i1', { situacao: 'rascunho' }),
            instrumento('i2', { situacao: 'ativo', numero: '1000/2020' }),
          ],
          condicionante: [
            {
              instrumento_id: 'i1',
              revisao: 'aceita',
              versao: { natureza: 'obrigacao', prazo_confirmado_em: '2026-10-12T13:00:00Z' },
            },
            {
              instrumento_id: 'i1',
              revisao: 'aceita',
              versao: { natureza: 'obrigacao', prazo_confirmado_em: null },
            },
          ],
        },
      }),
    )
    renderizarApp('/empreendimentos/e1')

    expect(await screen.findByText('Rascunho no passo 4 de 5: Prazos')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Continuar o cadastro de LAO 4821/2023' }),
    ).toHaveAttribute('href', '/licencas/i1/prazos')
    expect(screen.getAllByText(/Rascunho no passo/)).toHaveLength(1)
  })

  it('no celular as licenças viram lista, com o rascunho e o Continuar', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    try {
      falso.reiniciar(
        cenario({
          rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] } },
          tabelas: {
            instrumento: [
              {
                id: 'i1',
                numero: '4821/2023',
                orgao: 'IMA',
                validade: '2027-02-15',
                criado_em: '2026-10-01T12:00:00Z',
                antecedencia_renovacao_dias: 30,
                unidade_id: 'u1',
                tipo_id: 't-lao',
                marco: 'assinatura',
                situacao: 'rascunho',
                tipo: { sigla: 'LAO', nome: 'Licença Ambiental de Operação' },
                unidade: { nome: 'Matriz' },
                plano: null,
                condicionante: [{ count: 0 }],
              },
            ],
          },
        }),
      )
      renderizarApp('/empreendimentos/e1')
      const lista = await screen.findByRole('list', { name: 'Licenças do empreendimento' })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(within(lista).getByText('LAO 4821/2023')).toBeInTheDocument()
      expect(within(lista).getByText(/Rascunho no passo/)).toBeInTheDocument()
      expect(
        within(lista).getByRole('link', { name: 'Continuar o cadastro de LAO 4821/2023' }),
      ).toBeInTheDocument()
      // Unidades foram para o "…" do cabeçalho (uma ação principal por tela, ADR-0041).
      expect(screen.getByRole('button', { name: 'Mais ações' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gerenciar unidades lista, mostra endereço ausente e adiciona', async () => {
    falso.reiniciar(cenario({ rpc: { criar_unidade: (args) => ({ data: args.p_id }) } }))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1')

    await usuario.click(await screen.findByRole('button', { name: 'Mais ações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Gerenciar unidades' }))
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
