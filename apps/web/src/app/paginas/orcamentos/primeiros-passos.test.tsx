// Primeiros passos do orçamento (ADR-0020, ADR-0023): link discreto que não bloqueia, seis passos
// salvos a cada passo (nulo continua nulo), retomada, conflitos e publicação que leva ao novo
// orçamento.

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { digitarReais } from '@/test/digitar'
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
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
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

  // Orçamento rápido (ADR-0023): o convite grande saiu da lista; no lugar, um link discreto.
  it('a lista não bloqueia: sem base publicada, só o link "Calcular preço pelos custos"', async () => {
    renderizarApp('/orcamentos')
    const link = await screen.findByRole('link', { name: 'Calcular preço pelos custos' })
    expect(link).toHaveAttribute('href', '/orcamentos/primeiros-passos')
    expect(
      screen.queryByRole('region', { name: 'Configure os preços em poucos passos' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ver orçamentos mesmo assim' }),
    ).not.toBeInTheDocument()
    // Não bloqueia: dá para criar orçamento direto.
    expect(screen.getAllByRole('button', { name: 'Novo orçamento' }).length).toBeGreaterThan(0)
    // O atalho continua na lista, no menu "…" do cabeçalho.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mais opções' }))
    expect(await screen.findByRole('menuitem', { name: 'Primeiros passos' })).toHaveAttribute(
      'href',
      '/orcamentos/primeiros-passos',
    )
  })

  it('com rascunho, o link continua; com a base publicada, some', async () => {
    falso.reiniciar(
      servidor({
        rascunho: rascunhoDoBanco(
          { passo_1: passoEquipe },
          { etapa: 2, atualizado_por_nome: 'Helena Costa' },
        ),
      }),
    )
    const primeiro = renderizarApp('/orcamentos')
    expect(
      await screen.findByRole('link', { name: 'Calcular preço pelos custos' }),
    ).toBeInTheDocument()
    primeiro.unmount()

    falso.reiniciar(servidor({ base: { row_version: 1 } }))
    const segundo = renderizarApp('/orcamentos')
    await screen.findByText('Nenhum orçamento ainda')
    await waitFor(() => {
      expect(chamadas('obter_rascunho_configuracao_orcamento').length).toBeGreaterThan(0)
    })
    expect(
      screen.queryByRole('link', { name: 'Calcular preço pelos custos' }),
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
    await digitarReais(usuario, screen.getByLabelText('Pró-labore mensal da linha 1'), '10.000,00')
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
    await usuario.click(screen.getByRole('button', { name: 'Adicionar profissional' }))
    await usuario.selectOptions(
      screen.getByLabelText('Profissão do profissional 1'),
      'Engenheiro ambiental',
    )
    await usuario.type(screen.getByLabelText('Nível do profissional 1'), 'Licenciamento')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hora de profissional, linha 1: informe o preço (digite 0 se não cobra).',
    )
    expect(chamadas('salvar_passo_configuracao_orcamento')).toHaveLength(2)
    await usuario.type(screen.getByLabelText('Preço por hora do profissional 1'), '200,00')
    // Serviço sem "Quem faz": o custo usa a média da equipe.
    await usuario.click(screen.getByRole('button', { name: 'Adicionar serviço' }))
    await usuario.type(screen.getByLabelText('Serviço 1'), 'PGRSS')
    await usuario.selectOptions(screen.getByLabelText('Unidade do serviço 1'), 'pacote')
    await usuario.type(screen.getByLabelText('Preço do serviço 1'), '1.500,00')
    // Visita por km rodado: R$ 6,00 ÷ 12 km/l = R$ 0,50 por km.
    expect(screen.getByLabelText('Valor de uma visita técnica (R$)')).toBeInTheDocument()
    await usuario.click(screen.getByRole('radio', { name: 'Cobramos por km rodado' }))
    expect(screen.queryByLabelText('Valor de uma visita técnica (R$)')).not.toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Consumo do carro (km/l)'), '12')
    await usuario.type(screen.getByLabelText('Preço do combustível (R$/l)'), '6,00')
    expect(screen.getByText('R$ 0,50 por km')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await screen.findByRole('heading', { name: 'Passo 4 de 6: Tributos e margens' })
    expect(chamadas('salvar_passo_configuracao_orcamento')[2]).toMatchObject({
      p_etapa: 3,
      p_dados: {
        deslocamento_modo: 'km',
        valor_visita_centavos: null,
        custo_km_centavos: 50,
        consumo_km_por_litro: 12,
        preco_combustivel_centavos: 600,
        acrescimo_km_centavos: null,
        horas_venda: [
          { profissao: 'Engenheiro ambiental', atividade: 'Licenciamento', valor_centavos: 20_000 },
          { profissao: '', atividade: 'PGRSS', unidade: 'pacote', valor_centavos: 150_000 },
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
    expect(within(resumo).getByText('2 linhas')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Criar o primeiro orçamento' }))
    expect(await screen.findByRole('dialog', { name: 'Novo orçamento' })).toBeInTheDocument()
    expect(chamadas('publicar_configuracao_orcamento')).toEqual([
      { p_consultoria_id: 'c-Filtroville', p_row_version: 5 },
    ])
  }, 20_000)

  it('no passo 1, a profissão da linha grava na hora no cadastro da pessoa, com o cargo dela', async () => {
    // Cópia dos membros: o servidor falso grava a profissão como o banco, e a releitura mostra.
    const cadastro: Linha[] = membros.map((m) =>
      m.id === 'm-helena' ? { ...m, cargo: 'analista_pleno', profissao: null } : { ...m },
    )
    const base = servidor()
    falso.reiniciar({
      ...base,
      tabelas: { membro: cadastro },
      rpc: {
        ...base.rpc,
        definir_profissao_e_cargo: (a) => {
          const pessoa = cadastro.find((m) => m.id === a.p_membro_id)
          if (pessoa) pessoa.profissao = a.p_profissao
          return { data: null }
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await screen.findByRole('heading', { name: 'Passo 1 de 6: Sua equipe' })
    // Sem pessoa escolhida, não há o que gravar: nem caixa nem link para a Equipe.
    expect(screen.queryByLabelText('Profissão da linha 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Definir em Equipe/ })).not.toBeInTheDocument()
    // O texto cinza de introdução saiu.
    expect(screen.queryByText(/Seis passos curtos/)).not.toBeInTheDocument()

    await escolherPessoa(usuario, 1, 'm-helena')
    const profissao = screen.getByRole('combobox', { name: 'Profissão da linha 1' })
    expect(profissao).toHaveDisplayValue('Não informada')
    await usuario.selectOptions(profissao, 'Biólogo')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('definir_profissao_e_cargo', {
      p_membro_id: 'm-helena',
      p_profissao: 'biologo',
      p_cargo: 'analista_pleno',
    })
    // Relê os membros ativos e mostra o que ficou gravado; o rascunho não é salvo por isso.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Profissão da linha 1' })).toHaveDisplayValue(
        'Biólogo',
      )
    })
    expect(chamadas('salvar_passo_configuracao_orcamento')).toHaveLength(0)

    // Profissão preenchida não se apaga (só troca): a opção "Não informada" some.
    expect(
      within(screen.getByRole('combobox', { name: 'Profissão da linha 1' })).queryByRole('option', {
        name: 'Não informada',
      }),
    ).not.toBeInTheDocument()
  })

  it('no passo 1, pessoa, profissão e forma escolhidas aparecem por inteiro como texto', async () => {
    const base = servidor()
    falso.reiniciar({
      ...base,
      tabelas: {
        membro: membros.map((m) =>
          m.id === 'm-eduardo' ? { ...m, profissao: 'eng_ambiental_sanitarista' } : { ...m },
        ),
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await escolherPessoa(usuario, 1, 'm-eduardo')
    await usuario.selectOptions(screen.getByLabelText('Como recebe na linha 1'), 'pro_labore')
    // O select nativo corta o texto escolhido; o texto ao lado dele quebra linha.
    const linha = screen.getByLabelText('Profissão da linha 1').closest('tr')
    if (!linha) throw new Error('linha da equipe não encontrada')
    const textos = within(linha)
      .getAllByText(/./, { selector: '[data-texto-da-selecao] > span' })
      .map((t) => t.textContent)
    expect(textos).toEqual(['Eduardo Karnopp', 'Engenheiro ambiental e sanitarista', 'Pró-labore'])
  })

  it('o salário mensal da linha mostra o ponto de milhar enquanto digita', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    const custo = await screen.findByLabelText('Salário mensal da linha 1')
    await usuario.type(custo, '40000')
    expect(custo).toHaveValue('40.000')
    // Com centavos, digitando tecla a tecla como uma pessoa.
    await usuario.clear(custo)
    await digitarReais(usuario, custo, '1234567,891')
    expect(custo).toHaveValue('1.234.567,89')
    // Teclas mais rápidas que um quadro de tela (macro, colar tecla a tecla): não embaralha.
    await usuario.clear(custo)
    await usuario.type(custo, '9600,00')
    expect(custo).toHaveValue('9.600,00')
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
    expect(await screen.findByLabelText('Pró-labore mensal da linha 1')).toHaveValue('10.000,00')
    expect(screen.getByLabelText('Salário mensal da linha 2')).toHaveValue('')
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
    // Visita cadastrada continua (base sem modo e só com visita: por visita); o km não aparece.
    expect(screen.getByRole('radio', { name: 'Cobramos por visita' })).toBeChecked()
    expect(screen.getByLabelText('Valor de uma visita técnica (R$)')).toHaveValue('150,00')
    expect(screen.queryByLabelText('Consumo do carro (km/l)')).not.toBeInTheDocument()
  })

  it('conflito de versão mantém o que foi digitado e oferece recarregar', async () => {
    falso.reiniciar(servidor({ erroAoSalvar: 'conflito_de_versao' }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await escolherPessoa(usuario, 1, 'm-eduardo')
    await digitarReais(usuario, screen.getByLabelText('Salário mensal da linha 1'), '10.000,00')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Outra pessoa da gestão salvou esta configuração')
    expect(within(alerta).getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Salário mensal da linha 1')).toHaveValue('10.000,00')
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
    expect(
      await screen.findByRole('link', { name: 'Calcular preço pelos custos' }),
    ).toBeInTheDocument()
  })

  it('sair com mudança não salva pergunta antes', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/primeiros-passos')
    await usuario.type(await screen.findByLabelText('Salário mensal da linha 1'), '1')
    await usuario.click(screen.getByRole('button', { name: 'Ver orçamentos mesmo assim' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Sair sem salvar?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar aqui' }))
    expect(screen.getByRole('heading', { name: 'Passo 1 de 6: Sua equipe' })).toBeInTheDocument()
    expect(screen.getByLabelText('Salário mensal da linha 1')).toHaveValue('1')
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
