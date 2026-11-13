// Primeiros passos do orçamento (ADR-0020): convite que não bloqueia, seis passos salvos a cada
// passo (nulo continua nulo), retomada, conflitos e publicação que leva ao novo orçamento.

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

const membros = [
  { id: 'm-eduardo', nome: 'Eduardo Karnopp', papel: 'gestao', cargo: null, foto: null },
  { id: 'm-helena', nome: 'Helena Costa', papel: 'equipe', cargo: null, foto: null },
]

type Linha = Record<string, unknown>

/** Rascunho como o banco devolve. */
function rascunhoDoBanco(dados: Linha, extra: Linha = {}): Linha {
  return {
    dados,
    etapa: 1,
    row_version: 1,
    base_row_version: 0,
    pendencias: [],
    atualizado_em: '2026-11-13T17:02:00Z',
    atualizado_por_nome: 'Eduardo Karnopp',
    ...extra,
  }
}

const passoEquipe = {
  modo: 'equipe',
  hora_tecnica_centavos: null,
  equipe: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      membro_id: 'm-eduardo',
      socio: true,
      profissao: 'Engenheiro',
      tipo_recebimento: 'pro_labore',
      custo_mensal_centavos: 1_000_000,
      horas_disponiveis_mes: 160,
      custo_diaria_centavos: null,
      horas_por_diaria: null,
      dias_no_mes: null,
      custo_projeto_centavos: null,
      horas_projeto: null,
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      membro_id: 'm-helena',
      socio: false,
      profissao: 'Bióloga',
      tipo_recebimento: 'clt',
      custo_mensal_centavos: null,
      horas_disponiveis_mes: 173,
      custo_diaria_centavos: null,
      horas_por_diaria: null,
      dias_no_mes: null,
      custo_projeto_centavos: null,
      horas_projeto: null,
    },
  ],
}
const passoContas = {
  custos_fixos_mensais_centavos: 50_000,
  contas: [],
  horas_faturaveis_mes: null,
}
const passoPrecos = {
  valor_visita_centavos: null,
  custo_km_centavos: null,
  horas_venda: [
    {
      id: 'venda-1',
      profissao: 'Engenheiro',
      atividade: 'Licenciamento',
      valor_centavos: 20_000,
      fonte: null,
      unidade: 'hora',
      minutos_por_unidade: null,
      minimo_centavos: null,
      faixas: [],
    },
  ],
}
const passoTributos = {
  tributos_pb: 600,
  taxas_pb: 0,
  taxa_por_cobranca_centavos: 0,
  taxa_por_assinatura_centavos: 0,
  margem_desejada_pb: 3_000,
  margem_minima_pb: 2_500,
  margens_confirmadas: true,
}

/**
 * Servidor falso dos primeiros passos: guarda o rascunho e confere a versão como o banco
 * (salvar_passo_configuracao_orcamento e publicar_configuracao_orcamento).
 */
function servidor(
  inicial: {
    rascunho?: Linha | null
    base?: Linha | null
    dispensado?: boolean
    papel?: 'gestao' | 'equipe'
    erroAoSalvar?: string
    erroAoPublicar?: string
  } = {},
): Cenario {
  let rascunho = inicial.rascunho ?? null
  let dispensado = inicial.dispensado ?? false
  const base = inicial.base ?? null
  return {
    sessao: eduardo,
    tabelas: { membro: membros },
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', inicial.papel ?? 'gestao')] },
      listar_orcamentos: { data: [] },
      obter_base_de_custos: { data: base },
      obter_identidade_da_consultoria: { data: null },
      obter_rascunho_configuracao_orcamento: () => ({
        data: {
          rascunho,
          dispensado,
          base_configurada: base !== null,
          base_row_version: (base?.row_version as number | undefined) ?? 0,
        },
      }),
      salvar_passo_configuracao_orcamento: (a) => {
        if (inicial.erroAoSalvar) return { error: { message: inicial.erroAoSalvar } }
        const versao = (rascunho?.row_version as number | undefined) ?? 0
        if (a.p_row_version !== versao) return { error: { message: 'conflito_de_versao' } }
        rascunho = rascunhoDoBanco(
          {
            ...((rascunho?.dados as Linha | undefined) ?? {}),
            [`passo_${String(a.p_etapa)}`]: a.p_dados,
          },
          {
            etapa: a.p_proxima_etapa,
            row_version: versao + 1,
            base_row_version: rascunho?.base_row_version ?? a.p_base_row_version,
          },
        )
        return { data: rascunho }
      },
      dispensar_convite_configuracao_orcamento: () => {
        dispensado = true
        return { data: null }
      },
      descartar_rascunho_configuracao_orcamento: () => {
        rascunho = null
        return { data: null }
      },
      publicar_configuracao_orcamento: (a) => {
        if (inicial.erroAoPublicar) return { error: { message: inicial.erroAoPublicar } }
        if (a.p_row_version !== rascunho?.row_version)
          return { error: { message: 'conflito_de_versao' } }
        rascunho = null
        return { data: 1 }
      },
    },
  }
}

