import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  atribuirAcaoLegal,
  avaliarRequisito,
  decidirAplicabilidade,
  listarRequisitosDoEmpreendimento,
  sugerirRequisitos,
} from './requisitos-legais'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const linha = {
  id: 'r1',
  norma_id: 'n1',
  norma_titulo: 'IN 2 · Comércio de combustíveis',
  norma_situacao_na_fonte: 'vigente',
  dispositivo: null,
  descricao: null,
  origem: 'sugerido',
  motivo: { criterio: 'atividade', valor: '47.30.00' },
  aplicavel: true,
  justificativa: null,
  responsavel_id: null,
  row_version: 3,
  avaliacao_resultado: 'conforme',
  avaliada_em: '2026-11-10',
  avaliada_por_nome: 'Ana Ribeiro',
  ultima_mudanca_publicada_em: null,
  acao_id: 'a1',
  acao_descricao: 'Trocar o filtro',
  acao_prazo: '2026-12-01',
  acao_responsavel_id: 'm2',
  acao_responsavel_nome: 'Ana Ribeiro',
  acao_row_version: 1,
  evidencias: 2,
  menor_validade: '2027-03-01',
  total: 7,
}

describe('API de requisitos legais', () => {
  beforeEach(() => {
    falso.reiniciar({ rpc: { listar_requisitos_do_empreendimento: { data: [linha] } } })
  })

  it('lista com a ação, a evidência e o motivo, e pagina pelo deslocamento', async () => {
    const { itens, total } = await listarRequisitosDoEmpreendimento('c1', 'e1', 2)
    expect(total).toBe(7)
    expect(itens[0]).toMatchObject({
      id: 'r1',
      normaRevogada: false,
      motivo: { criterio: 'atividade', valor: '47.30.00' },
      avaliacaoResultado: 'conforme',
      acao: { id: 'a1', prazo: '2026-12-01', responsavelNome: 'Ana Ribeiro', rowVersion: 1 },
      evidencias: 2,
      menorValidade: '2027-03-01',
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('listar_requisitos_do_empreendimento', {
      p_consultoria_id: 'c1',
      p_empreendimento_id: 'e1',
      p_limite: 50,
      p_deslocamento: 100,
    })
  })

  it('linha sem ação nem avaliação chega com nulos', async () => {
    falso.reiniciar({
      rpc: {
        listar_requisitos_do_empreendimento: {
          data: [
            {
              ...linha,
              aplicavel: null,
              acao_id: null,
              avaliacao_resultado: null,
              avaliada_em: null,
              motivo: null,
            },
          ],
        },
      },
    })
    const { itens } = await listarRequisitosDoEmpreendimento('c1', 'e1', 0)
    expect(itens[0]).toMatchObject({
      aplicavel: null,
      acao: null,
      avaliacaoResultado: null,
      motivo: null,
    })
  })

  it('avaliação manda a ação só quando há uma, sem responsável vazio', async () => {
    falso.reiniciar({ rpc: { avaliar_requisito: { data: { row_version: 4 } } } })
    await avaliarRequisito('c1', { id: 'r1', rowVersion: 3 }, 'nao_conforme', '2026-11-20', null, {
      descricao: 'Trocar o filtro',
      prazo: '2026-12-01',
      responsavelId: null,
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('avaliar_requisito', {
      p_consultoria_id: 'c1',
      p_requisito_id: 'r1',
      p_resultado: 'nao_conforme',
      p_avaliada_em: '2026-11-20',
      p_observacao: null,
      p_acao: { descricao: 'Trocar o filtro', prazo: '2026-12-01' },
      p_row_version: 3,
    })
  })

  it('sugere, decide e atribui pelas RPCs', async () => {
    falso.reiniciar({
      rpc: {
        sugerir_requisitos: { data: 4 },
        decidir_aplicabilidade: { data: 2 },
        atribuir_acao_legal: { data: 2 },
      },
    })
    expect(await sugerirRequisitos('c1', 'e1')).toBe(4)
    expect(await decidirAplicabilidade('c1', { id: 'r1', rowVersion: 1 }, false, 'Não temos')).toBe(
      2,
    )
    await atribuirAcaoLegal('c1', 'a1', 'm2', 1)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('atribuir_acao_legal', {
      p_consultoria_id: 'c1',
      p_acao_id: 'a1',
      p_responsavel_id: 'm2',
      p_row_version: 1,
    })
  })

  it('sobe o erro do banco', async () => {
    falso.reiniciar({
      rpc: {
        sugerir_requisitos: { error: { code: '42501', message: 'recurso_fora_do_plano' } },
      },
    })
    await expect(sugerirRequisitos('c1', 'e1')).rejects.toMatchObject({
      message: 'recurso_fora_do_plano',
    })
  })
})
