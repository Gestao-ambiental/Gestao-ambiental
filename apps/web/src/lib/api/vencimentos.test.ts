import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mensagemDoErroDoVencimento } from '@/lib/erros'
import { falso } from '@/test/supabase-falso'

import {
  cadastrarVencimento,
  criarTipoDeVencimento,
  editarTipoDeVencimento,
  editarVencimento,
  excluirVencimento,
  listarLicencasParaVencimento,
  listarTiposDeVencimento,
  listarVencimentosDoEmpreendimento,
  renovarVencimento,
  trocarPdfDoVencimento,
  type DadosDoVencimento,
} from './vencimentos'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

function linha(id: string, validoAte: string, anterior: string | null = null) {
  return {
    id,
    row_version: 3,
    tipo_vencimento_id: 't-alvara',
    unidade_id: 'u1',
    instrumento_id: 'i1',
    numero: '200/2026',
    orgao: 'Prefeitura de Joinville',
    notas: null,
    emitido_em: '2026-01-10',
    emitido_texto: null,
    valido_ate: validoAte,
    validade_texto: 'válido por 1 ano',
    antecedencia_dias: 60,
    responsavel_tecnico_id: null,
    anterior_id: anterior,
    tipo: { nome: 'Alvará' },
    unidade: { nome: 'Matriz' },
    instrumento: { numero: '1234/2024', tipo: { sigla: 'LAO' } },
    responsavel_tecnico: null,
    documento: { versao: { caminho: `c1/vencimento/${id}.pdf`, nome_original: 'alvara.pdf' } },
  }
}

const dados: DadosDoVencimento = {
  tipoId: 't-art',
  unidadeId: null,
  instrumentoId: null,
  numero: ' ART 99 ',
  orgao: '',
  notas: '',
  emitidoEm: null,
  emitidoTexto: '',
  validoAte: '2027-05-31',
  validadeTexto: '',
  antecedenciaDias: 30,
  responsavelTecnicoId: 'm1',
}

const pdf = () => ({
  versaoId: 'v-nova',
  arquivo: new File(['%PDF-1.4 art'], 'art.pdf', { type: 'application/pdf' }),
})

