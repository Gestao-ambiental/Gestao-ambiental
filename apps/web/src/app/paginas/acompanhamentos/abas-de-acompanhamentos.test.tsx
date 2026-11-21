// A lista das abas de Acompanhamentos mora em arquivo próprio (ADR-0041): aba nova entra com uma
// linha e traz o próprio painel. Aqui a lista ganha uma aba de teste para provar isso.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

import {
  ABAS_DE_ACOMPANHAMENTOS,
  abasDeAcompanhamentosVisiveis,
  type AbaDeAcompanhamentos,
} from './abas-de-acompanhamentos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

vi.mock('./abas-de-acompanhamentos', async (original) => {
  const modulo = await original<typeof import('./abas-de-acompanhamentos')>()
  const extra: AbaDeAcompanhamentos = {
    valor: 'teste',
    rotulo: 'Aba de teste',
    curto: 'Teste',
    somenteGestao: true,
    Painel: () => <p>Conteúdo da aba de teste</p>,
  }
  const abas = [...modulo.ABAS_DE_ACOMPANHAMENTOS, extra]
  return {
    ...modulo,
    ABAS_DE_ACOMPANHAMENTOS: abas,
    abasDeAcompanhamentosVisiveis: (ehGestao: boolean) =>
      modulo.abasDeAcompanhamentosVisiveis(ehGestao, abas),
  }
})

function cenario(papel: 'gestao' | 'equipe') {
  falso.reiniciar({
    sessao: sessaoDe('eduardo@filtroville.test', 'Eduardo Karnopp'),
    rpc: { meus_vinculos: { data: [vinculoFalso('Filtroville', papel)] } },
  })
}

const nomesDasAbas = () => screen.getAllByRole('tab').map((aba) => aba.textContent)

describe('abas de Acompanhamentos', () => {
  it('Renovações e Aguardando conferência vêm primeiro, para todos', () => {
    expect(ABAS_DE_ACOMPANHAMENTOS.slice(0, 2).map((a) => a.rotulo)).toEqual([
      'Renovações no radar',
      'Aguardando conferência',
    ])
    expect(
      abasDeAcompanhamentosVisiveis(false)
        .slice(0, 2)
        .map((a) => a.valor),
    ).toEqual(['renovacoes', 'conferencia'])
  })

  it('Exigências do órgão vem depois de Aguardando conferência, para todos, com painel próprio', () => {
    const exigencias = ABAS_DE_ACOMPANHAMENTOS[2]
    expect(exigencias).toMatchObject({
      valor: 'exigencias',
      rotulo: 'Exigências do órgão',
      curto: 'Exigências',
    })
    expect(exigencias?.somenteGestao).toBeUndefined()
    expect(exigencias?.Painel).toBeDefined()
    expect(abasDeAcompanhamentosVisiveis(false).map((a) => a.valor)).toContain('exigencias')
  })

  it('aba nova da lista aparece com o próprio painel e abre pelo endereço', async () => {
    cenario('gestao')
    const usuario = userEvent.setup()
    const { router } = renderizarApp('/acompanhamentos')
    await screen.findByRole('tabpanel', { name: /Renovações no radar/ })
    expect(nomesDasAbas()).toEqual([
      expect.stringContaining('Renovações no radar'),
      expect.stringContaining('Aguardando conferência'),
      expect.stringContaining('Normas'),
      expect.stringContaining('Exigências do órgão'),
      expect.stringContaining('Aba de teste'),
    ])

    await usuario.click(screen.getByRole('tab', { name: /Aba de teste/ }))
    const painel = await screen.findByRole('tabpanel', { name: /Aba de teste/ })
    expect(within(painel).getByText('Conteúdo da aba de teste')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?aba=teste')
  })

  it('aba só da Gestão some para a Equipe, e o endereço dela cai na primeira aba', async () => {
    cenario('equipe')
    renderizarApp('/acompanhamentos?aba=teste')
    expect(await screen.findByRole('tabpanel', { name: /Renovações no radar/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Aba de teste/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aguardando conferência/ })).toBeInTheDocument()
  })
})
