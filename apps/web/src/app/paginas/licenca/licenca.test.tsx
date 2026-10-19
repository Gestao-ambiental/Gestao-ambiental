import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))
// pdf.js precisa de canvas e worker de verdade; aqui só importa que o painel recebe a URL.
vi.mock('@/components/pdf/VisualizadorPdf', () => ({
  VisualizadorPdf: ({ nome, url }: { nome: string; url: string }) => (
    <section aria-label={`PDF ${nome}`} data-url={url} />
  ),
}))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function rascunho(extra: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    situacao: 'rascunho',
    row_version: 3,
    numero: '4821/2023',
    orgao: 'IMA',
    tipo_id: 't-lao',
    unidade_id: 'u1',
    empreendimento_id: 'e1',
    emitido_em: null,
    assinado_em: '2023-02-14',
    publicado_em: null,
    recebido_em: null,
    marco: 'assinatura',
    validade: '2027-02-15',
    antecedencia_renovacao_dias: 30,
    tipo: { sigla: 'LAO' },
    unidade: { nome: 'Matriz', empreendimento: { nome: 'Metalúrgica Rio Cubatão' } },
    documento: {
      versao: { caminho: 'c-Filtroville/instrumento/v1.pdf', nome_original: 'LAO 4821-2023.pdf' },
    },
    ...extra,
  }
}

function condicionante(
  id: string,
  codigo: string,
  titulo: string,
  versao: Record<string, unknown> = {},
) {
  return {
    id,
    pai_id: null,
    codigo,
    posicao: 1,
    revisao: 'aceita',
    responsavel_id: null,
    versao: {
      titulo,
      texto_literal: `Texto literal de ${titulo}`,
      natureza: 'obrigacao',
      recorrencia: null,
      unidade_ciclo: null,
      intervalo_ciclo: null,
      data_referencia: null,
      primeira_data: null,
      fonte_regra: null,
      prazo_confirmado_em: null,
      confirmador: null,
      ...versao,
    },
  }
}

function cenario(extra: Partial<Cenario> = {}, papel: 'gestao' | 'equipe' = 'gestao'): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
      listar_empreendimentos: {
        data: [
          {
            id: 'e1',
            nome: 'Metalúrgica Rio Cubatão',
            cliente_nome: null,
            cnpj: null,
            unidades: 1,
            criado_em: '2026-10-01T12:00:00Z',
            licencas: [],
            total: 1,
          },
        ],
      },
      criar_instrumento: (args) => ({ data: args.p_id }),
      salvar_identificacao: { data: 4 },
      salvar_condicionante: (args) => ({ data: args.p_id }),
      confirmar_prazo: { data: null },
      atribuir_a_todos: { data: null },
      ativar_plano: { data: 8 },
      ...extra.rpc,
    },
    tabelas: {
      unidade: [{ id: 'u1', nome: 'Matriz', endereco: null }],
      tipo_instrumento: [
        { id: 't-lao', sigla: 'LAO', nome: 'Licença Ambiental de Operação' },
        { id: 't-aua', sigla: 'AuA', nome: 'Autorização Ambiental' },
      ],
      instrumento: [rascunho()],
      condicionante: [],
      membro: [
        { id: 'm-bruno', nome: 'Bruno Kist' },
        { id: 'm-elisa', nome: 'Elisa Prado' },
      ],
      ...extra.tabelas,
    },
  }
}

describe('cadastro de licença: permissão e passo 1 (LIC-01)', () => {
  beforeEach(() => {
    falso.reiniciar(cenario())
  })

  it('Equipe não cadastra licença', async () => {
    falso.reiniciar(cenario({}, 'equipe'))
    renderizarApp('/licencas/nova?empreendimento=e1')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('criar_instrumento', expect.anything())
  })

  it('Gestão escolhe o manual, cria o rascunho e segue para a identificação', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/licencas/nova?empreendimento=e1')

    const continuar = await screen.findByRole('button', { name: 'Continuar' })
    expect(await screen.findByRole('combobox', { name: 'Unidade' })).toHaveValue('u1')
    expect(continuar).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Extrair com IA' })).toBeDisabled()

    await usuario.click(screen.getByRole('radio', { name: 'Cadastrar manualmente' }))
    await usuario.click(continuar)

    // O título "Cadastrar licença" já existe no passo 1: espera a rota, não o título.
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/licencas\/[0-9a-f-]{36}\/identificacao$/)
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'criar_instrumento',
      expect.objectContaining({ p_unidade_id: 'u1' }) as unknown,
    )
  })

  it('PDF com outro conteúdo é recusado antes do envio', async () => {
    const usuario = userEvent.setup({ applyAccept: false })
    renderizarApp('/licencas/nova?empreendimento=e1')
    await screen.findByRole('button', { name: 'Escolher arquivo' })
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!entrada) throw new Error('campo de arquivo ausente')
    await usuario.upload(
      entrada,
      new File(['não sou pdf'], 'falso.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('Este arquivo não é um PDF.')).toBeInTheDocument()
  })
})