describe('API de vencimentos', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('lista os tipos da consultoria por nome', async () => {
    falso.reiniciar({
      tabelas: {
        tipo_vencimento: [
          { id: 't1', nome: 'Alvará', antecedencia_dias: 60, exige_pdf: true, ativo: true },
        ],
      },
    })
    expect(await listarTiposDeVencimento('c1')).toEqual([
      { id: 't1', nome: 'Alvará', antecedenciaDias: 60, exigePdf: true, ativo: true },
    ])
    expect(falso.cliente.from).toHaveBeenCalledWith('tipo_vencimento')
  })

  it('cria e edita tipo pelas RPCs', async () => {
    falso.reiniciar({
      rpc: { criar_tipo_vencimento: { data: 't9' }, editar_tipo_vencimento: { data: null } },
    })
    expect(
      await criarTipoDeVencimento('c1', {
        nome: 'Licença sanitária',
        antecedenciaDias: 45,
        exigePdf: false,
      }),
    ).toBe('t9')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('criar_tipo_vencimento', {
      p_consultoria_id: 'c1',
      p_nome: 'Licença sanitária',
      p_antecedencia_dias: 45,
      p_exige_pdf: false,
    })
    await editarTipoDeVencimento('t9', {
      nome: 'Licença sanitária',
      antecedenciaDias: 45,
      exigePdf: true,
      ativo: false,
    })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('editar_tipo_vencimento', {
      p_tipo_id: 't9',
      p_nome: 'Licença sanitária',
      p_antecedencia_dias: 45,
      p_exige_pdf: true,
      p_ativo: false,
    })
  })

  it('lista os vencimentos com licença, PDF e quem foi renovado', async () => {
    falso.reiniciar({
      tabelas: { vencimento: [linha('v2', '2027-05-31', 'v1'), linha('v1', '2026-05-31')] },
    })
    const [novo, antigo] = await listarVencimentosDoEmpreendimento('e1')
    expect(novo).toMatchObject({
      id: 'v2',
      rowVersion: 3,
      tipoNome: 'Alvará',
      unidadeNome: 'Matriz',
      licenca: 'LAO 1234/2024',
      validoAte: '2027-05-31',
      validadeTexto: 'válido por 1 ano',
      renovado: false,
      pdf: { caminho: 'c1/vencimento/v2.pdf', nome: 'alvara.pdf' },
    })
    expect(antigo?.renovado).toBe(true)
  })

  it('licenças do empreendimento com sigla e número', async () => {
    falso.reiniciar({
      tabelas: {
        instrumento: [
          { id: 'i1', numero: '1234/2024', tipo: { sigla: 'LAO' } },
          { id: 'i2', numero: null, tipo: null },
        ],
      },
    })
    expect(await listarLicencasParaVencimento('e1')).toEqual([
      { id: 'i1', rotulo: 'LAO 1234/2024' },
      { id: 'i2', rotulo: 'Licença sem número' },
    ])
  })

  it('cadastra sem PDF: os quatro campos do PDF vão nulos e texto vazio vira nulo', async () => {
    falso.reiniciar({ rpc: { cadastrar_vencimento: (args) => ({ data: args.p_id }) } })
    expect(await cadastrarVencimento('c1', 'v9', 'e1', dados, null)).toBe('v9')
    expect(falso.cliente.storage.from().upload).not.toHaveBeenCalled()
    expect(falso.cliente.rpc).toHaveBeenCalledWith('cadastrar_vencimento', {
      p_id: 'v9',
      p_empreendimento_id: 'e1',
      p_tipo_vencimento_id: 't-art',
      p_unidade_id: null,
      p_valido_ate: '2027-05-31',
      p_instrumento_id: null,
      p_numero: 'ART 99',
      p_orgao: null,
      p_notas: null,
      p_emitido_em: null,
      p_emitido_texto: null,
      p_validade_texto: null,
      p_antecedencia_dias: 30,
      p_responsavel_tecnico_id: 'm1',
      p_versao_id: null,
      p_caminho: null,
      p_nome_original: null,
      p_sha256: null,
    })
  })

  it('cadastra com PDF em <consultoria>/vencimento/<versão>.pdf', async () => {
    falso.reiniciar({ rpc: { cadastrar_vencimento: { data: 'v9' } } })
    await cadastrarVencimento('c1', 'v9', 'e1', dados, pdf())
    expect(falso.cliente.storage.from).toHaveBeenCalledWith('arquivos')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'cadastrar_vencimento',
      expect.objectContaining({
        p_versao_id: 'v-nova',
        p_caminho: 'c1/vencimento/v-nova.pdf',
        p_nome_original: 'art.pdf',
        p_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      }),
    )
  })

  it('objeto já enviado numa tentativa anterior segue para o registro', async () => {
    falso.reiniciar({ rpc: { cadastrar_vencimento: { data: 'v9' } } })
    const armazenamento = falso.cliente.storage.from()
    armazenamento.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'The resource already exists' },
    } as never)
    await expect(cadastrarVencimento('c1', 'v9', 'e1', dados, pdf())).resolves.toBe('v9')
  })

  it('falha no envio do PDF não chama a RPC', async () => {
    falso.reiniciar({ rpc: { cadastrar_vencimento: { data: 'v9' } } })
    const armazenamento = falso.cliente.storage.from()
    armazenamento.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'rede caiu' },
    } as never)
    await expect(cadastrarVencimento('c1', 'v9', 'e1', dados, pdf())).rejects.toMatchObject({
      message: 'rede caiu',
    })
    expect(falso.cliente.rpc).not.toHaveBeenCalledWith('cadastrar_vencimento', expect.anything())
  })

  it('renova mandando o anterior e o row_version dele', async () => {
    falso.reiniciar({ rpc: { renovar_vencimento: { data: 'v3' } } })
    await renovarVencimento('c1', 'v3', { id: 'v2', rowVersion: 4 }, dados, null)
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'renovar_vencimento',
      expect.objectContaining({
        p_id: 'v3',
        p_anterior_id: 'v2',
        p_row_version_anterior: 4,
        p_valido_ate: '2027-05-31',
      }),
    )
    const args = falso.cliente.rpc.mock.calls.at(-1)?.[1] ?? {}
    expect(args).not.toHaveProperty('p_tipo_vencimento_id')
    expect(args).not.toHaveProperty('p_unidade_id')
  })

  it('edita, troca o PDF e exclui com o row_version', async () => {
    falso.reiniciar({
      rpc: {
        editar_vencimento: { data: 5 },
        trocar_pdf_vencimento: { data: 'v-nova' },
        excluir_vencimento: { data: null },
      },
    })
    expect(await editarVencimento({ id: 'v2', rowVersion: 4 }, dados)).toBe(5)
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'editar_vencimento',
      expect.objectContaining({
        p_vencimento_id: 'v2',
        p_row_version: 4,
        p_tipo_vencimento_id: 't-art',
        p_antecedencia_dias: 30,
      }),
    )
    expect(await trocarPdfDoVencimento('c1', { id: 'v2' }, pdf())).toBe('v-nova')
    expect(falso.cliente.rpc).toHaveBeenCalledWith(
      'trocar_pdf_vencimento',
      expect.objectContaining({ p_vencimento_id: 'v2', p_caminho: 'c1/vencimento/v-nova.pdf' }),
    )
    await excluirVencimento({ id: 'v2', rowVersion: 5 })
    expect(falso.cliente.rpc).toHaveBeenCalledWith('excluir_vencimento', {
      p_vencimento_id: 'v2',
      p_row_version: 5,
    })
  })

  it('erro do banco sobe e vira mensagem própria do vencimento', async () => {
    falso.reiniciar({
      rpc: {
        excluir_vencimento: { error: { code: 'P0001', message: 'vencimento_ja_renovado' } },
        cadastrar_vencimento: { error: { code: '22023', message: 'pdf_obrigatorio' } },
      },
    })
    const erro: unknown = await excluirVencimento({ id: 'v1', rowVersion: 1 }).catch(
      (e: unknown) => e,
    )
    expect(mensagemDoErroDoVencimento(erro)).toBe(
      'Este vencimento já foi renovado. Recarregue a página.',
    )
    const semPdf: unknown = await cadastrarVencimento('c1', 'v9', 'e1', dados, null).catch(
      (e: unknown) => e,
    )
    // pdf_obrigatorio também existe na extração por IA; aqui fala do documento.
    expect(mensagemDoErroDoVencimento(semPdf)).toBe('Este tipo exige o PDF do documento.')
    expect(mensagemDoErroDoVencimento({ message: 'validade_obrigatoria' })).toBe(
      'Informe a validade.',
    )
  })

  it('leitura recusada sobe o erro', async () => {
    const original = falso.cliente.from.getMockImplementation()
    if (!original) throw new Error('falso sem implementação de from')
    falso.cliente.from.mockImplementation(() => {
      const recusa = Promise.resolve({ data: null, error: { code: '42501', message: 'negado' } })
      const construtor = {
        select: () => construtor,
        eq: () => construtor,
        is: () => construtor,
        order: () => construtor,
        range: () => recusa,
      }
      return construtor as unknown as ReturnType<typeof original>
    })
    try {
      await expect(listarVencimentosDoEmpreendimento('e1')).rejects.toMatchObject({
        code: '42501',
      })
      await expect(listarTiposDeVencimento('c1')).rejects.toMatchObject({ code: '42501' })
    } finally {
      falso.cliente.from.mockImplementation(original)
    }
  })
})
