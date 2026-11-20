// Orçamento rápido (ADR-0023): sem custos e taxas configurados, o serviço recebe preço digitado e o
// orçamento sai com preço até a proposta; com a configuração, o preço digitado fica ao lado da
// tabela de preços e o Grama diz se ele cobre o custo.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { digitarReais } from '@/test/digitar'
import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

type Linha = Record<string, unknown>

// Hora técnica R$ 95, contas R$ 30 por hora, tributos 6%, R$ 4 por documento assinado.
const base = {
  hora_tecnica_centavos: 9_500,
  custo_fixo_hora_centavos: 3_000,
  margem_desejada_pb: 3_000,
  margem_minima_pb: 2_500,
  tributos_pb: 600,
  taxas_pb: 0,
  taxa_por_cobranca_centavos: 0,
  taxa_por_assinatura_centavos: 400,
  valor_visita_centavos: 15_000,
  custo_km_centavos: 0,
  deslocamento_modo: 'visita',
  custos_fixos_mensais_centavos: 960_000,
  custos_fixos_equipe_centavos: 0,
  custos_fixos_detalhe: [],
  horas_venda: [
    { id: 'venda', profissao: 'Engenheiro', atividade: 'Venda', valor_centavos: 9_500 },
  ],
  custo_hora_profissao: [],
  custo_hora_membro: [],
  registrada_em: '2026-11-06T19:00:00Z',
}

function orcamento(extra: Linha = {}): Linha {
  return {
    id: 'o7',
    consultoria_id: 'c-Filtroville',
    ano: 2026,
    sequencia: 7,
    revisao: 1,
    situacao: 'rascunho',
    empreendimento_id: null,
    empreendimento_nome: 'Padaria Pão Quente',
    prospecto: {
      nome: 'Padaria Pão Quente',
      cnpj: null,
      contato: null,
      email: null,
      telefone: null,
    },
    objeto: 'AUA da padaria',
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
    atualizado_em: '2026-11-14T10:00:00Z',
    row_version: 1,
    historico_situacao: [],
    itens: [],
    despesas: [],
    parcelas: [],
    ...extra,
  }
}

/**
 * Servidor falso do orçamento rápido: cria, guarda o que foi salvo e devolve com os preços como o
 * banco grava sem a base (preço digitado de cada item; visitas × valor de cada visita).
 */
function servidor(inicial: { base?: Linha | null; erroAoSalvar?: string } = {}): Cenario {
  let atual: Linha | null = null
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      listar_orcamentos: { data: [] },
      listar_empreendimentos: { data: [] },
      obter_identidade_da_consultoria: { data: null },
      obter_rascunho_configuracao_orcamento: {
        data: {
          rascunho: null,
          dispensado: false,
          base_configurada: Boolean(inicial.base),
          base_row_version: 0,
        },
      },
      criar_orcamento: (a) => {
        atual = orcamento({ id: a.p_id, base: inicial.base ?? null })
        return { data: a.p_id }
      },
      obter_orcamento: () => ({ data: atual }),
      salvar_orcamento: (a) => {
        if (inicial.erroAoSalvar) return { error: { message: inicial.erroAoSalvar } }
        const dados = a.p_dados as Linha & {
          itens: Linha[]
          visitas: { quantidade: number; outros_por_visita_centavos: number }
        }
        const versao = ((atual?.row_version as number | undefined) ?? 1) + 1
        atual = {
          ...atual,
          ...dados,
          row_version: versao,
          itens: dados.itens.map((i) => ({
            ...i,
            preco_automatico: true,
            preco_centavos: i.preco_fechado_centavos ?? 0,
          })),
          preco_visitas_centavos:
            dados.visitas.quantidade * dados.visitas.outros_por_visita_centavos,
        }
        return { data: versao }
      },
    },
  }
}

function primeiro(elementos: HTMLElement[]): HTMLElement {
  const [elemento] = elementos
  if (!elemento) throw new Error('elemento não encontrado')
  return elemento
}

function chamadas(nome: string): Record<string, unknown>[] {
  return falso.cliente.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args ?? {})
}

