// Selo "Norma mudou" (ADR-0050, item 25): licenças do empreendimento com aviso não visto.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { listarLicencasComMudancaDeNorma } from './normas-da-licenca'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

beforeEach(() => {
  falso.reiniciar({})
})

describe('listarLicencasComMudancaDeNorma', () => {
  it('chama a RPC com consultoria e empreendimento e devolve as licenças', async () => {
    falso.reiniciar({
      rpc: {
        licencas_com_mudanca_de_norma: {
          data: [
            { instrumento_id: 'i1', mudancas: 2 },
            { instrumento_id: 'i2', mudancas: 0 },
          ],
        },
      },
    })
    await expect(listarLicencasComMudancaDeNorma('c1', 'e1')).resolves.toEqual([
      { instrumentoId: 'i1', mudancas: 2 },
    ])
    expect(falso.cliente.rpc).toHaveBeenCalledWith('licencas_com_mudanca_de_norma', {
      p_consultoria_id: 'c1',
      p_empreendimento_id: 'e1',
    })
  })

  it('sem linhas devolve lista vazia', async () => {
    await expect(listarLicencasComMudancaDeNorma('c1', 'e1')).resolves.toEqual([])
  })

  it('erro da RPC sobe como veio', async () => {
    const erro = { message: 'sem_permissao', code: '42501' }
    falso.reiniciar({ rpc: { licencas_com_mudanca_de_norma: { error: erro } } })
    await expect(listarLicencasComMudancaDeNorma('c1', 'e1')).rejects.toBe(erro)
  })
})
