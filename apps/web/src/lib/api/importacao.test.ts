import { dadosVazios } from '@gestao-ambiental/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mensagemDoErro, mensagemDoErroDaImportacao } from '@/lib/erros'
import { falso } from '@/test/supabase-falso'

import {
  conferirImportacao,
  criarImportacao,
  desfazerImportacao,
  efetivarImportacao,
  enviarTodasAsLinhas,
  listarImportacoes,
  listarLinhasComErro,
  listarLinhasDaImportacao,
  obterImportacao,
  obterMapeamentoLembrado,
} from './importacao'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const resumoDoBanco = {
  row_version: 3,
  total: 4,
  prontas: 2,
  com_aviso: 1,
  com_erro: 1,
  puladas: 1,
  a_criar: { empreendimentos: 2, unidades: 2, licencas: 2 },
  limite: {
    recurso: 'empreendimentos',
    quantidade: 11,
    limite: 10,
    precisa_confirmar: true,
    adicionais_centavos: 2000,
  },
}

const linhaDoBanco = {
  numero_linha: 3,
  dados: {
    ...dadosVazios(),
    empreendimento: 'Metalúrgica',
    cnpj: '1234',
    descartados: ['cliente'],
  },
  erros: [{ codigo: 'cnpj_invalido', campo: 'cnpj' }, { semCodigo: true }],
  avisos: [],
  grupo: 'erro',
  resultado: null,
  motivo_mantida: null,
  empreendimento_id: null,
  instrumento_id: null,
}

