import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const gestao = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome).map(([, args]) => args)
}

describe('linha de base (ADR-0027, ADR-0057)', () => {
  function cenario(papel: 'gestao' | 'equipe', rpc: Record<string, unknown> = {}) {
    falso.reiniciar({
      sessao: papel === 'gestao' ? gestao : sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] },
        ultima_linha_de_base: { data: [] },
        ...rpc,
      },
    })
  }

  it('o diálogo não abre sozinho, nem sem resposta (as respostas vêm do quiz do site)', async () => {
    cenario('gestao')
    renderizarApp('/calendario')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Antes do Grama' })).toBeNull()
    expect(chamadas('ultima_linha_de_base')).toEqual([])
  })

  it('em Configurações, a Gestão abre "Antes do Grama", valida e grava as 4 respostas', async () => {
    const usuario = userEvent.setup()
    cenario('gestao', { responder_linha_de_base: { data: 'id' } })
    renderizarApp('/configuracoes/equipe')
    await usuario.click(await screen.findByRole('button', { name: 'Ações de Configurações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Antes do Grama' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Antes do Grama' })
    await usuario.type(
      within(dialogo).getByLabelText('Quantas licenças ativas vocês acompanham hoje?'),
      '12',
    )
    await usuario.type(
      within(dialogo).getByLabelText(
        'Quantas horas por semana a equipe gasta conferindo prazos e cobrando pessoas?',
      ),
      '6,5',
    )
    await usuario.type(
      within(dialogo).getByLabelText('Quantas vezes por mês um prazo pegou a equipe de surpresa?'),
      '2',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar respostas' }))
    expect(within(dialogo).getByText('Informe um número')).toBeInTheDocument()
    expect(chamadas('responder_linha_de_base')).toEqual([])

    await usuario.type(
      within(dialogo).getByLabelText(
        'Quantos minutos leva para cadastrar uma condicionante à mão?',
      ),
      '10',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar respostas' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Antes do Grama' })).not.toBeInTheDocument()
    })
    expect(chamadas('responder_linha_de_base')).toEqual([
      {
        p_consultoria_id: 'c-Filtroville',
        p_licencas_ativas: 12,
        p_horas_semana_conferindo: 6.5,
        p_minutos_por_condicionante: 10,
        p_surpresas_por_mes: 2,
      },
    ])
  })

  it('o erro do banco aparece no diálogo; Cancelar fecha sem gravar', async () => {
    const usuario = userEvent.setup()
    cenario('gestao', { responder_linha_de_base: { error: { message: 'sem_permissao' } } })
    renderizarApp('/configuracoes/equipe')
    await usuario.click(await screen.findByRole('button', { name: 'Ações de Configurações' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Antes do Grama' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Antes do Grama' })
    for (const rotulo of [
      'Quantas licenças ativas vocês acompanham hoje?',
      'Quantas horas por semana a equipe gasta conferindo prazos e cobrando pessoas?',
      'Quantos minutos leva para cadastrar uma condicionante à mão?',
      'Quantas vezes por mês um prazo pegou a equipe de surpresa?',
    ]) {
      await usuario.type(within(dialogo).getByLabelText(rotulo), '1')
    }
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar respostas' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Você não tem permissão para esta ação.',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Antes do Grama' })).not.toBeInTheDocument()
    })
  })

  it('a Equipe não tem a ação', async () => {
    cenario('equipe')
    renderizarApp('/configuracoes/equipe')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Antes do Grama' })).toBeNull()
  })
})

describe('Painel, o antigo Resumo do mês (ADR-0027, ADR-0041)', () => {
  const linha = (mes: string, extra: Record<string, unknown> = {}) => ({
    mes,
    horas_total: 23,
    reais_centavos: 230000,
    horas_estimadas: true,
    juntando_dados: false,
    prazo_previstas: 4,
    prazo_cumpridas: 3,
    renovacoes_vencendo: 2,
    renovacoes_protegidas: 2,
    ...extra,
  })

  it('a Gestão vê horas, entregas no prazo e renovações contra o mês anterior', async () => {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: {
          data: [
            linha('2026-10-01'),
            linha('2026-09-01', {
              horas_total: 20.5,
              prazo_cumpridas: 2,
              renovacoes_protegidas: 1,
            }),
          ],
        },
      },
    })
    renderizarApp('/painel')
    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument()
    expect(await screen.findByText('23,0 h')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s?2\.300,00/)).toBeInTheDocument()
    expect(screen.getByText('Estimado')).toBeInTheDocument()
    expect(screen.getByText('Subiu 2,5 h contra o mês anterior')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Subiu 25 p.p. contra o mês anterior')).toBeInTheDocument()
    expect(screen.getByText('Subiu 1 contra o mês anterior')).toBeInTheDocument()
    expect(screen.getByText('2 de 2')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Mês' })).toBeInTheDocument()
    expect(chamadas('resumo_do_mes')[0]).toMatchObject({ p_consultoria_id: 'c-Filtroville' })
  })

  it('escreve "Desceu" e "Igual" na comparação, não só pela cor', async () => {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: {
          data: [
            linha('2026-10-01', { horas_total: 18 }),
            linha('2026-09-01', { horas_total: 20.5, prazo_cumpridas: 3 }),
          ],
        },
      },
    })
    renderizarApp('/painel')
    expect(await screen.findByText('Desceu 2,5 h contra o mês anterior')).toBeInTheDocument()
    expect(screen.getAllByText('Igual ao mês anterior')).toHaveLength(2)
  })

  it('o endereço antigo /resumo-do-mes abre o Painel', async () => {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: { data: [linha('2026-10-01')] },
      },
    })
    const { router } = renderizarApp('/resumo-do-mes')
    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/painel')
    const menu = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(menu).getByRole('link', { name: 'Painel' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('erro do banco mostra "Tentar de novo"; a Equipe vê sem permissão', async () => {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: { error: { message: 'falha' } },
        painel_clientes_em_risco: { data: [] },
        painel_carga: { data: [] },
        painel_dinheiro_por_cliente: { data: [] },
      },
    })
    const { unmount } = renderizarApp('/painel')
    expect(await screen.findByText('Não foi possível carregar o resumo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
    unmount()

    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
    })
    renderizarApp('/painel')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(chamadas('resumo_do_mes')).toEqual([])
  })
})