/** Escolhe a pessoa da linha depois que os membros carregaram. */
async function escolherPessoa(
  usuario: ReturnType<typeof userEvent.setup>,
  linha: number,
  id: string,
) {
  const campo = await screen.findByLabelText(`Pessoa da linha ${String(linha)}`)
  await within(campo).findByRole('option', { name: membros.find((m) => m.id === id)?.nome ?? id })
  await usuario.selectOptions(campo, id)
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls
    .filter(([n]) => n === nome)
    .map(([, args]) => args ?? {})
}

describe('primeiros passos do orçamento (ADR-0020)', () => {
  beforeEach(() => {
    falso.reiniciar(servidor())
  })

  it('a Equipe vê "sem permissão" e não lê o rascunho', async () => {
    falso.reiniciar(servidor({ papel: 'equipe' }))
    renderizarApp('/orcamentos/primeiros-passos')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(chamadas('obter_rascunho_configuracao_orcamento')).toHaveLength(0)
  })

  it('a lista convida sem bloquear; "Ver orçamentos mesmo assim" fica guardado', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')
    const convite = await screen.findByRole('region', {
      name: 'Configure os preços em poucos passos',
    })
    expect(
      within(convite).getByRole('link', { name: 'Configurar em poucos passos' }),
    ).toHaveAttribute('href', '/orcamentos/primeiros-passos')
    // Não bloqueia: dá para criar orçamento direto.
    expect(screen.getAllByRole('button', { name: 'Novo orçamento' }).length).toBeGreaterThan(0)

    await usuario.click(within(convite).getByRole('button', { name: 'Ver orçamentos mesmo assim' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: 'Configure os preços em poucos passos' }),
      ).not.toBeInTheDocument()
    })
    expect(chamadas('dispensar_convite_configuracao_orcamento')).toHaveLength(1)
    // O atalho continua na lista.
    expect(screen.getByRole('link', { name: 'Primeiros passos' })).toBeInTheDocument()
  })

  it('com rascunho, o convite diz "Continuar configuração"; com base ou dispensado, não aparece', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          { passo_1: passoEquipe },
          { etapa: 2, atualizado_por_nome: 'Helena Costa' },
        ),
      }),
    )
    const primeiro = renderizarApp('/orcamentos')
    expect(await screen.findByRole('link', { name: 'Continuar configuração' })).toBeInTheDocument()
    expect(screen.getByText(/última alteração por Helena Costa/)).toBeInTheDocument()
    primeiro.unmount()

    falso.reiniciar(servidor({ dispensado: true }))
    const segundo = renderizarApp('/orcamentos')
    await screen.findByText('Nenhum orçamento ainda')
    expect(
      screen.queryByRole('link', { name: 'Configurar em poucos passos' }),
    ).not.toBeInTheDocument()
    segundo.unmount()
  })

  it('percorre os seis passos salvando cada um e publica levando ao novo orçamento', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')

    // Passo 1: equipe pela forma de recebimento.
    expect(
      await screen.findByRole('heading', { name: 'Passo 1 de 6: Sua equipe' }),
    ).toBeInTheDocument()
    await escolherPessoa(usuario, 1, 'm-eduardo')
    await usuario.selectOptions(screen.getByLabelText('Como recebe na linha 1'), 'pro_labore')
    await usuario.type(screen.getByLabelText('Custo mensal da linha 1'), '10.000,00')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '160')
    expect(screen.getByText('62,50')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))

    const passo2 = await screen.findByRole('heading', { name: 'Passo 2 de 6: Contas do mês' })
    await waitFor(() => {
      expect(passo2).toHaveFocus()
    })
    expect(chamadas('salvar_passo_configuracao_orcamento')[0]).toMatchObject({
      p_row_version: 0,
      p_etapa: 1,
      p_proxima_etapa: 2,
      p_base_row_version: 0,
      p_dados: {
        modo: 'equipe',
        equipe: [
          {
            membro_id: 'm-eduardo',
            tipo_recebimento: 'pro_labore',
            custo_mensal_centavos: 1_000_000,
            horas_disponiveis_mes: 160,
          },
        ],
      },
    })

    // Passo 2: as horas vêm da equipe; o total 0 digitado vale como zero.
    expect(screen.getByText('160 h')).toBeInTheDocument()
    expect(screen.getByText('Contas do mês (pode ser 0, se digitar)')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Total das contas por mês (R$)'), '0')
    expect(screen.getByText('R$ 0,00 por hora')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 3 de 6: Como vocês cobram' })
    expect(chamadas('salvar_passo_configuracao_orcamento')[1]).toMatchObject({
      p_row_version: 1,
      p_etapa: 2,
      p_dados: { custos_fixos_mensais_centavos: 0, contas: [], horas_faturaveis_mes: null },
    })

    // Passo 3: preço em branco não vira zero; nenhuma tabela de referência é oferecida.
    expect(screen.queryByRole('button', { name: /ACEAMB/ })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Adicionar preço' }))
    await usuario.type(screen.getByLabelText('Profissão da hora 1'), 'Engenheiro')
    await usuario.type(screen.getByLabelText('Atividade ou nível da hora 1'), 'Licenciamento')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tabela de preços, linha 1: informe o preço (digite 0 se não cobra).',
    )
    expect(chamadas('salvar_passo_configuracao_orcamento')).toHaveLength(2)
    await usuario.type(screen.getByLabelText('Preço da linha 1'), '200,00')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 4 de 6: Tributos e margens' })
    expect(chamadas('salvar_passo_configuracao_orcamento')[2]).toMatchObject({
      p_etapa: 3,
      p_dados: {
        valor_visita_centavos: null,
        custo_km_centavos: null,
        horas_venda: [
          { profissao: 'Engenheiro', atividade: 'Licenciamento', valor_centavos: 20_000 },
        ],
      },
    })

    // Passo 4: tributos digitados, taxas zeradas por ação explícita e margens confirmadas.
    expect(screen.getByLabelText('Tributos sobre o faturamento (%)')).toHaveValue('')
    await usuario.type(screen.getByLabelText('Tributos sobre o faturamento (%)'), '6')
    await usuario.click(screen.getByRole('button', { name: 'Não pagamos nenhuma destas taxas' }))
    await usuario.click(
      screen.getByLabelText('Confirmo que estas margens são da minha consultoria'),
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 5 de 6: Sua proposta (opcional)' })
    expect(chamadas('salvar_passo_configuracao_orcamento')[3]).toMatchObject({
      p_etapa: 4,
      p_dados: {
        tributos_pb: 600,
        taxas_pb: 0,
        taxa_por_cobranca_centavos: 0,
        taxa_por_assinatura_centavos: 0,
        margem_desejada_pb: 3_000,
        margem_minima_pb: 2_500,
        margens_confirmadas: true,
      },
    })

    // Passo 5: opcional; a logo espera os dados salvos.
    expect(
      await screen.findByText('Salve os dados abaixo para habilitar o envio da logo.'),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByRole('heading', { name: 'Passo 6 de 6: Resumo' })
    expect(chamadas('salvar_passo_configuracao_orcamento')[4]).toMatchObject({
      p_etapa: 5,
      p_dados: {},
      p_proxima_etapa: 6,
    })

    // Passo 6: resumo e publicação explícita.
    const resumo = screen.getByLabelText('Resumo da configuração')
    expect(within(resumo).getByText('R$ 62,50')).toBeInTheDocument()
    expect(within(resumo).getByText('160 h, pela equipe')).toBeInTheDocument()
    expect(within(resumo).getByText('R$ 0,00 por hora')).toBeInTheDocument()
    expect(within(resumo).getByText('1 linha')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Criar o primeiro orçamento' }))
    expect(await screen.findByRole('dialog', { name: 'Novo orçamento' })).toBeInTheDocument()
    expect(chamadas('publicar_configuracao_orcamento')).toEqual([
      { p_consultoria_id: 'c-Filtroville', p_row_version: 5 },
    ])
  })

  it('retoma onde parou, com o que outra pessoa salvou, e custo desconhecido continua nulo', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          { passo_1: passoEquipe, passo_2: passoContas },
          { etapa: 3, row_version: 2, atualizado_por_nome: 'Helena Costa' },
        ),
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    expect(
      await screen.findByRole('heading', { name: 'Passo 3 de 6: Como vocês cobram' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Última alteração por Helena Costa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Passo 1: Sua equipe, salvo/ })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Passo 1: Sua equipe/ }))
    await screen.findByRole('heading', { name: 'Passo 1 de 6: Sua equipe' })
    expect(await screen.findByLabelText('Custo mensal da linha 1')).toHaveValue('10.000,00')
    expect(screen.getByLabelText('Custo mensal da linha 2')).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 2 de 6: Contas do mês' })
    const salvo = chamadas('salvar_passo_configuracao_orcamento')[0]
    expect(salvo).toMatchObject({ p_row_version: 2, p_etapa: 1 })
    expect((salvo?.p_dados as { equipe: Linha[] }).equipe[1]).toMatchObject({
      custo_mensal_centavos: null,
      horas_disponiveis_mes: 173,
    })
  })

  it('reabrir com base publicada parte dos valores dela e diz a versão', async () => {
    falso.reiniciar(
      servidor({
        base: {
          hora_tecnica_centavos: 9_500,
          custos_fixos_mensais_centavos: 960_000,
          custos_fixos_equipe_centavos: 0,
          custos_fixos_detalhe: [],
          horas_faturaveis_mes: 320,
          margem_desejada_pb: 3_000,
          margem_minima_pb: 2_500,
          tributos_pb: 600,
          taxas_pb: 0,
          taxa_por_cobranca_centavos: 199,
          taxa_por_assinatura_centavos: 400,
          valor_visita_centavos: 15_000,
          custo_km_centavos: 0,
          horas_venda: passoPrecos.horas_venda,
          custo_hora_profissao: [],
          custo_hora_membro: [],
          equipe: [],
          row_version: 4,
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    expect(await screen.findByLabelText('Custo da hora técnica (R$)')).toHaveValue('95,00')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 2 de 6: Contas do mês' })
    expect(screen.getByLabelText('Horas faturáveis por mês')).toHaveValue('320')
    expect(chamadas('salvar_passo_configuracao_orcamento')[0]).toMatchObject({
      p_row_version: 0,
      p_base_row_version: 4,
      p_dados: { modo: 'manual', equipe: [], hora_tecnica_centavos: 9_500 },
    })
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 3 de 6: Como vocês cobram' })
    // Visita cadastrada continua; km 0 ("não cadastrado") fica em branco, não vira valor.
    expect(screen.getByLabelText('Valor de uma visita técnica (R$)')).toHaveValue('150,00')
    expect(screen.getByLabelText('Valor por km rodado (R$)')).toHaveValue('')
  })

  it('conflito de versão mantém o que foi digitado e oferece recarregar', async () => {
    falso.reiniciar(servidor({ erroAoSalvar: 'conflito_de_versao' }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await escolherPessoa(usuario, 1, 'm-eduardo')
    await usuario.type(screen.getByLabelText('Custo mensal da linha 1'), '10.000,00')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Outra pessoa da gestão salvou esta configuração')
    expect(within(alerta).getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Custo mensal da linha 1')).toHaveValue('10.000,00')
    expect(screen.getByRole('heading', { name: 'Passo 1 de 6: Sua equipe' })).toBeInTheDocument()
  })

  it('base salva em Custos e taxas durante o rascunho: não publica e oferece recomeçar', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          {
            passo_1: passoEquipe,
            passo_2: passoContas,
            passo_3: passoPrecos,
            passo_4: passoTributos,
            passo_5: {},
          },
          { etapa: 6, row_version: 5, base_row_version: 0 },
        ),
        base: {
          ...passoTributos,
          horas_venda: [],
          equipe: [],
          custos_fixos_detalhe: [],
          row_version: 2,
        },
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await screen.findByRole('heading', { name: 'Passo 6 de 6: Resumo' })
    expect(screen.getByText(/Custos e taxas foram salvos por outra pessoa/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /criar orçamento$|Criar o primeiro/ }),
    ).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Recomeçar com os valores atuais' }))
    await waitFor(() => {
      expect(chamadas('descartar_rascunho_configuracao_orcamento')).toEqual([
        { p_consultoria_id: 'c-Filtroville', p_row_version: 5 },
      ])
    })
    expect(
      await screen.findByRole('heading', { name: 'Passo 1 de 6: Sua equipe' }),
    ).toBeInTheDocument()
    expect(chamadas('publicar_configuracao_orcamento')).toHaveLength(0)
  })

  it('com pendências, o resumo lista o que falta e permite criar orçamento sem preço', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          {
            passo_1: passoEquipe,
            passo_2: { ...passoContas, custos_fixos_mensais_centavos: null },
            passo_4: { ...passoTributos, taxa_por_assinatura_centavos: null },
          },
          { etapa: 6, row_version: 3 },
        ),
      }),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await screen.findByRole('heading', { name: 'Passo 6 de 6: Resumo' })
    const lista = screen.getByRole('region', { name: 'Falta configurar para calcular o preço' })
    expect(within(lista).getByText('Contas do mês (pode ser 0, se digitar)')).toBeInTheDocument()
    expect(within(lista).getByText('Tabela de preços (ao menos uma linha)')).toBeInTheDocument()
    expect(
      within(lista).getByText(
        'Taxas de cobrança e por documento assinado (pode ser 0, se digitar)',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Criar o primeiro orçamento' }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Resumo da configuração')).getByText('R$ 62,50'),
    ).toBeInTheDocument()

    await usuario.click(within(lista).getByRole('button', { name: 'Ir ao passo 3' }))
    await screen.findByRole('heading', { name: 'Passo 3 de 6: Como vocês cobram' })
    await usuario.click(screen.getByRole('button', { name: /Passo 6: Resumo/ }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Criar orçamento sem preço calculado' }),
    )
    expect(await screen.findByRole('dialog', { name: 'Novo orçamento' })).toBeInTheDocument()
    expect(chamadas('publicar_configuracao_orcamento')).toHaveLength(0)
  })

  it('salvar e continuar depois guarda o passo, mesmo incompleto, e volta para a lista', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await escolherPessoa(usuario, 1, 'm-eduardo')
    await usuario.type(screen.getByLabelText('Horas no mês da linha 1'), '160')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar depois' }))
    await screen.findByText('Nenhum orçamento ainda')
    expect(screen.queryByRole('dialog', { name: 'Sair sem salvar?' })).not.toBeInTheDocument()
    expect(chamadas('salvar_passo_configuracao_orcamento')[0]).toMatchObject({
      p_etapa: 1,
      p_proxima_etapa: 1,
      p_dados: { equipe: [{ custo_mensal_centavos: null, horas_disponiveis_mes: 160 }] },
    })
    expect(await screen.findByRole('link', { name: 'Continuar configuração' })).toBeInTheDocument()
  })

  it('sair com mudança não salva pergunta antes', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await usuario.type(await screen.findByLabelText('Custo mensal da linha 1'), '1')
    await usuario.click(screen.getByRole('button', { name: 'Ver orçamentos mesmo assim' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Sair sem salvar?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar aqui' }))
    expect(screen.getByRole('heading', { name: 'Passo 1 de 6: Sua equipe' })).toBeInTheDocument()
    expect(screen.getByLabelText('Custo mensal da linha 1')).toHaveValue('1')
  })

  it('não tem violações de acessibilidade detectáveis no passo 1, no 4 e no resumo', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          { passo_1: passoEquipe, passo_2: passoContas, passo_3: passoPrecos },
          { etapa: 4, row_version: 3 },
        ),
      }),
    )
    const usuario = userEvent.setup()
    const { container } = renderizarApp('/orcamentos/primeiros-passos')
    await screen.findByRole('heading', { name: 'Passo 4 de 6: Tributos e margens' })
    for (const passo of [/Passo 1: Sua equipe/, /Passo 6: Resumo/, null]) {
      const resultado = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(resultado.violations.map((v) => v.id)).toEqual([])
      if (passo) await usuario.click(screen.getByRole('button', { name: passo }))
    }
  })
})