beforeEach(() => {
  falso.reiniciar(servidor())
  window.history.pushState({}, '', '/')
})

describe('orçamento rápido, sem custos e taxas configurados', () => {
  it('cria, digita o preço do serviço, vê o total e abre a proposta com o preço', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')

    // Criar: nada pede a configuração antes.
    expect(
      await screen.findByRole('link', { name: 'Calcular preço pelos custos' }),
    ).toHaveAttribute('href', '/orcamentos/primeiros-passos')
    await usuario.click(primeiro(screen.getAllByRole('button', { name: 'Novo orçamento' })))
    await usuario.click(screen.getByRole('radio', { name: 'Prospecto, ainda não cadastrado' }))
    await usuario.type(screen.getByLabelText(/Nome da empresa ou do cliente/), 'Padaria Pão Quente')
    await usuario.type(screen.getByLabelText(/O que será orçado/), 'AUA da padaria')
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))

    // Serviço com preço digitado: sem tabela de preços, é o único preço.
    await screen.findByRole('heading', { name: 'Padaria Pão Quente' })
    expect(screen.getByRole('columnheader', { name: 'Preço digitado (R$)' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
    expect(screen.queryByLabelText('Preço do item 1')).not.toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Serviço do item 1'), 'Licença ambiental simplificada')
    await usuario.type(screen.getByLabelText('Horas do item 1'), '6')
    const preco = screen.getByLabelText('Preço digitado do item 1')
    await digitarReais(usuario, preco, '1500')
    expect(preco).toHaveValue('1.500')

    // Visitas sem a base: quantidade × valor de cada visita, sem km.
    expect(screen.queryByLabelText('Km por visita, ida e volta')).not.toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Quantidade de visitas'), '2')
    await digitarReais(usuario, screen.getByLabelText('Valor de cada visita (R$)'), '200')

    // O total aparece; custo e margem não são calculados (nunca zero).
    // Os números ficam no resumo de valores, sempre à vista (lateral ou rodapé fixo).
    const numeros = screen.getByRole('region', { name: 'Resumo de valores' })
    expect(within(numeros).getByText('R$ 1.900,00')).toBeInTheDocument()
    expect(within(numeros).getByText('não calculado')).toBeInTheDocument()
    expect(screen.queryByText(/Custos e taxas ainda não configurados/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    const naProposta = await screen.findByRole('region', { name: 'Preço na proposta' })
    expect(within(naProposta).getByText('Licença ambiental simplificada')).toBeInTheDocument()
    expect(within(naProposta).getByText('1.500,00')).toBeInTheDocument()
    expect(within(naProposta).getByText('Visitas técnicas (2)')).toBeInTheDocument()
    expect(within(naProposta).getByText('não calculados')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Acréscimo sobre horas de venda/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Calcular preço pelos custos' })[0]).toHaveAttribute(
      'href',
      '/orcamentos/primeiros-passos',
    )

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      expect(chamadas('salvar_orcamento')).toHaveLength(1)
    })
    expect(chamadas('salvar_orcamento')[0]).toMatchObject({
      p_dados: {
        visitas: { quantidade: 2, km_por_visita: 0, outros_por_visita_centavos: 20_000 },
        itens: [
          {
            descricao: 'Licença ambiental simplificada',
            minutos: 360,
            hora_venda_id: null,
            preco_fechado_centavos: 150_000,
          },
        ],
      },
    })

    // A proposta abre com o preço, sem "a definir".
    const ver = await screen.findByRole('button', { name: 'Ver proposta pronta' })
    await waitFor(() => {
      expect(ver).toBeEnabled()
    })
    await usuario.click(ver)
    const proposta = await screen.findByRole('article', { name: 'Proposta ORC-2026-007' })
    const destaque = within(proposta).getByRole('region', { name: 'Valor total' })
    expect(destaque).toHaveTextContent('R$ 1.900,00')
    expect(within(proposta).queryByText('Valores a definir.')).not.toBeInTheDocument()
    expect(screen.queryByText(/O preço ainda está pendente/)).not.toBeInTheDocument()
    const tabela = within(proposta).getByRole('region', { name: 'Tabela do investimento' })
    expect(within(tabela).getByText('Licença ambiental simplificada')).toBeInTheDocument()
  }, 20_000)

  it('serviço sem preço digitado deixa o preço pendente', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      ...servidor(),
      rpc: {
        ...servidor().rpc,
        obter_orcamento: {
          data: orcamento({
            itens: [
              {
                id: 'i1',
                descricao: 'Diagnóstico',
                minutos: 60,
                preco_automatico: true,
                preco_centavos: 0,
                custo_direto_extra_centavos: 0,
                hora_venda_id: null,
                preco_fechado_centavos: null,
              },
            ],
          }),
        },
      },
    })
    renderizarApp('/orcamentos/o7')
    expect(await screen.findByLabelText('Preço digitado do item 1')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(
      screen.getAllByText('Custos e taxas ainda não configurados: digite o preço de cada serviço.')
        .length,
    ).toBeGreaterThan(0)
    await digitarReais(usuario, screen.getByLabelText('Preço digitado do item 1'), '800')
    await waitFor(() => {
      expect(screen.queryByText(/Custos e taxas ainda não configurados/)).not.toBeInTheDocument()
    })
  })

  it('erro ao salvar mostra a mensagem e mantém o que foi digitado', async () => {
    falso.reiniciar(servidor({ erroAoSalvar: 'item_invalido' }))
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos')
    await usuario.click(primeiro(await screen.findAllByRole('button', { name: 'Novo orçamento' })))
    await usuario.click(screen.getByRole('radio', { name: 'Prospecto, ainda não cadastrado' }))
    await usuario.type(screen.getByLabelText(/Nome da empresa ou do cliente/), 'Padaria Pão Quente')
    await usuario.type(screen.getByLabelText(/O que será orçado/), 'AUA da padaria')
    await usuario.click(screen.getByRole('button', { name: 'Criar rascunho' }))
    await usuario.click(await screen.findByRole('button', { name: 'Adicionar item' }))
    await usuario.type(screen.getByLabelText('Serviço do item 1'), 'Diagnóstico')
    await digitarReais(usuario, screen.getByLabelText('Preço digitado do item 1'), '900')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confira os itens: serviço, horas e valores.',
    )
    expect(screen.getByLabelText('Preço digitado do item 1')).toHaveValue('900,00')
  })

  it('modelo da consultoria traz o preço digitado de cada serviço', async () => {
    falso.reiniciar({
      ...servidor(),
      rpc: {
        ...servidor().rpc,
        obter_orcamento: { data: orcamento() },
        listar_modelos_de_orcamento: {
          data: {
            total: 1,
            itens: [
              {
                id: 'm1',
                nome: 'AUA simples',
                objeto: 'AUA',
                itens: [
                  {
                    descricao: 'Requerimento da AUA',
                    minutos: 120,
                    hora_venda_id: null,
                    unidade: 'hora',
                    preco_digitado_centavos: 150_000,
                  },
                ],
                despesas: [],
                premissas: [],
                exclusoes: [],
                row_version: 1,
              },
            ],
          },
        },
      },
    })
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o7')
    await usuario.click(await screen.findByRole('button', { name: 'Escolher modelo' }))
    const proprios = await screen.findByRole('region', { name: 'Modelos da consultoria' })
    await usuario.click(within(proprios).getByRole('button', { name: /^AUA simples/ }))
    await usuario.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }))
    expect(screen.getByLabelText('Serviço do item 1')).toHaveValue('Requerimento da AUA')
    expect(screen.getByLabelText('Preço digitado do item 1')).toHaveValue('1.500,00')
    expect(
      within(screen.getByRole('region', { name: 'Resumo de valores' })).getByText('R$ 1.500,00'),
    ).toBeInTheDocument()
  })

  it('não tem violações de acessibilidade detectáveis no serviço com preço digitado', async () => {
    falso.reiniciar({
      ...servidor(),
      rpc: {
        ...servidor().rpc,
        obter_orcamento: {
          data: orcamento({
            itens: [
              {
                id: 'i1',
                descricao: 'Diagnóstico',
                minutos: 60,
                preco_automatico: true,
                preco_centavos: 80_000,
                custo_direto_extra_centavos: 0,
                hora_venda_id: null,
                preco_fechado_centavos: 80_000,
              },
            ],
          }),
        },
      },
    })
    const { container } = renderizarApp('/orcamentos/o7')
    expect(await screen.findByLabelText('Preço digitado do item 1')).toHaveValue('800,00')
    const resultado = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(resultado.violations.map((v) => v.id)).toEqual([])
  })
})

