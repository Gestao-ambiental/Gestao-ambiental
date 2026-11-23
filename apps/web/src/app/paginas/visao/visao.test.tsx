import { adicionarDias, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

function linha(
  id: string,
  dias: number,
  titulo: string,
  extra: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    tipo_linha: 'ocorrencia',
    id,
    instrumento_id: 'i1',
    prazo: adicionarDias(hoje, dias),
    dias,
    codigo: '4.2',
    titulo,
    empreendimento_id: 'e1',
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    licenca: 'LAO 4821/2023',
    responsavel_id: 'm-bruno',
    responsavel_nome: 'Bruno Kist',
    situacao_ocorrencia: 'aberta',
    row_version: 1,
    total: 4,
    ...extra,
  }
}

const linhas = [
  linha('o1', -45, 'Laudo anual de ruído'),
  linha('o2', 0, 'Relatório trimestral', { responsavel_id: null, responsavel_nome: null }),
  linha('o3', 1, 'Inventário anual de resíduos'),
  linha('l1', 6, 'Limite de protocolo', {
    tipo_linha: 'limite_protocolo',
    codigo: null,
    responsavel_id: null,
    responsavel_nome: null,
  }),
]

function cenario(papel: 'gestao' | 'equipe' = 'gestao', extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_prazos: (args) => ({ data: args.p_limite === 1 ? [{ total: 4 }] : linhas }),
      contar_prazos: {
        data: [{ atrasadas: 1, hoje: 1, proximos_7: 2, sem_responsavel: 1, total: 3 }],
      },
      listar_empreendimentos: { data: [] },
      atribuir_ocorrencia: { data: 2 },
      listar_calendario: { data: [] },
      ...extra.rpc,
    },
    tabelas: {
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: 'm-elisa', nome: 'Elisa Prado' },
      ],
      instrumento: [],
      unidade: [],
      ...extra.tabelas,
    },
  }
}