describe('API da importação', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('cria a importação com o mapeamento e devolve o id', async () => {
    falso.reiniciar({ rpc: { criar_importacao: (args) => ({ data: args.p_id }) } })
    const id = await criarImportacao({
      id: 'i1',
      consultoriaId: 'c1',
      entidade: 'licenca',
      nomeArquivo: 'carteira.xlsx',
      totalLinhas: 4,
      mapeamento: { empreendimento: 'Empresa', validade: 'Vencimento' },
    })
    expect(id).toBe('i1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_importacao', {
      p_id: 'i1',
      p_consultoria_id: 'c1',
      p_entidade: 'licenca',
      p_nome_arquivo: 'carteira.xlsx',
      p_total_linhas: 4,
      p_mapeamento: { empreendimento: 'Empresa', validade: 'Vencimento' },
    })
  })

  it('envia as linhas em lotes de 200, uma depois da outra, avisando o progresso', async () => {
    falso.reiniciar({
      rpc: {
        enviar_linhas_da_importacao: (args) => ({
          data: (args.p_linhas as unknown[]).length,
        }),
      },
    })
    const linhas = Array.from({ length: 450 }, (_, i) => ({
      numeroLinha: i + 2,
      dados: { ...dadosVazios(), empreendimento: `E${String(i)}` },
    }))
    const progresso: number[] = []
    await enviarTodasAsLinhas('i1', linhas, (n) => progresso.push(n))

    expect(progresso).toEqual([200, 400, 450])
    const chamadas = falso.cliente.rpc.mock.calls.filter(
      ([nome]) => nome === 'enviar_linhas_da_importacao',
    )
    expect(chamadas.map(([, args]) => (args?.p_linhas as unknown[]).length)).toEqual([200, 200, 50])
    expect((chamadas[0]?.[1]?.p_linhas as unknown[])[0]).toEqual({
      numero_linha: 2,
      dados: { ...dadosVazios(), empreendimento: 'E0' },
    })
  })

  it('para no primeiro lote recusado e repassa o erro do banco', async () => {
    falso.reiniciar({
      rpc: { enviar_linhas_da_importacao: { error: { message: 'cpf_nao_aceito', code: '22023' } } },
    })
    const linhas = Array.from({ length: 250 }, (_, i) => ({
      numeroLinha: i + 2,
      dados: dadosVazios(),
    }))
    const erro: unknown = await enviarTodasAsLinhas('i1', linhas).catch((e: unknown) => e)
    expect(mensagemDoErroDaImportacao(erro)).toBe(
      'A planilha ainda tem CPF: nada foi enviado. Apague o CPF e tente de novo.',
    )
    expect(falso.cliente.rpc).toHaveBeenCalledTimes(1)
  })

  it('lê o resumo da conferência no formato da tela', async () => {
    falso.reiniciar({ rpc: { conferir_importacao: { data: resumoDoBanco } } })
    expect(await conferirImportacao('i1')).toEqual({
      rowVersion: 3,
      total: 4,
      prontas: 2,
      comAviso: 1,
      comErro: 1,
      puladas: 1,
      aCriar: { empreendimentos: 2, unidades: 2, licencas: 2 },
      limite: { quantidade: 11, limite: 10, precisaConfirmar: true, adicionaisCentavos: 2000 },
    })
  })

  it('efetiva com a versão e a confirmação do adicional; erro de versão vira mensagem', async () => {
    falso.reiniciar({
      rpc: {
        efetivar_importacao: {
          data: {
            row_version: 4,
            linhas_criadas: 2,
            linhas_puladas: 1,
            linhas_com_erro: 1,
            empreendimentos_criados: 2,
            unidades_criadas: 2,
            licencas_criadas: 2,
            desfazer_ate: '2026-11-21T13:00:00Z',
          },
        },
      },
    })
    const resultado = await efetivarImportacao('i1', 3, true)
    expect(falso.cliente.rpc).toHaveBeenCalledWith('efetivar_importacao', {
      p_importacao_id: 'i1',
      p_row_version: 3,
      p_confirmar_adicional: true,
    })
    expect(resultado).toMatchObject({
      rowVersion: 4,
      licencasCriadas: 2,
      desfazerAte: '2026-11-21T13:00:00Z',
    })

    falso.reiniciar({
      rpc: { efetivar_importacao: { error: { message: 'conflito_de_versao', code: 'P0001' } } },
    })
    const erro: unknown = await efetivarImportacao('i1', 3, false).catch((e: unknown) => e)
    expect(mensagemDoErroDaImportacao(erro)).toMatch(/alterado em outro lugar/)
  })

  it('desfaz e lê as linhas mantidas, ignorando motivo desconhecido', async () => {
    falso.reiniciar({
      rpc: {
        desfazer_importacao: {
          data: {
            row_version: 5,
            linhas_desfeitas: 1,
            linhas_mantidas: 1,
            empreendimentos_desfeitos: 1,
            unidades_desfeitas: 1,
            licencas_desfeitas: 1,
            mantidas: [
              { numero_linha: 3, motivo: 'tem_dependentes' },
              { numero_linha: 4, motivo: 'outro' },
            ],
          },
        },
      },
    })
    const resultado = await desfazerImportacao('i1', 4)
    expect(resultado.mantidas).toEqual([{ numeroLinha: 3, motivo: 'tem_dependentes' }])
    expect(resultado.licencasDesfeitas).toBe(1)
  })

  it('lista o histórico e lê uma importação; inexistente é nulo', async () => {
    const importacao = {
      id: 'i1',
      entidade: 'licenca',
      nome_arquivo: 'carteira.xlsx',
      total_linhas: 4,
      situacao: 'em_conferencia',
      criado_em: '2026-11-20T13:00:00Z',
      efetivada_em: null,
      row_version: 3,
      resumo: resumoDoBanco,
      resultado: null,
      resultado_desfazer: null,
    }
    falso.reiniciar({ tabelas: { importacao: [importacao] } })
    expect(await listarImportacoes('c1', 0)).toEqual({
      itens: [
        {
          id: 'i1',
          entidade: 'licenca',
          nomeArquivo: 'carteira.xlsx',
          totalLinhas: 4,
          situacao: 'em_conferencia',
          criadoEm: '2026-11-20T13:00:00Z',
          efetivadaEm: null,
        },
      ],
      total: 1,
    })
    const lida = await obterImportacao('i1')
    expect(lida?.resumo?.limite.precisaConfirmar).toBe(true)
    expect(lida?.resultado).toBeNull()

    falso.reiniciar({ tabelas: {} })
    expect(await obterImportacao('i9')).toBeNull()
  })

  it('lê as linhas com dados, problemas e grupo', async () => {
    falso.reiniciar({ tabelas: { importacao_linha: [linhaDoBanco] } })
    const { itens, total } = await listarLinhasDaImportacao('i1', 'erro', 0)
    expect(total).toBe(1)
    expect(itens[0]).toMatchObject({
      numeroLinha: 3,
      grupo: 'erro',
      erros: [{ codigo: 'cnpj_invalido', campo: 'cnpj' }],
      dados: { empreendimento: 'Metalúrgica', descartados: ['cliente'] },
    })
    expect(await listarLinhasComErro('i1')).toHaveLength(1)
  })

  it('lembra o mapeamento só com valores de texto; sem memória é nulo', async () => {
    falso.reiniciar({
      tabelas: {
        importacao_mapeamento: [{ mapeamento: { empreendimento: 'Empresa', cnpj: 7 } }],
      },
    })
    expect(await obterMapeamentoLembrado('c1', 'empreendimento')).toEqual({
      empreendimento: 'Empresa',
    })
    falso.reiniciar({ tabelas: {} })
    expect(await obterMapeamentoLembrado('c1', 'licenca')).toBeNull()
  })

  it('mensagens próprias da importação para os códigos reaproveitados', () => {
    const entidade = { message: 'entidade_invalida' }
    expect(mensagemDoErroDaImportacao(entidade)).toBe('Escolha Empreendimentos ou Licenças.')
    // Fora da importação, o mesmo código mantém o sentido antigo.
    expect(mensagemDoErro(entidade)).toBe('Não foi possível anexar o PDF. Tente de novo.')
    expect(mensagemDoErroDaImportacao({ message: 'prazo_para_desfazer_encerrado' })).toMatch(
      /24 horas/,
    )
  })
})
