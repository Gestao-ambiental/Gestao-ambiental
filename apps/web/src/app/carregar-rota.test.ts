import { afterEach, describe, expect, it, vi } from 'vitest'

import { carregarRota } from './carregar-rota'

const falhaDoChunk = () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module'))

describe('carregarRota', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devolve o módulo quando o import funciona, sem recarregar', async () => {
    const recarregar = vi.fn()
    await expect(carregarRota(() => Promise.resolve({ ok: 1 }), recarregar)()).resolves.toEqual({
      ok: 1,
    })
    expect(recarregar).not.toHaveBeenCalled()
  })

  it('chunk que não carrega (deploy novo): recarrega a página uma vez e não mostra erro', async () => {
    const recarregar = vi.fn()
    const pendente = carregarRota(falhaDoChunk, recarregar)()
    let terminou = false
    void pendente.finally(() => {
      terminou = true
    })
    await vi.waitFor(() => {
      expect(recarregar).toHaveBeenCalledTimes(1)
    })
    await Promise.resolve()
    expect(terminou).toBe(false)
  })

  it('se falha de novo logo depois de recarregar, não entra em laço: o erro segue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const recarregar = vi.fn()
    void carregarRota(falhaDoChunk, recarregar)()
    await vi.waitFor(() => {
      expect(recarregar).toHaveBeenCalledTimes(1)
    })

    // A página recarregou (o sessionStorage fica) e o import falha outra vez.
    vi.advanceTimersByTime(2_000)
    await expect(carregarRota(falhaDoChunk, recarregar)()).rejects.toThrow(
      'Failed to fetch dynamically imported module',
    )
    expect(recarregar).toHaveBeenCalledTimes(1)

    // Num deploy seguinte, bem depois, volta a recarregar.
    vi.advanceTimersByTime(60_000)
    void carregarRota(falhaDoChunk, recarregar)()
    await vi.waitFor(() => {
      expect(recarregar).toHaveBeenCalledTimes(2)
    })
  })
})
