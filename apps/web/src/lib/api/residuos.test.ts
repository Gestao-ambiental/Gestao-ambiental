import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import { conferenciaDeResiduos, enviarPdfResiduo, listarMtrs, registrarMtr } from './residuos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const linhaDoMtr = {
  id: 'm1',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Rio Cubatão',
  numero: '2610001',
  emitido_em: '2026-10-05',
  situacao: 'recebido',
  transportador_nome: 'Transportes Itapocu',
  transportador_cnpj: null,
  destinador_nome: 'Aterro Norte',
  destinador_cnpj: '12345678000190',
  observacao: null,
  pdf_caminho: null,
  pdf_nome: null,
  itens: [
    {
      id: 'i1',
      posicao: 1,
      residuo_codigo: '200301',
      residuo_descricao: 'Resíduos urbanos misturados',
      classe: 'II A',
      quantidade: 1.5,
      unidade: 't',
    },
  ],
  cdfs: [{ id: 'c1', numero: 'CDF-77', emitido_em: '2026-11-04' }],
  tem_cdf: true,
  row_version: 1,
  criado_em: '2026-11-14T12:00:00Z',
  total: 51,
}

describe('API de resíduos', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('lista MTRs paginados com itens e CDFs', async () => {
    falso.reiniciar({ rpc: { listar_mtrs: { data: [linhaDoMtr] } } })

    const resultado = await listarMtrs('c1', { empreendimentoId: 'e1', semCdf: false }, 1)

    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'listar_mtrs',
      expect.objectContaining({ p_empreendimento_id: 'e1', p_limite: 50, p_deslocamento: 50 }),
    )
    expect(resultado.total).toBe(51)
    expect(resultado.itens[0]).toMatchObject({
      numero: '2610001',
      situacao: 'recebido',
      temCdf: true,
      pdf: null,
      itens: [{ residuoCodigo: '200301', quantidade: 1.5, unidade: 't', classe: 'II A' }],
      cdfs: [{ id: 'c1', numero: 'CDF-77', emitidoEm: '2026-11-04' }],
    })
  })

  it('registra o MTR mandando os itens no formato do banco', async () => {
    falso.reiniciar({ rpc: { registrar_mtr: (args) => ({ data: args.p_id }) } })

    const id = await registrarMtr('m9', 'e1', {
      numero: '2610009',
      emitidoEm: '2026-11-10',
      situacao: 'salvo',
      transportadorNome: 'Transportes Itapocu',
      destinadorNome: 'Aterro Norte',
      itens: [
        { residuoCodigo: '200301', residuoDescricao: 'Resíduos', quantidade: 0.25, unidade: 'm3' },
      ],
    })

    expect(id).toBe('m9')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'registrar_mtr',
      expect.objectContaining({
        p_transportador_cnpj: null,
        p_itens: [
          {
            residuo_codigo: '200301',
            residuo_descricao: 'Resíduos',
            classe: null,
            quantidade: 0.25,
            unidade: 'm3',
          },
        ],
      }),
    )
  })

  it('lê as pendências da conferência e repassa o erro do banco', async () => {
    falso.reiniciar({
      rpc: {
        conferencia_residuos: {
          data: [
            {
              tipo: 'quantidade_diferente',
              mtr_id: 'm1',
              numero: '2610001',
              emitido_em: '2026-10-05',
              empreendimento_id: 'e1',
              empreendimento_nome: 'Metalúrgica Rio Cubatão',
              dias: null,
              mtr_item_id: 'i1',
              residuo_codigo: '200301',
              residuo_descricao: 'Resíduos urbanos misturados',
              unidade: 't',
              quantidade_mtr: 1.5,
              quantidade_cdf: 1.4999,
              diferenca: -0.0001,
              cdfs: [{ id: 'c1', numero: 'CDF-77' }],
              unidades_cdf: [],
            },
          ],
        },
      },
    })
    const [pendencia] = await conferenciaDeResiduos('c1')
    expect(pendencia).toMatchObject({
      tipo: 'quantidade_diferente',
      diferenca: -0.0001,
      cdfs: [{ numero: 'CDF-77' }],
    })

    falso.reiniciar({ rpc: { conferencia_residuos: { error: { message: 'sem_permissao' } } } })
    await expect(conferenciaDeResiduos('c1')).rejects.toEqual({ message: 'sem_permissao' })
  })

  it('envia o PDF como objeto novo e registra a versão', async () => {
    falso.reiniciar({ rpc: { anexar_pdf_residuo: (args) => ({ data: args.p_versao_id }) } })
    const arquivo = new File(['%PDF-1.7'], 'MTR.pdf', { type: 'application/pdf' })

    const versao = await enviarPdfResiduo('mtr', 'm1', 'c1', arquivo)

    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'anexar_pdf_residuo',
      expect.objectContaining({
        p_entidade: 'mtr',
        p_registro_id: 'm1',
        p_caminho: `c1/mtr/${versao}.pdf`,
        p_nome_original: 'MTR.pdf',
      }),
    )
  })
})
