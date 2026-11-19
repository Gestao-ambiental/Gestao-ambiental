// Proposta (Protótipo 21, modelo da Envora): rascunho marcado, valor logo de cara, tabela de
// investimento sem horas, validade com data, cliente e unidade, aceite e "Marcar como enviada".
import { adicionarDias, formatarDataCivil, hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const eduardo = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

const base = {
  hora_tecnica_centavos: 9_500,
  custo_fixo_hora_centavos: 3_000,
  margem_desejada_pb: 3_000,
  margem_minima_pb: 2_500,
  tributos_pb: 600,
  taxas_pb: 0,
  taxa_por_cobranca_centavos: 0,
  taxa_por_assinatura_centavos: 0,
  valor_visita_centavos: 15_000,
  custo_km_centavos: 0,
  custos_fixos_mensais_centavos: 0,
  custos_fixos_equipe_centavos: 0,
  custos_fixos_detalhe: [],
  horas_venda: [
    { id: 'hora', profissao: 'Engenheiro', atividade: 'Hora técnica', valor_centavos: 9_500 },
    {
      id: 'area',
      profissao: '',
      atividade: 'Levantamento',
      valor_centavos: 200,
      unidade: 'm2',
    },
    {
      id: 'pacote',
      profissao: '',
      atividade: 'Protocolo',
      valor_centavos: 120_000,
      unidade: 'pacote',
    },
  ],
  custo_hora_profissao: [],
  custo_hora_membro: [],
  registrada_em: '2026-11-06T19:00:00Z',
}

function orcamento(extra: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    consultoria_id: 'c-Filtroville',
    ano: 2026,
    sequencia: 41,
    revisao: 1,
    situacao: 'rascunho',
    empreendimento_id: 'e1',
    empreendimento_nome: 'Indústria Horizonte',
    objeto: 'Licença de operação',
    destinatario: 'Marina Couto',
    prazos: '30 dias após o recebimento dos documentos',
    validade_dias: 30,
    premissas: ['Uma visita técnica'],
    exclusoes: ['Análises laboratoriais'],
    moeda: 'BRL',
    margem_pb: null,
    forma_preco: 'tabela',
    visitas: { quantidade: 0, km_por_visita: 0, outros_por_visita_centavos: 0 },
    preco_visitas_centavos: 0,
    base,
    atualizado_em: '2026-11-06T19:42:00Z',
    row_version: 3,
    historico_situacao: [],
    itens: [
      {
        id: 'i1',
        hora_venda_id: 'hora',
        descricao: 'Diagnóstico ambiental',
        minutos: 480,
        preco_automatico: true,
        preco_centavos: 76_000,
        custo_direto_extra_centavos: 0,
      },
      {
        id: 'i2',
        hora_venda_id: 'area',
        descricao: 'Levantamento da área',
        minutos: 240,
        quantidade: '1250',
        preco_automatico: true,
        preco_centavos: 250_000,
        custo_direto_extra_centavos: 0,
      },
      {
        id: 'i3',
        hora_venda_id: 'pacote',
        descricao: 'Protocolo no órgão',
        minutos: 60,
        preco_automatico: false,
        preco_fechado_centavos: 120_000,
        preco_centavos: 120_000,
        custo_direto_extra_centavos: 0,
      },
    ],
    despesas: [
      {
        id: 'd1',
        descricao: 'Taxa do órgão ambiental',
        estimativa_centavos: 341_200,
        tratamento: 'cliente_direto',
      },
    ],
    parcelas: [
      { id: 'p1', descricao: 'Assinatura do contrato', dias: 0, percentual_pb: 5_000 },
      { id: 'p2', descricao: 'Protocolo no órgão', dias: 30, percentual_pb: 5_000 },
    ],
    ...extra,
  }
}

const contratante = {
  empreendimento_nome: 'Indústria Horizonte',
  empreendimento_cnpj: '11222333000181',
  cliente_nome: 'Grupo Horizonte S.A.',
  unidades: [{ nome: 'Matriz', endereco: 'Rua A, 100, Joinville/SC' }],
}