describe('passo 2: identificação (LIC-01)', () => {
  it('Continuar exige tipo, marco e validade; salva com a versão do rascunho', async () => {
    falso.reiniciar(
      cenario({
        tabelas: {
          instrumento: [
            rascunho({ tipo_id: null, tipo: null, marco: null, validade: null, assinado_em: null }),
          ],
        },
      }),
    )
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/licencas/i1/identificacao')

    const continuar = await screen.findByRole('button', { name: 'Continuar' })
    expect(continuar).toBeDisabled()
    expect(
      screen.getByText('Continuar exige tipo, marco dos prazos e validade confirmada.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Preencha ao menos uma data para escolher.')).toBeInTheDocument()

    await screen.findByRole('option', { name: /^LAO/ })
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: /Tipo de instrumento/ }),
      't-lao',
    )
    await usuario.type(screen.getByLabelText('Assinatura'), '2023-02-14')
    await usuario.click(screen.getByRole('radio', { name: 'Assinatura · 14/02/2023' }))
    await usuario.type(screen.getByLabelText(/Validade confirmada/), '2027-02-15')
    expect(screen.getByText('18/10/2026')).toBeInTheDocument()

    await usuario.click(continuar)
    expect(router.state.location.pathname).toBe('/licencas/i1/condicionantes')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'salvar_identificacao',
      expect.objectContaining({
        p_id: 'i1',
        p_row_version: 3,
        p_tipo_id: 't-lao',
        p_assinado_em: '2023-02-14',
        p_marco: 'assinatura',
        p_validade: '2027-02-15',
      }) as unknown,
    )
  })

  it('o PDF anexado aparece ao lado', async () => {
    falso.reiniciar(cenario())
    renderizarApp('/licencas/i1/identificacao')
    expect(await screen.findByRole('region', { name: 'PDF LAO 4821-2023.pdf' })).toHaveAttribute(
      'data-url',
      'https://falso.test/c-Filtroville/instrumento/v1.pdf',
    )
  })

  it('licença já ativa não abre o assistente', async () => {
    falso.reiniciar(cenario({ tabelas: { instrumento: [rascunho({ situacao: 'ativo' })] } }))
    renderizarApp('/licencas/i1/identificacao')
    expect(await screen.findByText('Esta licença já está ativa')).toBeInTheDocument()
  })
})

