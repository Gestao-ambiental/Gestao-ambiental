import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  contarPrazos,
  listarCalendario,
  listarPrazos,
  obterNomeDoCliente,
  type Filtros,
} from './prazos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const semFiltro: Filtros = {
  aba: 'todos',
  responsavelId: null,
  semResponsavel: false,
  tipoId: null,
  empreendimentoId: null,
}

const linha = {
  tipo_linha: 'ocorrencia',
  id: 'o1',
  instrumento_id: 'i1',
  prazo: '2026-11-25',
  dias: 5,
  codigo: '1.1',
  titulo: 'Monitoramento de efluentes',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Açores',
  unidade_nome: 'Matriz',
  licenca: 'LAO 1001/2024',
  responsavel_id: null,
  responsavel_nome: null,
  situacao_ocorrencia: 'em_conferencia',
  row_version: 3,
  total: 11,
}

function argumentosDa(nome: string): Record<string, unknown> {
  const chamada = falso.cliente.rpc.mock.calls.find(([n]) => n === nome)
  return chamada?.[1] ?? {}
}

describe('API de prazos', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('lista prazos sem p_cliente_id quando não há filtro de cliente', async () => {
    falso.reiniciar({ rpc: { listar_prazos: { data: [linha] } } })

    const resultado = await listarPrazos('c1', semFiltro, null, 'prazo', 1)

    const args = argumentosDa('listar_prazos')
    expect(args).toMatchObject({ p_consultoria_id: 'c1', p_limite: 25, p_deslocamento: 25 })
    expect(args).not.toHaveProperty('p_cliente_id')
    expect(resultado.total).toBe(11)
    expect(resultado.itens[0]).toMatchObject({
      tipo: 'ocorrencia',
      responsavelId: null,
      emConferencia: true,
      rowVersion: 3,
    })
  })

  it('passa p_cliente_id na lista e nos contadores quando há cliente', async () => {
    falso.reiniciar({
      rpc: {
        listar_prazos: { data: [] },
        contar_prazos: {
          data: [{ atrasadas: 1, hoje: 2, proximos_7: 3, sem_responsavel: 4, total: 10 }],
        },
      },
    })
    const filtros: Filtros = { ...semFiltro, clienteId: 'cli1' }

    const lista = await listarPrazos('c1', filtros, 'atrasadas', '-prazo', 0)
    const contadores = await contarPrazos('c1', filtros)

    expect(argumentosDa('listar_prazos')).toMatchObject({
      p_cliente_id: 'cli1',
      p_faixa: 'atrasadas',
      p_ordem: '-prazo',
    })
    expect(argumentosDa('contar_prazos')).toMatchObject({ p_cliente_id: 'cli1' })
    expect(lista).toEqual({ itens: [], total: 0 })
    expect(contadores).toEqual({ atrasadas: 1, hoje: 2, proximos7: 3, semResponsavel: 4 })
  })

  it('não passa p_cliente_id com cliente nulo', async () => {
    falso.reiniciar({ rpc: { contar_prazos: { data: [] } } })

    const contadores = await contarPrazos('c1', { ...semFiltro, clienteId: null })

    expect(argumentosDa('contar_prazos')).not.toHaveProperty('p_cliente_id')
    expect(contadores).toEqual({ atrasadas: 0, hoje: 0, proximos7: 0, semResponsavel: 0 })
  })

  it('sobe o erro da lista e dos contadores', async () => {
    falso.reiniciar({
      rpc: {
        listar_prazos: { error: { message: 'falhou', code: '500' } },
        contar_prazos: { error: { message: 'sem_permissao', code: '42501' } },
      },
    })

    await expect(listarPrazos('c1', semFiltro, null, 'prazo', 0)).rejects.toMatchObject({
      message: 'falhou',
    })
    await expect(contarPrazos('c1', semFiltro)).rejects.toMatchObject({ code: '42501' })
  })

  it('lista o calendário e sobe o erro', async () => {
    falso.reiniciar({
      rpc: {
        listar_calendario: {
          data: [
            {
              tipo_evento: 'validade',
              data: '2026-11-26',
              id: 'a1',
              instrumento_id: null,
              codigo: null,
              titulo: 'Validade do alvará',
              empreendimento_nome: 'Padaria Central',
              unidade_nome: 'Loja',
              licenca: 'Alvará',
              responsavel_nome: null,
              sem_responsavel: false,
              dias: 6,
            },
          ],
        },
      },
    })

    const eventos = await listarCalendario('c1', '2026-11-20', '2026-12-20', {
      responsavelId: null,
      unidadeId: 'u1',
      semResponsavel: false,
    })

    expect(argumentosDa('listar_calendario')).toMatchObject({ p_unidade_id: 'u1' })
    expect(eventos).toEqual([
      expect.objectContaining({
        tipo: 'validade',
        titulo: 'Validade do alvará',
        semResponsavel: false,
      }),
    ])

    falso.reiniciar({ rpc: { listar_calendario: { error: { message: 'intervalo_invalido' } } } })
    await expect(
      listarCalendario('c1', '2026-11-20', '2027-03-20', {
        responsavelId: null,
        unidadeId: null,
        semResponsavel: false,
      }),
    ).rejects.toMatchObject({ message: 'intervalo_invalido' })
  })

  it('lê o nome do cliente do filtro; nulo quando não existe ou a RLS esconde', async () => {
    falso.reiniciar({ tabelas: { cliente: [{ nome: 'Grupo Açores' }] } })
    expect(await obterNomeDoCliente('c1', 'cli1')).toBe('Grupo Açores')
    expect(falso.cliente.from).toHaveBeenCalledWith('cliente')

    falso.reiniciar({ tabelas: { cliente: [] } })
    expect(await obterNomeDoCliente('c1', 'cli-de-outra')).toBeNull()
  })

  it('linha sem licença ligada chega com instrumentoId nulo', async () => {
    falso.reiniciar({
      rpc: {
        listar_prazos: {
          data: [
            { ...linha, tipo_linha: 'vencimento', instrumento_id: null, situacao_ocorrencia: null },
          ],
        },
      },
    })
    const { itens } = await listarPrazos('c1', semFiltro, null, 'prazo', 0)
    expect(itens[0]).toMatchObject({
      tipo: 'vencimento',
      instrumentoId: null,
      emConferencia: false,
    })
  })

  it('deixa de fora a linha de um tipo que a tela ainda não conhece', async () => {
    falso.reiniciar({
      rpc: {
        listar_prazos: {
          data: [
            { ...linha, id: 'novo', tipo_linha: 'acao_legal' },
            { ...linha, id: 'o2' },
          ],
        },
      },
    })
    const { itens } = await listarPrazos('c1', semFiltro, null, 'prazo', 0)
    expect(itens.map((i) => i.id)).toEqual(['o2'])
  })
})