function cenario(extra: Partial<Cenario> = {}): Cenario {
  return {
    sessao: eduardo,
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      obter_orcamento: { data: orcamento() },
      obter_contratante_da_proposta: { data: contratante },
      obter_identidade_da_consultoria: {
        data: {
          razao_social: 'Filtroville Consultoria Ambiental Ltda.',
          cnpj: '11444777000161',
          telefone: '(47) 3000-0000',
          email: 'contato@filtroville.test',
          site: null,
          endereco: null,
          texto_apresentacao: '',
          logo_caminho: null,
          row_version: 1,
        },
      },
      ...extra.rpc,
    },
    tabelas: { ...extra.tabelas },
  }
}

async function abrirProposta() {
  renderizarApp('/orcamentos/o1/proposta')
  return screen.findByRole('article', { name: 'Proposta ORC-2026-041' })
}

/** Célula de valor da linha do quadro com esse rótulo. */
function valorDaLinha(proposta: HTMLElement, rotulo: string, indice = 0): HTMLElement {
  const cabecalhos = within(proposta).getAllByRole('rowheader', { name: rotulo })
  const linha = cabecalhos[indice]?.closest('tr')
  if (!linha) throw new Error(`linha ${rotulo} não encontrada`)
  return within(linha).getByRole('cell')
}

/** Texto das células de uma linha da tabela. */
function celulas(linha: HTMLElement | undefined): (string | null)[] {
  if (!linha) throw new Error('linha não encontrada')
  return within(linha)
    .getAllByRole('cell')
    .map((c) => c.textContent)
}

beforeEach(() => {
  falso.reiniciar(cenario())
  window.history.pushState({}, '', '/')
})