describe('passo 3: condicionantes (LIC-02)', () => {
  it('sem itens, pede a primeira; adicionar uma obrigação chama a RPC', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    renderizarApp('/licencas/i1/condicionantes')

    expect(await screen.findAllByText('Adicione a primeira condicionante')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()

    const detalhe = screen.getByRole('region', { name: 'Detalhe da condicionante' })
    await usuario.click(within(detalhe).getByRole('button', { name: 'Obrigação' }))
    const form = await screen.findByRole('form', { name: 'Nova condicionante' })
    await usuario.click(within(form).getByRole('button', { name: 'Adicionar' }))
    expect(await within(form).findByText('Informe o título')).toBeInTheDocument()

    await usuario.type(within(form).getByLabelText('Código'), '4.2')
    await usuario.type(within(form).getByLabelText('Título'), 'Relatório trimestral de efluentes')
    await usuario.type(
      within(form).getByLabelText('Texto literal da licença'),
      'Apresentar trimestralmente…',
    )
    await usuario.click(within(form).getByRole('button', { name: 'Adicionar' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'salvar_condicionante',
      expect.objectContaining({
        p_instrumento_id: 'i1',
        p_codigo: '4.2',
        p_titulo: 'Relatório trimestral de efluentes',
        p_natureza: 'obrigacao',
      }) as unknown,
    )
  })
})

describe('passo 4: prazos (LIC-03)', () => {
  it('trimestral sugere a partir da assinatura, simula e confirma com a fonte', async () => {
    falso.reiniciar(
      cenario({ tabelas: { condicionante: [condicionante('c1', '4.2', 'Relatório trimestral')] } }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/licencas/i1/prazos')

    // Sem recorrência escolhida nem lida pela IA: não há o que confirmar na linha.
    expect(await screen.findByRole('button', { name: 'Definir prazo de 4.2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()

    await usuario.click(screen.getByRole('button', { name: 'Relatório trimestral' }))
    const painel = await screen.findByRole('region', { name: 'Prazo de 4.2' })
    expect(within(painel).getByRole('button', { name: 'Confirmar prazo' })).toBeDisabled()

    await usuario.click(within(painel).getByRole('button', { name: 'Trimestral' }))
    expect(within(painel).getByText('Sugerida: 14/05/2023.')).toBeInTheDocument()
    const proximas = within(painel).getByRole('list', { name: 'Próximas datas' })
    expect(within(proximas).getByText('14/05/2023')).toBeInTheDocument()
    expect(within(proximas).getByText('14/08/2023')).toBeInTheDocument()
    expect(within(painel).getByRole('radio', { name: 'Dias úteis' })).toBeDisabled()

    await usuario.click(within(painel).getByRole('button', { name: 'Confirmar prazo' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('confirmar_prazo', {
      p_condicionante_id: 'c1',
      p_recorrencia: 'trimestral',
      p_unidade: null,
      p_intervalo: null,
      p_contagem: 'corridos',
      p_data_referencia: '2023-02-14',
      p_primeira_data: '2023-05-14',
      p_fonte_regra: 'Texto literal de Relatório trimestral',
    })
  })
})

describe('passo 4: confirmação rápida com a recorrência lida pela IA', () => {
  const daIa = (id: string, codigo: string, titulo: string, periodicidade: string) => ({
    ...condicionante(id, codigo, titulo),
    origem: 'ia',
    proposta_ia: { periodicidade },
  })

  it('a tabela mostra a sugestão e o botão da linha confirma com ela', async () => {
    falso.reiniciar(
      cenario({
        tabelas: { condicionante: [daIa('c1', '4.2', 'Relatório trimestral', 'trimestral')] },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/licencas/i1/prazos')

    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByText('Trimestral')).toBeInTheDocument()
    expect(within(tabela).getByText('sugerida pela leitura da IA')).toBeInTheDocument()
    expect(within(tabela).getByText('14/05/2023')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Confirmar prazo de 4.2' }))
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('confirmar_prazo', {
        p_condicionante_id: 'c1',
        p_recorrencia: 'trimestral',
        p_unidade: null,
        p_intervalo: null,
        p_contagem: 'corridos',
        p_data_referencia: '2023-02-14',
        p_primeira_data: '2023-05-14',
        p_fonte_regra: 'Texto literal de Relatório trimestral',
      })
    })
  })

  it('"Confirmar todos" confirma as sugestões claras; a ambígua fica para o painel', async () => {
    falso.reiniciar(
      cenario({
        tabelas: {
          condicionante: [
            daIa('c1', '4.2', 'Relatório trimestral', 'trimestral'),
            daIa('c2', '5.1', 'Laudo anual de ruído', 'anualmente'),
            daIa('c3', '3.2', 'Inventário de resíduos', 'anual e na renovação da licença'),
          ],
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/licencas/i1/prazos')

    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByRole('button', { name: 'Definir prazo de 3.2' })).toBeInTheDocument()
    await usuario.click(within(tabela).getByRole('button', { name: 'Confirmar todos (2)' }))
    await waitFor(() => {
      expect(
        falso.cliente.rpc.mock.calls
          .filter(([nome]) => nome === 'confirmar_prazo')
          .map(
            ([, args]) =>
              (args as { p_condicionante_id: string; p_recorrencia: string }).p_recorrencia,
          ),
      ).toEqual(['trimestral', 'anual'])
    })
  })
})

describe('passo 5: responsáveis e ativação (LIC-04, LIC-05)', () => {
  beforeEach(() => {
    falso.reiniciar(
      cenario({
        tabelas: {
          condicionante: [
            condicionante('c1', '4.2', 'Relatório trimestral', {
              recorrencia: 'trimestral',
              primeira_data: '2023-05-14',
              prazo_confirmado_em: '2026-10-12T13:00:00Z',
              confirmador: { nome: 'Eduardo Karnopp' },
            }),
          ],
        },
      }),
    )
  })

  it('atribuir a todos pede confirmação; salvar ativa e mostra o total', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/licencas/i1/responsaveis')

    expect(await screen.findByText(/1 sem responsável/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Atribuir a todos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atribuir a todos' })
    await usuario.selectOptions(
      within(dialogo).getByRole('combobox', { name: 'Responsável' }),
      'm-bruno',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Atribuir a Bruno Kist' }))
    expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_a_todos', {
      p_instrumento_id: 'i1',
      p_membro_id: 'm-bruno',
    })

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Plano ativado. 8 ocorrências criadas.')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'ativar_plano',
      expect.objectContaining({ p_instrumento_id: 'i1', p_row_version: 3 }) as unknown,
    )
    expect(screen.getByRole('link', { name: 'Ver na visão da equipe' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('não tem violações de acessibilidade detectáveis pelo axe', async () => {
    const { container } = renderizarApp('/licencas/i1/responsaveis')
    await screen.findByText(/1 sem responsável/)
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
