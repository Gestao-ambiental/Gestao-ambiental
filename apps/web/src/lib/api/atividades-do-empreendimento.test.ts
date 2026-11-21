// Wrappers das atividades do empreendimento (ADR-0050, LEG-05): gravação pela RPC só da Gestão e
// leitura unindo o que foi gravado no empreendimento e nas licenças dele.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  gravarAtividadesNoEmpreendimento,
  listarAtividadesDoEmpreendimento,
} from './atividades-do-empreendimento'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const ATIVIDADE = {
  codigo: '12.80.10',
  descricao: 'Usinagem com pintura',
  porte: 'medio' as const,
  potencial: 'M' as const,
  medidas: { 'AU(3)': 0.5 },
  fonte: 'Resolução CONSEMA 250/2024',
}

beforeEach(() => {
  falso.reiniciar({})
})

describe('gravarAtividadesNoEmpreendimento', () => {
  it('manda as atividades à RPC e devolve o total do empreendimento', async () => {
    falso.reiniciar({ rpc: { gravar_atividades_no_empreendimento: { data: 3 } } })
    await expect(gravarAtividadesNoEmpreendimento('c1', 'e1', [ATIVIDADE])).resolves.toBe(3)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('gravar_atividades_no_empreendimento', {
      p_consultoria_id: 'c1',
      p_empreendimento_id: 'e1',
      p_atividades: [ATIVIDADE],
    })
  })

  it('erro da RPC sobe para a tela', async () => {
    const erro = { message: 'sem_permissao', code: '42501' }
    falso.reiniciar({ rpc: { gravar_atividades_no_empreendimento: { error: erro } } })
    await expect(gravarAtividadesNoEmpreendimento('c1', 'e1', [ATIVIDADE])).rejects.toBe(erro)
  })
})

describe('listarAtividadesDoEmpreendimento', () => {
  it('lê as do empreendimento e as das licenças, com a origem', async () => {
    falso.reiniciar({
      rpc: {
        listar_atividades_do_empreendimento: {
          data: [
            {
              codigo: '12.80.10',
              descricao: 'Usinagem com pintura',
              porte: 'medio',
              potencial: 'M',
              origem: 'empreendimento',
              instrumento_id: null,
              registrado_em: '2026-11-20T12:00:00Z',
            },
            {
              codigo: '17.21.00',
              descricao: 'Papel',
              porte: 'pequeno',
              potencial: 'G',
              origem: 'licenca',
              instrumento_id: 'i1',
              registrado_em: '2026-11-19T12:00:00Z',
            },
          ],
        },
      },
    })
    await expect(listarAtividadesDoEmpreendimento('c1', 'e1')).resolves.toEqual([
      {
        codigo: '12.80.10',
        descricao: 'Usinagem com pintura',
        porte: 'medio',
        potencial: 'M',
        origem: 'empreendimento',
        instrumentoId: null,
        registradoEm: '2026-11-20T12:00:00Z',
      },
      {
        codigo: '17.21.00',
        descricao: 'Papel',
        porte: 'pequeno',
        potencial: 'G',
        origem: 'licenca',
        instrumentoId: 'i1',
        registradoEm: '2026-11-19T12:00:00Z',
      },
    ])
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_atividades_do_empreendimento', {
      p_consultoria_id: 'c1',
      p_empreendimento_id: 'e1',
    })
  })

  it('erro da leitura sobe', async () => {
    const erro = { message: 'falhou', code: 'XX000' }
    falso.reiniciar({ rpc: { listar_atividades_do_empreendimento: { error: erro } } })
    await expect(listarAtividadesDoEmpreendimento('c1', 'e1')).rejects.toBe(erro)
  })
})
