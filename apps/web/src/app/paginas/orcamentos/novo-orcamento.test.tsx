// Novo orçamento sem diálogo (pedido do Eduardo, 20/11/2026): o botão abre direto o editor, o
// cliente vem numa linha só (empreendimento, "Cliente novo" ou cadastro completo) e o "o que será
// orçado" se preenche sozinho com o modelo ou o primeiro serviço.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { digitarReais } from '@/test/digitar'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

type Linha = Record<string, unknown>

const HORIZONTE = {
  id: 'e1',
  nome: 'Indústria Horizonte',
  cliente_nome: null,
  cnpj: '11222333000181',
  unidades: 1,
  criado_em: '2026-10-01T12:00:00Z',
  licencas: [],
  total: 1,
}

function orcamento(extra: Linha): Linha {
  return {
    id: 'o9',
    consultoria_id: 'c-Filtroville',
    ano: 2026,
    sequencia: 9,
    revisao: 1,
    situacao: 'rascunho',
    empreendimento_id: null,
    empreendimento_nome: '',
    prospecto: null,
    objeto: 'Serviços ambientais',
    destinatario: null,
    prazos: null,
    validade_dias: 30,
    premissas: [],
    exclusoes: [],
    moeda: 'BRL',
    margem_pb: null,
    forma_preco: 'margem',
    visitas: { quantidade: 0, km_por_visita: 0, outros_por_visita_centavos: 0 },
    preco_visitas_centavos: 0,
    base: null,
    atualizado_em: '2026-11-20T10:00:00Z',
    row_version: 1,
    historico_situacao: [],
    itens: [],
    despesas: [],
    parcelas: [],
    ...extra,
  }
}

/**
 * Servidor falso: a busca filtra os empreendimentos, criar guarda o rascunho como o banco (com o
 * objeto recebido) e salvar devolve o que foi salvo.
 */
function servidor(extra: Partial<Cenario['rpc']> = {}): Cenario {
  const empreendimentos: Linha[] = [HORIZONTE]
  let atual: Linha | null = null
  return {
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_orcamentos: { data: [] },
      obter_identidade_da_consultoria: { data: null },
      listar_empreendimentos: (a) => {
        const termo = (typeof a.p_busca === 'string' ? a.p_busca : '').toLowerCase()
        return {
          data: empreendimentos.filter((e) => String(e.nome).toLowerCase().includes(termo)),
        }
      },
      cadastrar_empreendimento_com_unidade: (a) => {
        empreendimentos.push({ ...HORIZONTE, id: a.p_empreendimento_id, nome: a.p_nome })
        return { data: a.p_unidade_id }
      },
      criar_orcamento: (a) => {
        const empreendimento = empreendimentos.find((e) => e.id === a.p_empreendimento_id)
        const prospecto = a.p_prospecto as Linha | undefined
        atual = orcamento({
          id: a.p_id,
          objeto: a.p_objeto,
          empreendimento_id: empreendimento?.id ?? null,
          empreendimento_nome: empreendimento?.nome ?? prospecto?.nome ?? '',
          prospecto: prospecto ?? null,
        })
        return { data: a.p_id }
      },
      obter_orcamento: () => ({ data: atual }),
      salvar_orcamento: (a) => {
        const dados = a.p_dados as Linha & { itens: Linha[] }
        const versao = Number(atual?.row_version ?? 1) + 1
        atual = {
          ...atual,
          ...dados,
          row_version: versao,
          itens: dados.itens.map((i) => ({
            ...i,
            preco_automatico: true,
            preco_centavos: i.preco_fechado_centavos ?? 0,
          })),
        }
        return { data: versao }
      },
      ...extra,
    },
  }
}

function chamadas(nome: string): Linha[] {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
}

beforeEach(() => {
  falso.reiniciar(servidor())
})

