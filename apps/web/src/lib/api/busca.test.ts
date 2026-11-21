// Busca global (ADR-0041): a RPC buscar_no_grama devolve linhas de vários tipos; tipo que a tela não
// conhece é descartado, para uma fonte nova no banco não quebrar o Ctrl+K.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { buscarNoGrama } from './busca'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

beforeEach(() => {
  falso.reiniciar({})
})

describe('buscarNoGrama', () => {
  it('chama a RPC e devolve licença e norma com a referência da rota', async () => {
    falso.reiniciar({
      rpc: {
        buscar_no_grama: {
          data: [
            {
              tipo: 'licenca',
              id: 'i1',
              titulo: 'LAO 4821/2023',
              detalhe: null,
              referencia_id: 'e1',
              posicao: 1,
            },
            {
              tipo: 'norma',
              id: 'n1',
              titulo: 'Instrução Normativa 4',
              detalhe: 'IMA · Instrução normativa',
              referencia_id: 'n1',
              posicao: 1,
            },
          ],
        },
      },
    })
    await expect(buscarNoGrama('c1', 'in')).resolves.toEqual([
      { tipo: 'licenca', id: 'i1', titulo: 'LAO 4821/2023', detalhe: null, referenciaId: 'e1' },
      {
        tipo: 'norma',
        id: 'n1',
        titulo: 'Instrução Normativa 4',
        detalhe: 'IMA · Instrução normativa',
        referenciaId: 'n1',
      },
    ])
    expect(falso.cliente.rpc).toHaveBeenCalledWith('buscar_no_grama', {
      p_consultoria_id: 'c1',
      p_termo: 'in',
    })
  })

  it('descarta tipo desconhecido', async () => {
    falso.reiniciar({
      rpc: {
        buscar_no_grama: {
          data: [{ tipo: 'outro', id: 'x', titulo: 'X', detalhe: null, referencia_id: 'x' }],
        },
      },
    })
    await expect(buscarNoGrama('c1', 'xx')).resolves.toEqual([])
  })

  it('erro da RPC sobe como veio', async () => {
    const erro = { message: 'falha' }
    falso.reiniciar({ rpc: { buscar_no_grama: { error: erro } } })
    await expect(buscarNoGrama('c1', 'xx')).rejects.toBe(erro)
  })
})
