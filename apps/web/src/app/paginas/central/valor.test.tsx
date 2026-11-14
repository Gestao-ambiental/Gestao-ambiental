import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const operador = sessaoDe('cadu@grama.test', 'Cadu Operador')

/** O cartão (rótulo e valor) de uma métrica dentro de um grupo. */
function cartao(grupo: HTMLElement, rotulo: string): HTMLElement {
  const elemento = within(grupo).getByText(rotulo).closest('div')
  if (!elemento) throw new Error(`cartão ${rotulo} não encontrado`)
  return elemento
}

/** Linha da RPC com tudo zerado; `extra` muda só o que o teste usa. */
function linha(mes: string, extra: Record<string, number | null> = {}) {
  return {
    mes,
    prazo_previstas: 0,
    prazo_cumpridas: 0,
    antecedencia_media: null,
    urgencias: 0,
    meta_previstas: 0,
    meta_cumpridas: 0,
    criadas: 0,
    nao_planejadas: 0,
    atrasadas: 0,
    dias_de_atraso: 0,
    renovacoes_vencendo: 0,
    renovacoes_protegidas: 0,
    carga_entregas: 0,
    carga_pico: 0,
    carga_celulas: 0,
    orcamentos_enviados: 0,
    dias_ate_envio: null,
    orcamentos_decididos: 0,
    orcamentos_aprovados: 0,
    dias_ate_decisao: null,
    ticket_medio_aprovado_centavos: null,
    orcamentos_criados: 0,
    orcamentos_pelos_custos: 0,
    orcamentos_preco_digitado: 0,
    concluidas: 0,
    concluidas_com_evidencia: 0,
    condicionantes_ativas: null,
    condicionantes_com_responsavel: null,
    ...extra,
  }
}

const metricas = [
  linha('2026-11-01', {
    prazo_previstas: 4,
    prazo_cumpridas: 3,
    antecedencia_media: 6.5,
    orcamentos_decididos: 2,
    orcamentos_aprovados: 1,
    ticket_medio_aprovado_centavos: 1250000,
    condicionantes_ativas: 10,
    condicionantes_com_responsavel: 8,
  }),
  linha('2026-10-01', { prazo_previstas: 2, prazo_cumpridas: 1, antecedencia_media: 8 }),
  ...['09', '08', '07', '06', '05'].map((m) => linha(`2026-${m}-01`)),
]

function cenario(resposta: unknown) {
  falso.reiniciar({
    sessao: operador,
    doisFatores: { nivel: 'aal2', fatores: [{ id: 'fator-1', status: 'verified' }] },
    rpc: {
      sou_operador: { data: true },
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
      central_listar_consultorias: {
        data: [{ id: 'c-a', nome: 'Filtroville Consultoria Ambiental', total: 1 }],
      },
      central_metricas_de_valor: resposta as { data: unknown },
    },
  })
}

describe('central administrativa: valor', () => {
  beforeEach(() => {
    cenario({ data: metricas })
  })

  it('mostra os cartões do mês atual com a variação e a tabela por mês', async () => {
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/admin/valor')
    expect(await screen.findByRole('heading', { level: 1, name: 'Valor' })).toBeInTheDocument()

    const prazos = await screen.findByRole('region', { name: 'Prazos' })
    const noPrazo = cartao(prazos, 'Entregas no prazo')
    expect(noPrazo).toHaveTextContent('75%')
    expect(within(noPrazo).getByLabelText('+25 p.p. contra o mês anterior')).toBeInTheDocument()
    const antecedencia = cartao(prazos, 'Antecedência média')
    expect(antecedencia).toHaveTextContent('6,5 dias úteis')
    expect(antecedencia).toHaveTextContent('−1,5 dias úteis')
    expect(cartao(prazos, 'Renovações protegidas')).toHaveTextContent('sem dados')
    const orcamentos = screen.getByRole('region', { name: 'Orçamentos' })
    expect(cartao(orcamentos, 'Aprovação')).toHaveTextContent('50%')
    expect(cartao(orcamentos, 'Ticket médio aprovado')).toHaveTextContent('R$ 12.500,00')
    const saude = screen.getByRole('region', { name: 'Saúde' })
    expect(cartao(saude, 'Condicionantes com responsável')).toHaveTextContent('80%')

    const tabela = within(screen.getByRole('region', { name: 'Métricas por mês' })).getByRole(
      'table',
    )
    expect(within(tabela).getByRole('columnheader', { name: 'nov/2026' })).toBeInTheDocument()
    expect(within(tabela).getByRole('columnheader', { name: 'mai/2026' })).toBeInTheDocument()
    const linhaNoPrazo = within(tabela).getByRole('row', { name: /Entregas no prazo/ })
    expect(
      within(linhaNoPrazo)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['75%', '50%', 'sem dados', 'sem dados', 'sem dados', 'sem dados', 'sem dados'])

    // Total por padrão; escolher uma consultoria refaz a consulta só dela.
    expect(falso.cliente.rpc).toHaveBeenCalledWith('central_metricas_de_valor', {
      p_consultoria_id: undefined,
      p_meses: 6,
    })
    await usuario.selectOptions(
      await screen.findByRole('combobox', { name: 'Consultoria' }),
      'Filtroville Consultoria Ambiental',
    )
    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('central_metricas_de_valor', {
        p_consultoria_id: 'c-a',
        p_meses: 6,
      })
    })
    expect(router.state.location.search).toBe('?consultoria=c-a')
  })

  it('sem nenhum dado no período: estado vazio', async () => {
    cenario({ data: metricas.map((m) => linha(m.mes)) })
    renderizarApp('/admin/valor')
    expect(await screen.findByText('Sem dados no período')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('erro do banco: mensagem com "Tentar de novo"', async () => {
    cenario({ error: { message: 'falha' } })
    renderizarApp('/admin/valor')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as métricas.',
    )
  })
})