describe('visão da equipe (EQ-01 a EQ-03)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('mostra contadores e a tabela com a situação calculada e rótulos próprios', async () => {
    renderizarApp('/')
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByText('Atrasada 45 dias')).toBeInTheDocument()
    expect(within(tabela).getByText('Hoje')).toBeInTheDocument()
    expect(within(tabela).getByText('Amanhã')).toBeInTheDocument()
    expect(within(tabela).getByText('Em 6 dias')).toBeInTheDocument()
    expect(within(tabela).getByText('Limite de protocolo')).toBeInTheDocument()

    const contadores = screen.getByRole('group', { name: 'Contadores' })
    expect(within(contadores).getByRole('button', { name: /Atrasadas/ })).toHaveTextContent('1')
    expect(within(contadores).getByRole('button', { name: /Sem responsável/ })).toBeInTheDocument()
    expect(screen.getByText('1–4 de 4')).toBeInTheDocument()
  })

  it('o filtro de tipo lista os tipos em uso que o banco devolve, por sigla', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_tipos_em_uso: {
            data: [
              { id: 't-lap', sigla: 'LAP' },
              { id: 't-lao', sigla: 'LAO' },
            ],
          },
        },
      }),
    )
    renderizarApp('/')
    await screen.findByRole('table')
    const filtro = screen.getByRole('combobox', { name: 'Tipo de instrumento' })
    await waitFor(() => {
      expect(
        within(filtro)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Todos os tipos', 'LAO', 'LAP'])
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_tipos_em_uso', {
      p_consultoria_id: 'c-Filtroville',
    })
  })

  it('o contador filtra a tabela e o cabeçalho ordena', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await screen.findByRole('table')

    await usuario.click(screen.getByRole('button', { name: /Atrasadas/ }))
    expect(screen.getByRole('button', { name: /Atrasadas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_faixa: 'atrasadas' }) as unknown,
    )

    await usuario.click(screen.getByRole('button', { name: 'Prazo' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_ordem: '-prazo' }) as unknown,
    )
  })

  it('Gestão atribui pela linha sem responsável', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    const tabela = await screen.findByRole('table')

    await usuario.click(
      within(tabela).getByRole('button', { name: /Atribuir 4.2 Relatório trimestral/ }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Elisa Prado' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_ocorrencia', {
      p_ocorrencia_id: 'o2',
      p_membro_id: 'm-elisa',
      p_row_version: 1,
    })
  })

  it('Equipe não atribui nem vê o contador de sem responsável', async () => {
    falso.reiniciar(cenario('equipe'))
    renderizarApp('/')
    const tabela = await screen.findByRole('table')
    expect(within(tabela).queryByRole('button', { name: /Atribuir/ })).toBeNull()
    expect(within(tabela).getByText('Sem responsável')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sem responsável/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Cadastrar licença/ })).toBeNull()
  })

  it('Minhas ações troca a aba', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/')
    await screen.findByRole('table')
    await usuario.click(screen.getByRole('tab', { name: /Minhas ações/ }))
    expect(screen.getByRole('tab', { name: /Minhas ações/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_prazos',
      expect.objectContaining({ p_aba: 'minhas' }) as unknown,
    )
  })

  it('sem dado carregado não mostra contador com zero', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { contar_prazos: { error: { message: 'falhou' } } } }))
    renderizarApp('/')
    await screen.findByRole('table')
    expect(screen.queryByRole('group', { name: 'Contadores' })).toBeNull()
  })

  it('consultoria sem prazos mostra o estado vazio', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_prazos: { data: [] } } }))
    renderizarApp('/')
    expect(await screen.findByText('Nenhum prazo para mostrar')).toBeInTheDocument()
  })

  // Regra mudou de propósito (pedido do Eduardo, 23/11/2026, padrão de botões): um primário por
  // tela. O "Ir para Empreendimentos" do estado vazio era verde ao lado do "Cadastrar licença".
  it('estado vazio mostra um só botão primário (o Cadastrar licença)', async () => {
    falso.reiniciar(cenario('gestao', { rpc: { listar_prazos: { data: [] } } }))
    renderizarApp('/')
    const irParaEmpreendimentos = await screen.findByRole('link', {
      name: 'Ir para Empreendimentos',
    })
    expect(irParaEmpreendimentos).not.toHaveClass('bg-(--acao)')
    const primarios = document.querySelectorAll(':is(button, a)[class~="bg-(--acao)"]')
    expect(Array.from(primarios).map((b) => b.textContent)).toEqual(['Cadastrar licença'])
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/')
    await screen.findByRole('table')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('visão: filtro por cliente e tipos novos (base das oito funções)', () => {
  const fromOriginal = falso.cliente.from.getMockImplementation()

  afterEach(() => {
    if (fromOriginal) falso.cliente.from.mockImplementation(fromOriginal)
  })

  /** Faz a leitura do nome do cliente falhar (as tabelas do Supabase falso não erram sozinhas). */
  function nomeDoClienteFalha() {
    const falha: Record<string, unknown> = {}
    falha.select = () => falha
    falha.eq = () => falha
    falha.maybeSingle = () =>
      Promise.resolve({ data: null, error: { message: 'falhou', code: '500' } })
    falso.cliente.from.mockImplementation(((tabela: string) =>
      tabela === 'cliente' ? falha : fromOriginal?.(tabela)) as never)
  }

  const CLIENTE = '5f0c7a9e-2b1d-4c3e-9f8a-1b2c3d4e5f60'
  const CLIENTE_DE_OUTRA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

  const chamadasDe = (nome: string) =>
    falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})

  it('?cliente= que não é uuid não vai ao banco: a lista carrega e o filtro diz não encontrado', async () => {
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/?cliente=abc')
    await screen.findByRole('table')
    expect(screen.queryByText('Não foi possível carregar os prazos.')).toBeNull()
    for (const args of chamadasDe('listar_prazos')) {
      expect(args).not.toHaveProperty('p_cliente_id')
    }
    expect(chamadasDe('contar_prazos')[0]).not.toHaveProperty('p_cliente_id')
    expect(falso.cliente.from).not.toHaveBeenCalledWith('cliente')

    const filtro = screen.getByRole('group', { name: 'Filtro de cliente' })
    expect(within(filtro).getByText('não encontrado')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.queryByRole('group', { name: 'Filtro de cliente' })).toBeNull()
    expect(router.state.location.search).toBe('')
  })

  it('?cliente= vai para a lista, os contadores e os totais das abas, com o nome no filtro', async () => {
    falso.reiniciar(
      cenario('gestao', { tabelas: { cliente: [{ id: CLIENTE, nome: 'Grupo Açores' }] } }),
    )
    renderizarApp(`/?cliente=${CLIENTE}`)
    await screen.findByRole('table')

    const filtro = await screen.findByRole('group', { name: 'Filtro de cliente' })
    expect(await within(filtro).findByText('Grupo Açores')).toBeInTheDocument()
    expect(chamadasDe('listar_prazos').length).toBeGreaterThan(0)
    for (const args of chamadasDe('listar_prazos')) {
      expect(args).toMatchObject({ p_cliente_id: CLIENTE })
    }
    expect(chamadasDe('contar_prazos')[0]).toMatchObject({ p_cliente_id: CLIENTE })
  })

  it('remover o filtro de cliente consulta de novo sem p_cliente_id', async () => {
    falso.reiniciar(
      cenario('gestao', { tabelas: { cliente: [{ id: CLIENTE, nome: 'Grupo Açores' }] } }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp(`/?cliente=${CLIENTE}`)
    await screen.findByRole('table')

    await usuario.click(
      await screen.findByRole('button', { name: 'Remover filtro do cliente Grupo Açores' }),
    )

    expect(screen.queryByRole('group', { name: 'Filtro de cliente' })).toBeNull()
    expect(router.state.location.search).toBe('')
    await waitFor(() => {
      expect(chamadasDe('listar_prazos').at(-1)).not.toHaveProperty('p_cliente_id')
    })
    expect(chamadasDe('contar_prazos').at(-1)).not.toHaveProperty('p_cliente_id')
  })

  it('Limpar filtros também tira o cliente', async () => {
    falso.reiniciar(
      cenario('gestao', { tabelas: { cliente: [{ id: CLIENTE, nome: 'Grupo Açores' }] } }),
    )
    const usuario = userEvent.setup()
    renderizarApp(`/?cliente=${CLIENTE}`)
    await screen.findByRole('group', { name: 'Filtro de cliente' })

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.queryByRole('group', { name: 'Filtro de cliente' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeDisabled()
  })

  it('erro da lista filtrada mostra tentar de novo e o filtro continua removível', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: { listar_prazos: { error: { message: 'falhou', code: '500' } } },
        tabelas: { cliente: [{ id: CLIENTE, nome: 'Grupo Açores' }] },
      }),
    )
    renderizarApp(`/?cliente=${CLIENTE}`)
    expect(await screen.findByText('Não foi possível carregar os prazos.')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Remover filtro do cliente Grupo Açores' }),
    ).toBeInTheDocument()
  })

  it('nome do cliente que não carrega não esconde o filtro', async () => {
    nomeDoClienteFalha()
    falso.reiniciar(cenario('gestao'))
    const usuario = userEvent.setup()
    renderizarApp(`/?cliente=${CLIENTE}`)
    await screen.findByRole('table')

    const filtro = screen.getByRole('group', { name: 'Filtro de cliente' })
    expect(await within(filtro).findByText('nome indisponível')).toBeInTheDocument()
    await usuario.click(within(filtro).getByRole('button', { name: 'Remover filtro do cliente' }))
    expect(screen.queryByRole('group', { name: 'Filtro de cliente' })).toBeNull()
  })

  it('cliente que não existe (ou de outra consultoria) aparece como não encontrado', async () => {
    falso.reiniciar(cenario('gestao', { tabelas: { cliente: [] } }))
    renderizarApp(`/?cliente=${CLIENTE_DE_OUTRA}`)
    await screen.findByRole('table')
    const filtro = screen.getByRole('group', { name: 'Filtro de cliente' })
    expect(await within(filtro).findByText('não encontrado')).toBeInTheDocument()
  })

  it('exigência leva à exigência e vencimento ao empreendimento; Atribuir na ocorrência e na exigência', async () => {
    const tiposNovos = [
      linha('o9', 2, 'Relatório sem dono', { responsavel_id: null, responsavel_nome: null }),
      linha('x1', 3, 'Apresentar laudo complementar', {
        tipo_linha: 'exigencia',
        codigo: null,
        instrumento_id: null,
        situacao_ocorrencia: null,
        responsavel_id: null,
        responsavel_nome: null,
      }),
      linha('v1', -2, 'AVCB', {
        tipo_linha: 'vencimento',
        codigo: null,
        instrumento_id: null,
        licenca: null,
        empreendimento_id: 'e7',
        situacao_ocorrencia: null,
        responsavel_id: null,
        responsavel_nome: null,
      }),
    ]
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_prazos: (args) => ({
            data:
              args.p_limite === 1 ? [{ total: 3 }] : tiposNovos.map((l) => ({ ...l, total: 3 })),
          }),
        },
      }),
    )
    renderizarApp('/')
    const tabela = await screen.findByRole('table')
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(linhas).toHaveLength(3)

    const [ocorrencia, exigencia, vencimento] = linhas as [HTMLElement, HTMLElement, HTMLElement]
    expect(within(ocorrencia).getByRole('button', { name: /Atribuir/ })).toBeInTheDocument()

    expect(within(exigencia).getByRole('link', { name: /Apresentar laudo/ })).toHaveAttribute(
      'href',
      '/exigencias/x1',
    )
    expect(within(exigencia).getByText(/Exigência/)).toBeInTheDocument()
    // Regra mudada de propósito no P3 (ADR-0045): a exigência aceita responsável.
    expect(within(exigencia).getByRole('button', { name: /Atribuir/ })).toBeInTheDocument()
    expect(within(exigencia).getByText('Em 3 dias')).toBeInTheDocument()

    expect(within(vencimento).getByRole('link', { name: /AVCB/ })).toHaveAttribute(
      'href',
      '/empreendimentos/e7',
    )
    expect(within(vencimento).getByText(/Vencimento/)).toBeInTheDocument()
    expect(within(vencimento).queryByRole('button', { name: /Atribuir/ })).toBeNull()
    expect(within(vencimento).getByText('Vencida há 2 dias')).toBeInTheDocument()
  })

  it('Gestão atribui a exigência pela RPC da exigência, não pela da ocorrência', async () => {
    const exigencia = linha('x1', 3, 'Apresentar laudo complementar', {
      tipo_linha: 'exigencia',
      codigo: null,
      instrumento_id: null,
      situacao_ocorrencia: null,
      responsavel_id: null,
      responsavel_nome: null,
      row_version: 4,
      total: 1,
    })
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_prazos: (args) => ({ data: args.p_limite === 1 ? [{ total: 1 }] : [exigencia] }),
          atribuir_exigencia: { data: 5 },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/')
    const tabela = await screen.findByRole('table')

    await usuario.click(
      within(tabela).getByRole('button', { name: /Atribuir.*Apresentar laudo complementar/ }),
    )
    await usuario.click(await screen.findByRole('menuitem', { name: 'Elisa Prado' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_exigencia', {
      p_exigencia_id: 'x1',
      p_membro_id: 'm-elisa',
      p_row_version: 4,
    })
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('atribuir_ocorrencia', expect.anything())
  })

  it('com o filtro de cliente não tem violações de acessibilidade detectáveis pelo axe', async () => {
    falso.reiniciar(
      cenario('gestao', { tabelas: { cliente: [{ id: CLIENTE, nome: 'Grupo Açores' }] } }),
    )
    const { container } = renderizarApp(`/?cliente=${CLIENTE}`)
    await screen.findByRole('table')
    await screen.findByText('Grupo Açores')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})

describe('calendário (EQ-04)', () => {
  const evento = (
    data: string,
    tipo: string,
    titulo: string,
    extra: Record<string, unknown> = {},
  ) => ({
    tipo_evento: tipo,
    data,
    id: `${tipo}-${titulo}`,
    instrumento_id: 'i1',
    codigo: tipo === 'prazo' || tipo === 'meta' ? '4.2' : null,
    titulo,
    empreendimento_nome: 'Metalúrgica Rio Cubatão',
    unidade_nome: 'Matriz',
    licenca: 'LAO 4821/2023',
    responsavel_nome: 'Bruno Kist',
    sem_responsavel: false,
    dias: 0,
    ...extra,
  })

  it('mês com eventos do dia, "+N mais" e marcas distintas', async () => {
    falso.reiniciar(
      cenario('gestao', {
        rpc: {
          listar_calendario: {
            data: [
              evento(hoje, 'prazo', 'Relatório A'),
              evento(hoje, 'prazo', 'Relatório B', {
                sem_responsavel: true,
                responsavel_nome: null,
              }),
              evento(hoje, 'meta', 'Relatório C'),
              evento(hoje, 'limite_protocolo', 'Limite de protocolo'),
              evento(hoje, 'validade', 'Validade'),
            ],
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/calendario')

    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    expect(within(tabela).getByText('Hoje')).toBeInTheDocument()
    expect(within(tabela).getByText('4.2 Relatório A')).toBeInTheDocument()
    expect(within(tabela).getByText('sem resp.')).toBeInTheDocument()
    expect(within(tabela).getByText('Meta')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: '+2 mais' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Protocolo LAO 4821/2023')).toBeInTheDocument()
    expect(within(dialogo).getByText('Validade LAO 4821/2023')).toBeInTheDocument()
  })

  it('filtros e troca para semana consultam o intervalo certo', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/calendario')
    await screen.findByRole('table', { name: /Calendário de/ })

    await usuario.click(screen.getByRole('checkbox', { name: 'Só sem responsável' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_calendario',
      expect.objectContaining({ p_sem_responsavel: true }) as unknown,
    )

    await usuario.click(screen.getByRole('button', { name: 'Semana' }))
    const chamadas = falso.cliente.rpc.mock.calls.filter(([nome]) => nome === 'listar_calendario')
    const [, ultima] = chamadas.at(-1) ?? []
    const { p_de: de, p_ate: ate } = ultima as { p_de: string; p_ate: string }
    expect(adicionarDias(de as typeof hoje, 6)).toBe(ate)
  })
})
