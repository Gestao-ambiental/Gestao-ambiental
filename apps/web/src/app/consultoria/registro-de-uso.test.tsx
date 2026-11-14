import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarApp, vinculoFalso } from '@/test/renderizar'
import { falso, sessaoDe } from '@/test/supabase-falso'

import { useRegistroDeUso } from './registro-de-uso'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function Sonda({ consultoriaId }: { consultoriaId: string | null }) {
  useRegistroDeUso(consultoriaId)
  return <p>sonda</p>
}

function montar(caminho: string, consultoriaId: string | null = 'c-a') {
  const router = createMemoryRouter(
    [{ path: '*', element: <Sonda consultoriaId={consultoriaId} /> }],
    {
      initialEntries: [caminho],
    },
  )
  render(<RouterProvider router={router} />)
  return router
}

function registros() {
  return falso.cliente.rpc.mock.calls
    .filter(([rpc]) => rpc === 'registrar_uso')
    .map(([, args]) => args?.p_modulo)
}

function mudarVisibilidade(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('registro de uso (ADR-0024)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-14T13:00:00Z'))
    falso.reiniciar({ rpc: { registrar_uso: { data: null } } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registra a área da rota no máximo uma vez a cada 5 minutos por área', async () => {
    const router = montar('/orcamentos')
    expect(registros()).toEqual(['orcamentos'])
    expect(falso.cliente.rpc).toHaveBeenCalledWith('registrar_uso', {
      p_consultoria_id: 'c-a',
      p_modulo: 'orcamentos',
    })

    // Mesma área: não registra de novo.
    await act(() => router.navigate('/orcamentos/o1'))
    expect(registros()).toEqual(['orcamentos'])

    // Outra área: registra.
    await act(() => router.navigate('/calendario'))
    expect(registros()).toEqual(['orcamentos', 'licencas_e_prazos'])

    // Volta antes de 5 minutos: não registra.
    vi.advanceTimersByTime(2 * 60_000)
    await act(() => router.navigate('/configuracoes/custos'))
    expect(registros()).toEqual(['orcamentos', 'licencas_e_prazos'])

    // Parada na mesma tela: renova a cada 5 minutos.
    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(registros()).toEqual(['orcamentos', 'licencas_e_prazos', 'orcamentos'])

    await act(() => router.navigate('/orcamentos/o1/proposta'))
    await act(() => router.navigate('/perfil'))
    expect(registros()).toEqual([
      'orcamentos',
      'licencas_e_prazos',
      'orcamentos',
      'propostas',
      'equipe_e_conta',
    ])
  })

  it('com a aba escondida não registra; ao voltar a ficar visível, registra', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    montar('/calendario')
    act(() => {
      vi.advanceTimersByTime(10 * 60_000)
    })
    expect(registros()).toEqual([])

    act(() => {
      mudarVisibilidade('visible')
    })
    expect(registros()).toEqual(['licencas_e_prazos'])
  })

  it('não registra na central, em rota sem área nem sem consultoria', async () => {
    const router = montar('/admin')
    await act(() => router.navigate('/admin/consultorias/c-a'))
    await act(() => router.navigate('/escolher-consultoria'))
    expect(registros()).toEqual([])

    montar('/orcamentos', null)
    expect(registros()).toEqual([])
  })

  it('erro do banco ou da rede é silencioso', async () => {
    falso.reiniciar({
      rpc: { registrar_uso: { error: { code: '42501', message: 'sem_permissao' } } },
    })
    const router = montar('/orcamentos')
    falso.cliente.rpc.mockImplementationOnce(() => Promise.reject(new Error('rede caiu')))
    await act(() => router.navigate('/calendario'))
    await act(() => Promise.resolve())
    expect(registros()).toEqual(['orcamentos', 'licencas_e_prazos'])
    expect(screen.getByText('sonda')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('registro de uso no app', () => {
  it('ao abrir uma tela da consultoria, registra a área com a consultoria escolhida', async () => {
    falso.reiniciar({
      sessao: sessaoDe('ana@filtroville.test', 'Ana Ribeiro'),
      rpc: {
        meus_vinculos: { data: [vinculoFalso('Filtroville', 'equipe')] },
        registrar_uso: { error: { code: '42501', message: 'sem_permissao' } },
      },
    })
    renderizarApp('/perfil')
    expect(await screen.findByRole('heading', { level: 1, name: 'Meu perfil' })).toBeInTheDocument()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('registrar_uso', {
      p_consultoria_id: 'c-Filtroville',
      p_modulo: 'equipe_e_conta',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