describe('Novo orçamento, direto no editor', () => {
  it('o botão abre o editor sem diálogo, com o cliente numa linha e sem pedir o objeto', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos')
    await usuario.click(await screen.findByRole('button', { name: 'Novo orçamento' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo orçamento' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/orcamentos/novo')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/O que será orçado/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveFocus()
    expect(screen.getByRole('navigation', { name: 'Etapas do orçamento' })).toBeInTheDocument()
    expect(chamadas('criar_orcamento')).toHaveLength(0)
  })

  it('escolher um empreendimento cadastrado cria o rascunho para ele e abre o editor', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos/novo')
    await usuario.type(await screen.findByRole('combobox', { name: 'Cliente' }), 'horiz')
    await usuario.click(await screen.findByRole('option', { name: /^Indústria Horizonte/ }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Indústria Horizonte' }),
    ).toBeVisible()
    expect(router.state.location.pathname).toMatch(/^\/orcamentos\/[0-9a-f-]{36}$/)
    expect(chamadas('criar_orcamento')).toEqual([
      expect.objectContaining({
        p_consultoria_id: 'c-Filtroville',
        p_empreendimento_id: 'e1',
        p_objeto: 'Serviços ambientais',
      }),
    ])
  })

  it('pelo teclado: setas e Enter escolhem, e o "Novo" aparece para nome não cadastrado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/novo')
    const campo = await screen.findByRole('combobox', { name: 'Cliente' })
    await usuario.type(campo, 'Padaria Pão Quente')
    const lista = await screen.findByRole('listbox', { name: 'Clientes' })
    await waitFor(() => {
      expect(within(lista).queryByRole('option', { name: /^Indústria Horizonte/ })).toBeNull()
    })
    expect(
      within(lista)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Cliente novo: Padaria Pão QuenteSó com o nome',
      'Padaria Pão Quente com CNPJ e unidadeEntra em Empreendimentos',
    ])
    await usuario.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Padaria Pão Quente' }),
    ).toBeVisible()
    expect(chamadas('criar_orcamento')[0]).toMatchObject({
      p_empreendimento_id: null,
      p_prospecto: { nome: 'Padaria Pão Quente', cnpj: null, email: null },
    })
    // O prospecto segue editável no editor, com o cadastro como empreendimento à mão.
    expect(screen.getByRole('button', { name: 'Cadastrar como empreendimento' })).toBeVisible()
  })

  it('o botão Cliente novo fica à vista e cria o orçamento só com o nome', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/novo')
    await usuario.click(await screen.findByRole('button', { name: 'Cliente novo' }))

    const form = screen.getByRole('form', { name: 'Cliente novo' })
    const nome = within(form).getByLabelText('Nome da empresa ou do cliente')
    expect(nome).toHaveFocus()
    // Sem nome, avisa e não cria.
    await usuario.click(within(form).getByRole('button', { name: 'Criar orçamento' }))
    expect(within(form).getByText('Informe o nome do cliente')).toBeVisible()
    expect(chamadas('criar_orcamento')).toHaveLength(0)

    await usuario.type(nome, 'Dermaclinic{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dermaclinic' })).toBeVisible()
    expect(chamadas('criar_orcamento')[0]).toMatchObject({
      p_empreendimento_id: null,
      p_prospecto: { nome: 'Dermaclinic' },
    })
  })

  it('Cliente novo leva o nome já digitado e também abre o cadastro com CNPJ', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/novo')
    await usuario.type(await screen.findByRole('combobox', { name: 'Cliente' }), 'Dermaclinic')
    await usuario.click(screen.getByRole('button', { name: 'Cliente novo' }))
    const form = screen.getByRole('form', { name: 'Cliente novo' })
    expect(within(form).getByLabelText('Nome da empresa ou do cliente')).toHaveValue('Dermaclinic')

    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar com CNPJ e unidade' }))
    const cadastro = await screen.findByRole('form', { name: 'Novo empreendimento' })
    expect(within(cadastro).getByLabelText('Nome do empreendimento')).toHaveValue('Dermaclinic')
    await usuario.click(within(cadastro).getByRole('button', { name: 'Cancelar' }))

    // Voltar para a busca mantém o nome digitado.
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveValue('Dermaclinic')
  })

  it('cadastra o empreendimento completo ali mesmo e cria o orçamento para ele', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/novo')
    await usuario.type(await screen.findByRole('combobox', { name: 'Cliente' }), 'Posto Vale Verde')
    await usuario.click(
      await screen.findByRole('option', { name: /^Posto Vale Verde com CNPJ e unidade/ }),
    )

    const form = await screen.findByRole('form', { name: 'Novo empreendimento' })
    expect(within(form).getByLabelText('Nome do empreendimento')).toHaveValue('Posto Vale Verde')
    expect(within(form).getByLabelText('Unidade')).toHaveValue('Matriz')
    // O nome veio da busca: o foco vai para o primeiro campo vazio.
    expect(within(form).getByLabelText('CNPJ')).toHaveFocus()
    await usuario.type(within(form).getByLabelText('CNPJ'), '11222333000181')
    await usuario.click(within(form).getByRole('button', { name: 'Cadastrar e usar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Posto Vale Verde' })).toBeVisible()
    const [cadastro] = chamadas('cadastrar_empreendimento_com_unidade')
    expect(cadastro).toMatchObject({
      p_nome: 'Posto Vale Verde',
      p_cnpj: '11.222.333/0001-81',
      p_unidade_nome: 'Matriz',
    })
    expect(chamadas('criar_orcamento')[0]).toMatchObject({
      p_empreendimento_id: cadastro?.p_empreendimento_id,
    })
  })

  it('erro ao criar: mostra a mensagem, fica na tela e o Tentar de novo usa o mesmo id', async () => {
    let tentativas = 0
    const normal = servidor()
    falso.reiniciar(
      servidor({
        criar_orcamento: (a) => {
          tentativas += 1
          if (tentativas === 1) return { error: { message: 'Failed to fetch' } }
          const criar = normal.rpc?.criar_orcamento
          return typeof criar === 'function' ? criar(a) : { data: a.p_id }
        },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/orcamentos/novo')
    await usuario.type(await screen.findByRole('combobox', { name: 'Cliente' }), 'Indústria')
    await usuario.click(await screen.findByRole('option', { name: /^Indústria Horizonte/ }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(router.state.location.pathname).toBe('/orcamentos/novo')
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/orcamentos/novo')
    })
    const [primeira, segunda] = chamadas('criar_orcamento')
    expect(segunda?.p_id).toBe(primeira?.p_id)
  })

  it('do empreendimento (?empreendimento=): cria na hora, já para ele', async () => {
    renderizarApp('/orcamentos/novo?empreendimento=e1')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Indústria Horizonte' }),
    ).toBeVisible()
    expect(chamadas('criar_orcamento')).toEqual([
      expect.objectContaining({ p_empreendimento_id: 'e1', p_objeto: 'Serviços ambientais' }),
    ])
  })

  it('o objeto vira o primeiro serviço ao salvar, e um objeto escrito à mão fica', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/novo?empreendimento=e1')
    await screen.findByRole('heading', { level: 1, name: 'Indústria Horizonte' })
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
    await usuario.type(screen.getByLabelText('Serviço do item 1'), 'Licença ambiental simplificada')
    await usuario.type(screen.getByLabelText('Horas do item 1'), '6')
    await digitarReais(usuario, screen.getByLabelText('Preço digitado do item 1'), '1500')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      expect(chamadas('salvar_orcamento')).toHaveLength(1)
    })
    expect(chamadas('salvar_orcamento')[0]).toMatchObject({
      p_dados: { objeto: 'Licença ambiental simplificada' },
    })

    // Escrito à mão na proposta: não é mais trocado pelo serviço.
    await usuario.click(await screen.findByRole('button', { name: /Parcelas/ }))
    await usuario.click(await screen.findByText('Objeto, destinatário, prazos e validade'))
    const objeto = screen.getByLabelText('O que está sendo orçado')
    expect(objeto).toHaveValue('Licença ambiental simplificada')
    await usuario.clear(objeto)
    await usuario.type(objeto, 'Regularização do posto')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      expect(chamadas('salvar_orcamento')).toHaveLength(2)
    })
    expect(chamadas('salvar_orcamento')[1]).toMatchObject({
      p_dados: { objeto: 'Regularização do posto' },
    })
  })

  it('equipe não cria orçamento: vê sem permissão', async () => {
    falso.reiniciar({
      ...servidor(),
      rpc: { ...servidor().rpc, meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
    })
    renderizarApp('/orcamentos/novo?empreendimento=e1')
    expect(await screen.findByText(/só a gestão acessa/)).toBeVisible()
    expect(chamadas('criar_orcamento')).toHaveLength(0)
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/orcamentos/novo')
    await usuario.type(await screen.findByRole('combobox', { name: 'Cliente' }), 'Padaria')
    await screen.findByRole('option', { name: /^Cliente novo: Padaria/ })
    const resultado = await axe.run(container)
    expect(resultado.violations).toEqual([])
  })
})