describe('Proposta', () => {
  it('rascunho sai marcado como RASCUNHO, com data de hoje e validade com data final', async () => {
    const { container } = renderizarApp('/orcamentos/o1/proposta')
    const proposta = await screen.findByRole('article', { name: 'Proposta ORC-2026-041' })
    await within(proposta).findByText('Grupo Horizonte S.A.')

    expect(within(proposta).getByText('RASCUNHO')).toBeInTheDocument()
    expect(
      within(proposta).getByText('Não envie esta versão ao cliente como final.'),
    ).toBeInTheDocument()
    // Marca d'água e "RASCUNHO" no alto de cada página impressa (caixa de margem do @page).
    expect(container.querySelector('.proposta-marca-dagua')).toHaveTextContent('RASCUNHO')
    expect(container.querySelector('style')?.textContent).toContain('content: "RASCUNHO"')

    const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')
    expect(valorDaLinha(proposta, 'Data')).toHaveTextContent(formatarDataCivil(hoje))
    const ate = formatarDataCivil(adicionarDias(hoje, 30))
    expect(valorDaLinha(proposta, 'Validade')).toHaveTextContent(`30 dias corridos, até ${ate}`)

    const acessibilidade = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(acessibilidade.violations.map((v) => v.id)).toEqual([])
  })

  it('enviada: sem marca de rascunho, data e validade a partir do envio', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          obter_orcamento: {
            data: orcamento({
              situacao: 'negociacao',
              historico_situacao: [
                {
                  de: 'enviada',
                  para: 'negociacao',
                  revisao: 1,
                  membro_nome: 'Eduardo Karnopp',
                  em: '2026-10-20T15:00:00Z',
                  observacao: null,
                },
                {
                  de: 'rascunho',
                  para: 'enviada',
                  revisao: 1,
                  membro_nome: 'Eduardo Karnopp',
                  em: '2026-10-12T14:00:00Z',
                  observacao: null,
                },
              ],
            }),
          },
        },
      }),
    )
    const { container } = renderizarApp('/orcamentos/o1/proposta')
    const proposta = await screen.findByRole('article', { name: 'Proposta ORC-2026-041' })
    expect(within(proposta).queryByText('RASCUNHO')).not.toBeInTheDocument()
    expect(container.querySelector('.proposta-marca-dagua')).toBeNull()
    expect(container.querySelector('style')?.textContent).not.toContain('RASCUNHO')
    expect(screen.queryByRole('button', { name: 'Marcar como enviada' })).not.toBeInTheDocument()
    expect(valorDaLinha(proposta, 'Data')).toHaveTextContent('12/10/2026')
    expect(valorDaLinha(proposta, 'Validade')).toHaveTextContent('30 dias corridos, até 11/11/2026')
    expect(valorDaLinha(proposta, 'Validade', 1)).toHaveTextContent(
      '30 dias corridos a partir de 12/10/2026, até 11/11/2026.',
    )
  })

  it('rodapé de cada página: número com revisão, consultoria com contatos e Página X de Y', async () => {
    falso.reiniciar(cenario({ rpc: { obter_orcamento: { data: orcamento({ revisao: 2 }) } } }))
    const { container } = renderizarApp('/orcamentos/o1/proposta')
    await screen.findByRole('article', { name: 'Proposta ORC-2026-041 · rev. 2' })
    await screen.findAllByText('Filtroville Consultoria Ambiental Ltda.')
    const estilo = container.querySelector('style')?.textContent ?? ''
    expect(estilo).toContain('@bottom-left { content: "Orçamento nº ORC-2026-041 · rev. 2"')
    expect(estilo).toContain(
      'content: "Filtroville Consultoria Ambiental Ltda. | E-mail: contato@filtroville.test | Telefone: (47) 3000-0000"',
    )
    expect(estilo).toContain('content: "Página " counter(page) " de " counter(pages)')
  })

  it('quadro de dados: cliente contratante, CNPJ, contato, abrangência com a unidade', async () => {
    const proposta = await abrirProposta()
    expect(await within(proposta).findByText('Grupo Horizonte S.A.')).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('obter_contratante_da_proposta', {
      p_id: 'o1',
    })
    expect(valorDaLinha(proposta, 'Cliente')).toHaveTextContent('Grupo Horizonte S.A.')
    expect(valorDaLinha(proposta, 'CNPJ')).toHaveTextContent('11.222.333/0001-81')
    expect(valorDaLinha(proposta, 'Contato')).toHaveTextContent('A/C Marina Couto')
    expect(valorDaLinha(proposta, 'Abrangência')).toHaveTextContent(
      'Indústria Horizonte · Unidade Matriz, Rua A, 100, Joinville/SC',
    )
    expect(valorDaLinha(proposta, 'Serviço')).toHaveTextContent('Licença de operação')
  })

  it('sem cliente contratante e com várias unidades: cliente é o empreendimento, sem abrangência', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          obter_contratante_da_proposta: {
            data: {
              ...contratante,
              cliente_nome: null,
              unidades: [
                { nome: 'Matriz', endereco: null },
                { nome: 'Filial', endereco: null },
              ],
            },
          },
        },
      }),
    )
    const proposta = await abrirProposta()
    await waitFor(() => {
      expect(valorDaLinha(proposta, 'CNPJ')).toHaveTextContent('11.222.333/0001-81')
    })
    expect(valorDaLinha(proposta, 'Cliente')).toHaveTextContent('Indústria Horizonte')
    expect(within(proposta).queryByRole('rowheader', { name: 'Abrangência' })).toBeNull()
  })

  it('prospecto: não busca contratante e usa os dados do prospecto', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          obter_orcamento: {
            data: orcamento({
              empreendimento_id: null,
              empreendimento_nome: 'Cerâmica Nova',
              destinatario: '',
              prospecto: {
                nome: 'Cerâmica Nova',
                cnpj: '11222333000181',
                contato: 'João Lima',
                email: 'joao@ceramica.test',
                telefone: '(47) 99999-0000',
              },
            }),
          },
        },
      }),
    )
    const proposta = await abrirProposta()
    expect(valorDaLinha(proposta, 'Cliente')).toHaveTextContent('Cerâmica Nova')
    expect(valorDaLinha(proposta, 'CNPJ')).toHaveTextContent('11.222.333/0001-81')
    expect(valorDaLinha(proposta, 'Contato')).toHaveTextContent(
      'A/C João Lima' + 'joao@ceramica.test · (47) 99999-0000',
    )
    expect(
      falso.cliente.rpc.mock.calls.some(([nome]) => nome === 'obter_contratante_da_proposta'),
    ).toBe(false)
  })

  it('valor total logo de cara e tabela de investimento sem expor horas', async () => {
    const proposta = await abrirProposta()
    const destaque = within(proposta).getByRole('region', { name: 'Valor total' })
    expect(destaque).toHaveTextContent('Valor total da proposta')
    expect(destaque).toHaveTextContent('R$ 4.460,00')
    expect(destaque).toHaveTextContent('em 2 parcelas')

    const tabela = within(proposta).getByRole('region', { name: 'Tabela do investimento' })
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Item', 'Descrição', 'Qtd.', 'Valor unit.', 'Total'])
    const linhas = within(tabela).getAllByRole('row')
    // Hora: "1 serviço" e o preço do serviço; nunca as horas.
    expect(celulas(linhas[1])).toEqual([
      '01',
      'Diagnóstico ambiental',
      '1 serviço',
      'R$ 760,00',
      'R$ 760,00',
    ])
    // m²: quantidade e tarifa.
    expect(celulas(linhas[2])).toEqual([
      '02',
      'Levantamento da área',
      '1.250 m²',
      'R$ 2,00/m²',
      'R$ 2.500,00',
    ])
    // Pacote: 1 × preço.
    expect(celulas(linhas[3])).toEqual([
      '03',
      'Protocolo no órgão',
      '1 pacote',
      'R$ 1.200,00',
      'R$ 1.200,00',
    ])
    expect(linhas[4]).toHaveTextContent('Valor total da propostaR$ 4.460,00')
    expect(within(proposta).queryByText(/\b8h\b|480|custo|margem|responsável/i)).toBeNull()
  })

  it('terceirizado sem valor (orçamento duplicado) deixa o preço pendente, como no banco', async () => {
    const semValor = {
      id: 'i1',
      hora_venda_id: 'hora',
      descricao: 'Inventário de fauna',
      minutos: 480,
      preco_automatico: true,
      preco_centavos: 0,
      custo_direto_extra_centavos: 0,
      terceiro_nome: 'Ana Bióloga',
      terceiro_cobranca: 'hora',
      terceiro_valor_centavos: null,
    }
    falso.reiniciar(
      cenario({ rpc: { obter_orcamento: { data: orcamento({ itens: [semValor] }) } } }),
    )
    const proposta = await abrirProposta()
    const destaque = within(proposta).getByRole('region', { name: 'Valor total' })
    expect(destaque).toHaveTextContent('A definir')
    expect(destaque).not.toHaveTextContent('R$ 0,00')
    expect(
      screen.getByText('O preço ainda está pendente: complete o orçamento antes de enviar.'),
    ).toBeInTheDocument()
  })

  it('terceirizado pela margem, sem linha da tabela, tem o preço gravado pelo banco', async () => {
    const terceirizado = {
      id: 'i1',
      hora_venda_id: null,
      descricao: 'Inventário de fauna',
      minutos: 480,
      preco_automatico: true,
      preco_centavos: 70_000,
      custo_direto_extra_centavos: 0,
      terceiro_nome: 'Ana Bióloga',
      terceiro_cobranca: 'fechado',
      terceiro_valor_centavos: 50_000,
    }
    falso.reiniciar(
      cenario({
        rpc: {
          obter_orcamento: {
            data: orcamento({ forma_preco: 'margem', itens: [terceirizado] }),
          },
        },
      }),
    )
    const proposta = await abrirProposta()
    const destaque = within(proposta).getByRole('region', { name: 'Valor total' })
    expect(destaque).toHaveTextContent('R$ 700,00')
    expect(destaque).not.toHaveTextContent('A definir')
  })

  it('diz quando o preço mínimo do serviço valeu, e só quando valeu', async () => {
    const horasVenda = [
      {
        id: 'hora',
        profissao: 'Engenheiro',
        atividade: 'Consulta',
        valor_centavos: 9_500,
        minimo_centavos: 50_000,
      },
      {
        id: 'area',
        profissao: '',
        atividade: 'Levantamento',
        valor_centavos: 200,
        unidade: 'm2',
        minimo_centavos: 100_000,
      },
    ]
    const itens = [
      {
        id: 'i1',
        hora_venda_id: 'hora',
        descricao: 'Consulta',
        minutos: 60,
        preco_automatico: true,
        preco_centavos: 50_000,
        custo_direto_extra_centavos: 0,
      },
      {
        id: 'i2',
        hora_venda_id: 'area',
        descricao: 'Levantamento',
        minutos: 60,
        quantidade: '1250',
        preco_automatico: true,
        preco_centavos: 250_000,
        custo_direto_extra_centavos: 0,
      },
    ]
    falso.reiniciar(
      cenario({
        rpc: {
          obter_orcamento: {
            data: orcamento({ base: { ...base, horas_venda: horasVenda }, itens }),
          },
        },
      }),
    )
    const proposta = await abrirProposta()
    const linhas = within(
      within(proposta).getByRole('region', { name: 'Tabela do investimento' }),
    ).getAllByRole('row')
    // 1 h × 95,00 < 500,00: o mínimo valeu. 1.250 m² × 2,00 = 2.500,00 > 1.000,00: não.
    expect(linhas[1]).toHaveTextContent('Preço mínimo do serviço: R$ 500,00')
    expect(linhas[2]).not.toHaveTextContent('Preço mínimo')
  })

  it('seções numeradas: escopo com prazo, condições, premissas e aceite com assinaturas', async () => {
    const proposta = await abrirProposta()
    await within(proposta).findByText('Grupo Horizonte S.A.')
    expect(
      within(proposta)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      '1 Objeto da proposta',
      '2 Escopo e prazos de entrega',
      '3 Composição do investimento',
      '4 Condições comerciais',
      '5 Premissas e responsabilidades',
      '6 Aceite',
    ])
    const escopo = within(proposta).getByRole('region', { name: 'Tabela de escopo e prazos' })
    expect(
      within(escopo).getByText('30 dias após o recebimento dos documentos'),
    ).toBeInTheDocument()

    expect(valorDaLinha(proposta, 'Pagamento')).toHaveTextContent(
      '1. Assinatura do contrato50,0% · R$ 2.230,00',
    )
    expect(valorDaLinha(proposta, 'Tributos')).toHaveTextContent('Inclusos no valor.')
    expect(valorDaLinha(proposta, 'Por conta do cliente')).toHaveTextContent(
      'Taxa do órgão ambiental',
    )
    expect(within(proposta).getByText('Uma visita técnica')).toBeInTheDocument()
    expect(
      within(proposta).getByText('Não incluído nesta proposta: Análises laboratoriais'),
    ).toBeInTheDocument()

    const aceite = within(proposta).getByRole('region', { name: 'Aceite' })
    expect(within(aceite).getByText('Cliente')).toBeInTheDocument()
    expect(within(aceite).getByText('Nome')).toBeInTheDocument()
    expect(within(aceite).getAllByText('Data: ____/____/________')).toHaveLength(2)
    expect(within(aceite).getAllByText('Filtroville Consultoria Ambiental Ltda.')).toHaveLength(2)
    expect(aceite).toHaveClass('proposta-sem-quebra')
  })

  it('marca como enviada pela própria proposta, com a mesma confirmação e RPC', async () => {
    let situacao = 'rascunho'
    let historico: unknown[] = []
    falso.reiniciar(
      cenario({
        rpc: {
          obter_orcamento: () => ({
            data: orcamento({ situacao, historico_situacao: historico, row_version: 3 }),
          }),
          mudar_situacao_orcamento: () => {
            situacao = 'enviada'
            historico = [
              {
                de: 'rascunho',
                para: 'enviada',
                revisao: 1,
                membro_nome: 'Eduardo Karnopp',
                em: '2026-11-10T13:00:00Z',
                observacao: 'por e-mail',
              },
            ]
            return { data: 4 }
          },
        },
      }),
    )
    const usuario = userEvent.setup()
    const proposta = await abrirProposta()
    expect(within(proposta).getByText('RASCUNHO')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Marcar como enviada' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Marcar como enviada' })
    expect(within(dialogo).getByText('Confirme a mudança de situação.')).toBeInTheDocument()
    await usuario.type(within(dialogo).getByLabelText('Observação (opcional)'), 'por e-mail')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))

    expect(falso.cliente.rpc).toHaveBeenCalledWith('mudar_situacao_orcamento', {
      p_id: 'o1',
      p_row_version: 3,
      p_para: 'enviada',
      p_observacao: 'por e-mail',
    })
    expect(
      await screen.findByText('Proposta marcada como enviada em 10/11/2026.'),
    ).toBeInTheDocument()
    expect(within(proposta).queryByText('RASCUNHO')).not.toBeInTheDocument()
    expect(valorDaLinha(proposta, 'Data')).toHaveTextContent('10/11/2026')
    expect(screen.queryByRole('button', { name: 'Marcar como enviada' })).not.toBeInTheDocument()
  })

  it('erro ao marcar como enviada fica no diálogo', async () => {
    falso.reiniciar(
      cenario({
        rpc: {
          mudar_situacao_orcamento: { error: { code: 'P0001', message: 'preco_pendente' } },
        },
      }),
    )
    const usuario = userEvent.setup()
    await abrirProposta()
    await usuario.click(screen.getByRole('button', { name: 'Marcar como enviada' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Marcar como enviada' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
    expect(await within(dialogo).findByRole('alert')).toBeInTheDocument()
  })
})