describe('quadros do dono (ADR-0054)', () => {
  const resumo = { data: [] }
  const risco = (nome: string, extra: Record<string, unknown> = {}) => ({
    chave: nome,
    nome,
    empreendimentos: 1,
    prazos_atrasados: 0,
    lao_alem_do_limite: 0,
    lao_perto_do_limite: 0,
    vencimentos_vencidos: 0,
    receber_vencido_centavos: 0,
    aprovado_centavos: 0,
    ...extra,
  })

  function cenario(rpc: Record<string, unknown> = {}) {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: resumo,
        painel_clientes_em_risco: {
          data: [
            risco('Padaria Central', {
              receber_vencido_centavos: 50_000,
              aprovado_centavos: 900_000,
            }),
            risco('Metalúrgica Açores', { prazos_atrasados: 2, lao_alem_do_limite: 1 }),
          ],
        },
        painel_carga: {
          data: [
            {
              membro_id: 'm-bruno',
              nome: 'Bruno Kist',
              prazos: 3,
              atrasados: 0,
              minutos_tarefas: 0,
            },
            {
              membro_id: 'm-ana',
              nome: 'Ana Ribeiro',
              prazos: 1,
              atrasados: 2,
              minutos_tarefas: 90,
            },
          ],
        },
        painel_dinheiro_por_cliente: {
          data: [
            {
              chave: 'c1',
              nome: 'Metalúrgica Açores',
              aprovado_centavos: 300_000,
              recebido_centavos: 100_000,
              a_receber_centavos: 200_000,
              vencido_centavos: 50_000,
            },
          ],
        },
        ...rpc,
      },
    })
  }

  it('clientes em risco do mais grave, com os motivos em palavras', async () => {
    cenario()
    renderizarApp('/painel')
    const lista = await screen.findByRole('list', { name: 'Clientes em risco, do mais grave' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens[0]).toHaveTextContent('Metalúrgica Açores')
    expect(itens[0]).toHaveTextContent('1 LAO passou do limite de protocolo · 2 atrasados')
    expect(itens[1]).toHaveTextContent('R$ 500,00 a receber vencido')
  })

  it('carga das 2 semanas põe quem tem atraso primeiro; dinheiro por cliente com o vencido', async () => {
    cenario()
    renderizarApp('/painel')
    const carga = await screen.findByRole('table', {
      name: 'Carga por pessoa nas próximas 2 semanas',
    })
    const linhas = within(carga).getAllByRole('row')
    expect(linhas[1]).toHaveTextContent('Ana Ribeiro')
    expect(linhas[1]).toHaveTextContent('1h30')
    const dinheiro = await screen.findByRole('table', { name: 'Dinheiro por cliente' })
    expect(dinheiro).toHaveTextContent('R$ 2.000,00')
    expect(dinheiro).toHaveTextContent('Vencido R$ 500,00')
  })

  it('sem a permissão financeira o quadro de dinheiro não aparece; sem risco, diz isso', async () => {
    cenario({
      painel_clientes_em_risco: { data: [] },
      painel_dinheiro_por_cliente: { error: { message: 'sem_permissao', code: '42501' } },
    })
    renderizarApp('/painel')
    expect(await screen.findByText('Nenhum cliente em risco.')).toBeInTheDocument()
    await waitFor(() => {
      expect(chamadas('painel_dinheiro_por_cliente')).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Dinheiro por cliente' })).toBeNull()
    })
  })

  it('erro na carga aparece com tentar de novo', async () => {
    cenario({ painel_carga: { error: { message: 'falha' } } })
    renderizarApp('/painel')
    expect(await screen.findByText('Não foi possível carregar a carga.')).toBeInTheDocument()
  })
})