describe('orçamento com custos e taxas configurados', () => {
  /** Orçamento com um serviço pela tabela (8h de engenheiro). */
  function comBase(itens: Linha[], extra: Linha = {}): Cenario {
    return {
      ...servidor({ base }),
      rpc: {
        ...servidor({ base }).rpc,
        obter_orcamento: { data: orcamento({ base, itens, ...extra }) },
        salvar_orcamento: { data: 2 },
      },
    }
  }

  it('o preço digitado fica ao lado da tabela de preços e vale como preço fechado', async () => {
    falso.reiniciar(
      comBase([
        {
          id: 'i1',
          descricao: 'Diagnóstico',
          minutos: 480,
          preco_automatico: true,
          preco_centavos: 0,
          custo_direto_extra_centavos: 0,
          hora_venda_id: 'venda',
        },
      ]),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o7')
    await screen.findByRole('heading', { name: 'Padaria Pão Quente' })
    await usuario.click(screen.getByRole('button', { name: 'Adicionar item' }))
    await usuario.type(screen.getByLabelText('Serviço do item 2'), 'Protocolo')
    const escolha = screen.getByLabelText('Preço do item 2')
    expect(within(escolha).getByRole('option', { name: 'Preço digitado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Preço digitado do item 2')).not.toBeInTheDocument()
    await usuario.selectOptions(escolha, 'Preço digitado')
    await digitarReais(usuario, screen.getByLabelText('Preço digitado do item 2'), '1200')
    expect(screen.getByLabelText('Preço digitado do item 2')).toHaveValue('1.200')
    // O primeiro serviço continua pela tabela.
    expect(screen.getByLabelText('Preço do item 1')).toHaveValue('venda')

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      expect(chamadas('salvar_orcamento')).toHaveLength(1)
    })
    expect(chamadas('salvar_orcamento')[0]).toMatchObject({
      p_dados: {
        itens: [
          { hora_venda_id: 'venda', preco_fechado_centavos: null },
          { descricao: 'Protocolo', hora_venda_id: null, preco_fechado_centavos: 120_000 },
        ],
      },
    })
  })

  it('preço digitado abaixo do custo: o Grama avisa que o preço não cobre o custo', async () => {
    falso.reiniciar(
      comBase([
        {
          id: 'i1',
          descricao: 'Diagnóstico',
          minutos: 600,
          preco_automatico: true,
          preco_centavos: 10_000,
          custo_direto_extra_centavos: 0,
          hora_venda_id: null,
          preco_fechado_centavos: 10_000,
        },
      ]),
    )
    const usuario = userEvent.setup()
    renderizarApp('/orcamentos/o7?etapa=preco')
    // 10h × (95 + 30) = 1.250 de custo; 100 − 1.250 − 6 de tributos − 4 de assinatura = −1.160.
    expect(await screen.findByText('O preço não cobre o custo: faltam R$ 1.160,00.')).toBeVisible()
    expect(screen.getByText('Margem que sobra:')).toBeInTheDocument()

    // Com um preço que cobre o custo, o aviso sai.
    await usuario.click(screen.getByRole('button', { name: 'Serviços' }))
    const preco = await screen.findByLabelText('Preço digitado do item 1')
    await usuario.clear(preco)
    await digitarReais(usuario, preco, '5000')
    await usuario.click(screen.getByRole('button', { name: 'Continuar para preço e margem' }))
    await screen.findByRole('region', { name: 'Divisão do valor' })
    expect(screen.queryByText(/O preço não cobre o custo/)).not.toBeInTheDocument()
  })
})
