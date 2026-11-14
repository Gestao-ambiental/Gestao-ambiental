// Resíduos, fase 1 (ADR-0028): as telas ligadas ao app. Menu e abas de /residuos, a lista de CDFs
// do empreendimento e os prazos de resíduos no calendário.

import { hojeNoFuso } from '@gestao-ambiental/domain'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe, type Cenario } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const hoje = hojeNoFuso(new Date(), 'America/Sao_Paulo')

const empreendimento = {
  id: 'e1',
  nome: 'Metalúrgica Rio Cubatão',
  cliente_nome: null,
  cnpj: null,
  unidades: 1,
  licencas: [],
  total: 1,
}

const cdf = {
  id: 'cdf1',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  numero: 'CDF-77',
  emitido_em: '2026-10-20',
  destinador_nome: 'Aterro Norte',
  destinador_cnpj: null,
  periodo_inicio: '2026-10-01',
  periodo_fim: '2026-10-15',
  observacao: null,
  pdf_caminho: null,
  pdf_nome: null,
  mtrs: [
    {
      mtr_id: 'm1',
      numero: '2610001',
      emitido_em: '2026-10-05',
      situacao: 'recebido',
      itens: [
        {
          mtr_item_id: 'i1',
          residuo_codigo: '200301',
          residuo_descricao: 'Resíduos urbanos misturados',
          quantidade_mtr: 1.5,
          unidade_mtr: 't',
          quantidade: null,
          unidade: null,
        },
      ],
    },
  ],
  row_version: 3,
  criado_em: '2026-10-20T12:00:00Z',
  total: 1,
}

function cenario(rpc: Cenario['rpc'] = {}): Cenario {
  return {
    sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
    rpc: {
      meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
      listar_empreendimentos: { data: [empreendimento] },
      listar_prazos: { data: [] },
      contar_prazos: { data: [] },
      listar_calendario: { data: [] },
      listar_mtrs: { data: [] },
      listar_cdfs: { data: [] },
      conferencia_residuos: { data: [] },
      prazos_obrigacoes_residuo: { data: [] },
      ...rpc,
    },
    tabelas: {
      empreendimento: [{ id: 'e1', nome: 'Metalúrgica Rio Cubatão', cnpj: null, cliente: null }],
      membro: [],
      unidade: [],
    },
  }
}

describe('Resíduos no app', () => {
  it('o menu leva a /residuos, que lista os empreendimentos e tem as abas da área', async () => {
    falso.reiniciar(cenario())
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/')

    const menu = await screen.findByRole('navigation', { name: 'Menu principal' })
    await usuario.click(within(menu).getByRole('link', { name: 'Resíduos' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'MTRs e CDFs' }),
    ).toBeInTheDocument()
    const abas = screen.getByRole('navigation', { name: 'Resíduos' })
    expect(within(abas).getByRole('link', { name: 'MTRs e CDFs' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByRole('link', { name: /Metalúrgica Rio Cubatão/ })).toHaveAttribute(
      'href',
      '/empreendimentos/e1/residuos',
    )

    await usuario.click(within(abas).getByRole('link', { name: 'Conferência CDF x MTR' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Conferência CDF x MTR' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/residuos/conferencia')
  })

  it('a página do empreendimento lista os CDFs e exclui com confirmação', async () => {
    falso.reiniciar(cenario({ listar_cdfs: { data: [cdf] }, excluir_cdf: { data: null } }))
    const usuario = userEvent.setup()
    renderizarApp('/empreendimentos/e1/residuos')

    const secao = await screen.findByRole('region', { name: 'CDFs' })
    const tabela = await within(secao).findByRole('table')
    expect(within(tabela).getByText('CDF-77')).toBeInTheDocument()
    expect(within(tabela).getByText('01/10/2026 a 15/10/2026')).toBeInTheDocument()
    expect(within(tabela).getByText('2610001')).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Excluir CDF CDF-77' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir CDF CDF-77?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir CDF' }))

    await waitFor(() => {
      expect(falso.cliente.rpc).toHaveBeenCalledWith('excluir_cdf', {
        p_id: 'cdf1',
        p_row_version: 3,
      })
    })
    expect(await within(secao).findByText('CDF CDF-77 excluído.')).toBeInTheDocument()
  })

  it('o calendário mostra o prazo de resíduos com marca própria', async () => {
    falso.reiniciar(
      cenario({
        prazos_obrigacoes_residuo: {
          data: [
            {
              obrigacao_id: 'o1',
              empreendimento_id: 'e1',
              empreendimento_nome: 'Metalúrgica Rio Cubatão',
              tipo: 'dmr_trimestral',
              referencia: '3º trimestre de 2026',
              inicio: hoje,
              prazo: hoje,
              dias: 0,
              observacao: null,
            },
          ],
        },
      }),
    )
    renderizarApp('/calendario')

    const tabela = await screen.findByRole('table', { name: /Calendário de/ })
    const evento = await within(tabela).findByRole('link', { name: /Resíduos/ })
    expect(evento).toHaveAttribute('href', '/residuos/prazos?empreendimento=e1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'prazos_obrigacoes_residuo',
      expect.objectContaining({ p_consultoria_id: 'c-Filtroville' }) as unknown,
    )
  })
})
