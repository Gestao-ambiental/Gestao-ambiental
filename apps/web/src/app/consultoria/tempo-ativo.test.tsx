import { act, fireEvent, render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  concluirTarefa,
  iniciarTarefa,
  reiniciarTempoAtivo,
  useTempoDeAcompanhamento,
  usePrenderTarefa,
} from './tempo-ativo'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function Tela({ chave }: { chave: string }) {
  usePrenderTarefa(chave)
  return <p>tela</p>
}

function Area() {
  useTempoDeAcompanhamento('c-a')
  return <p>área</p>
}

function tarefas() {
  return falso.cliente.rpc.mock.calls
    .filter(([rpc]) => rpc === 'registrar_tarefa')
    .map(([, a]) => a)
}

function mudarVisibilidade(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

function passar(segundos: number) {
  act(() => {
    vi.advanceTimersByTime(segundos * 1000)
  })
}

describe('tempo ativo por tarefa (ADR-0027)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-14T13:00:00Z'))
    falso.reiniciar({ rpc: { registrar_tarefa: { data: null } } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    reiniciarTempoAtivo()
  })

  afterEach(() => {
    reiniciarTempoAtivo()
    vi.useRealTimers()
  })

  it('pausa sem interação por 2 minutos e com a aba escondida; grava ao concluir', () => {
    render(<Tela chave="manual:x" />)
    iniciarTarefa('manual:x')

    // 3 minutos parado: só os 2 primeiros contam.
    passar(180)
    // Uma tecla e mais 30 s: contam.
    fireEvent.keyDown(window, { key: 'a' })
    passar(30)
    // Aba escondida: não conta, mesmo com interação recente.
    act(() => {
      mudarVisibilidade('hidden')
    })
    passar(20)

    concluirTarefa('manual:x', 'c-a', 'cadastro_condicionante_manual', 1)
    expect(tarefas()).toEqual([
      {
        p_consultoria_id: 'c-a',
        p_tipo: 'cadastro_condicionante_manual',
        p_quantidade: 1,
        p_segundos: 150,
      },
    ])
  })

  it('tarefa sem nenhuma tela montada não conta; sem segundos, nada é gravado', () => {
    iniciarTarefa('ia:y')
    passar(60)
    concluirTarefa('ia:y', 'c-a', 'cadastro_licenca_ia', 3)
    expect(tarefas()).toEqual([])
  })

  it('acompanhamento: grava o tempo da área ao sair dela', async () => {
    const router = createMemoryRouter([{ path: '*', element: <Area /> }], {
      initialEntries: ['/calendario'],
    })
    render(<RouterProvider router={router} />)
    fireEvent.pointerDown(window)
    passar(45)
    await act(() => router.navigate('/empreendimentos'))
    passar(15)
    expect(tarefas()).toEqual([])

    await act(() => router.navigate('/orcamentos'))
    expect(tarefas()).toEqual([
      { p_consultoria_id: 'c-a', p_tipo: 'acompanhamento', p_quantidade: 1, p_segundos: 60 },
    ])
  })
})
