import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const gestao = sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp')

function chamadas(nome: string) {
  return falso.cliente.rpc.mock.calls.filter(([rpc]) => rpc === nome).map(([, args]) => args)
}

describe('linha de base (ADR-0027)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('pergunta à Gestão sem resposta, valida e grava as 4 respostas', async () => {
    const usuario = userEvent.setup()
    let respondida = false
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        ultima_linha_de_base: () => ({
          data: respondida ? [{ respondido_em: new Date().toISOString() }] : [],
        }),
        responder_linha_de_base: () => {
          respondida = true
          return { data: 'id' }
        },
      },
    })
    renderizarApp('/')

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

  it('"Responder depois" fecha e adia; a Equipe nem consulta', async () => {
    const usuario = userEvent.setup()
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        ultima_linha_de_base: { data: [] },
      },
    })
    renderizarApp('/')
    const dialogo = await screen.findByRole('dialog', { name: 'Antes do Grama' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Responder depois' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Antes do Grama' })).not.toBeInTheDocument()
    })
    expect(Object.keys(window.localStorage).some((k) => k.startsWith('grama:linha-de-base:'))).toBe(
      true,
    )

    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
        ultima_linha_de_base: { data: [] },
      },
    })
    renderizarApp('/calendario')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendário' })).toBeInTheDocument()
    expect(chamadas('ultima_linha_de_base')).toEqual([])
  })
})

describe('Resumo do mês (ADR-0027)', () => {
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
    renderizarApp('/resumo-do-mes')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Resumo do mês' }),
    ).toBeInTheDocument()
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
    renderizarApp('/resumo-do-mes')
    expect(await screen.findByText('Desceu 2,5 h contra o mês anterior')).toBeInTheDocument()
    expect(screen.getAllByText('Igual ao mês anterior')).toHaveLength(2)
  })

  it('erro do banco mostra "Tentar de novo"; a Equipe vê sem permissão', async () => {
    falso.reiniciar({
      sessao: gestao,
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'gestao')] },
        resumo_do_mes: { error: { message: 'falha' } },
      },
    })
    const { unmount } = renderizarApp('/resumo-do-mes')
    expect(await screen.findByText('Não foi possível carregar o resumo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
    unmount()

    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] } },
    })
    renderizarApp('/resumo-do-mes')
    expect(await screen.findByText('Você não tem acesso a esta área')).toBeInTheDocument()
    expect(chamadas('resumo_do_mes')).toEqual([])
  })
})
