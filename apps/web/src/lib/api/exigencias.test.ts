import { beforeEach, describe, expect, it, vi } from 'vitest'

import { falso } from '@/test/supabase-falso'

import {
  anexarAExigencia,
  atribuirExigencia,
  definirProcessoDaLicenca,
  editarExigencia,
  excluirExigencia,
  listarExigencias,
  listarLicencasParaExigencia,
  listarRespostasDaExigencia,
  obterExigencia,
  prorrogarExigencia,
  registrarExigencia,
  responderExigencia,
  type DadosDaExigencia,
} from './exigencias'

vi.mock('@/lib/supabase', () => import('@/test/supabase-falso'))

const LINHA_DE_EXIGENCIA = {
  id: 'x1',
  empreendimento_id: 'e1',
  empreendimento_nome: 'Metalúrgica Açores',
  unidade_id: 'u1',
  unidade_nome: 'Matriz',
  instrumento_id: null,
  licenca: null,
  licenca_numero_processo: null,
  licenca_row_version: null,
  numero_processo: null,
  numero_oficio: '112/2026',
  orgao: 'IMA',
  assunto: 'Apresentar laudo complementar',
  notas: null,
  recebido_em: '2026-11-18',
  recebido_em_texto: '18/11/2026',
  prazo_dias: 5,
  prazo_contagem: 'corridos',
  prazo_oficial_original: '2026-11-23',
  prazo_oficial: '2026-11-23',
  prazo_oficial_texto: null,
  meta_interna: '2026-11-23',
  responsavel_id: null,
  responsavel_nome: null,
  situacao: 'aberta',
  primeira_resposta_em: null,
  respostas: 0,
  oficio_caminho: null,
  oficio_nome: null,
  criado_em: '2026-11-18T13:00:00Z',
  criado_por_nome: 'Eduardo Karnopp',
  row_version: 1,
  hoje: '2026-11-20',
  dias: 3,
  total: 7,
}

const DADOS: DadosDaExigencia = {
  unidadeId: 'u1',
  instrumentoId: null,
  assunto: 'Apresentar laudo complementar',
  numeroOficio: '112/2026',
  orgao: 'IMA',
  numeroProcesso: '',
  notas: '',
  recebidoEm: '2026-11-18',
  recebidoEmTexto: '18/11/2026',
  prazo: { modo: 'dias', dias: 5, contagem: 'corridos' },
  prazoOficial: '2026-11-23',
  metaInterna: '2026-11-23',
  responsavelId: null,
}

const pdf = () => new File(['%PDF-1.7'], 'oficio.pdf', { type: 'application/pdf' })

function argumentosDa(nome: string): Record<string, unknown> {
  const chamada = falso.cliente.rpc.mock.calls.find(([n]) => n === nome)
  return chamada?.[1] ?? {}
}

describe('API de exigências', () => {
  beforeEach(() => {
    falso.reiniciar({})
  })

  it('lista com o filtro de situação, a página e o total', async () => {
    falso.reiniciar({ rpc: { listar_exigencias: { data: [LINHA_DE_EXIGENCIA] } } })
    const pagina = await listarExigencias('c1', { situacao: 'abertas', pagina: 2 })

    expect(argumentosDa('listar_exigencias')).toEqual({
      p_consultoria_id: 'c1',
      p_empreendimento_id: null,
      p_situacao: 'abertas',
      p_limite: 25,
      p_deslocamento: 50,
    })
    expect(pagina.total).toBe(7)
    expect(pagina.itens[0]).toMatchObject({
      id: 'x1',
      numeroOficio: '112/2026',
      prazoContagem: 'corridos',
      situacao: 'aberta',
      oficio: null,
      rowVersion: 1,
      dias: 3,
    })
  })

  it('"todas" manda situação nula; lista vazia tem total zero', async () => {
    const pagina = await listarExigencias('c1', { empreendimentoId: 'e1', situacao: 'todas' })
    expect(argumentosDa('listar_exigencias')).toMatchObject({
      p_empreendimento_id: 'e1',
      p_situacao: null,
    })
    expect(pagina).toEqual({ itens: [], total: 0 })
  })

  it('obter devolve null quando a RLS não traz a linha', async () => {
    expect(await obterExigencia('c1', 'x9')).toBeNull()
    expect(argumentosDa('listar_exigencias')).toEqual({
      p_consultoria_id: 'c1',
      p_exigencia_id: 'x9',
      p_limite: 1,
    })
  })

  it('erro da leitura sobe', async () => {
    falso.reiniciar({
      rpc: { listar_exigencias: { error: { code: '42501', message: 'sem_permissao' } } },
    })
    await expect(listarExigencias('c1')).rejects.toMatchObject({ message: 'sem_permissao' })
  })

  it('registra em dias sem PDF: sem os campos do PDF e sem o texto do prazo', async () => {
    falso.reiniciar({ rpc: { registrar_exigencia: { data: 'x1' } } })
    expect(await registrarExigencia('c1', 'x1', DADOS, null, 'v1')).toBe('x1')

    const args = argumentosDa('registrar_exigencia')
    expect(args).toMatchObject({
      p_id: 'x1',
      p_unidade_id: 'u1',
      p_prazo_dias: 5,
      p_prazo_contagem: 'corridos',
      p_prazo_oficial_texto: null,
      p_prazo_oficial: '2026-11-23',
      p_recebido_em_texto: '18/11/2026',
      p_instrumento_id: null,
      p_responsavel_id: null,
    })
    expect(args).not.toHaveProperty('p_versao_id')
    expect(falso.cliente.storage.from).not.toHaveBeenCalled()
  })

  it('registra com data informada e PDF do ofício no caminho da exigência', async () => {
    falso.reiniciar({ rpc: { registrar_exigencia: { data: 'x1' } } })
    await registrarExigencia(
      'c1',
      'x1',
      { ...DADOS, prazo: { modo: 'data', texto: '30 de novembro de 2026' } },
      pdf(),
      'v1',
    )
    const args = argumentosDa('registrar_exigencia')
    expect(args).toMatchObject({
      p_prazo_dias: null,
      p_prazo_contagem: null,
      p_prazo_oficial_texto: '30 de novembro de 2026',
      p_versao_id: 'v1',
      p_caminho: 'c1/exigencia/v1.pdf',
      p_nome_original: 'oficio.pdf',
    })
    expect(args.p_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('PDF já enviado numa tentativa anterior segue para a RPC; outro erro de envio para', async () => {
    falso.reiniciar({ rpc: { registrar_exigencia: { data: 'x1' } } })
    const armazenamento = falso.cliente.storage.from()
    armazenamento.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'The resource already exists' },
    } as never)
    await registrarExigencia('c1', 'x1', DADOS, pdf(), 'v1')
    expect(falso.cliente.rpc).toHaveBeenCalledWith('registrar_exigencia', expect.anything())

    falso.reiniciar({ rpc: { registrar_exigencia: { data: 'x1' } } })
    armazenamento.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'Payload too large' },
    } as never)
    await expect(registrarExigencia('c1', 'x1', DADOS, pdf(), 'v1')).rejects.toMatchObject({
      message: 'Payload too large',
    })
    expect(falso.cliente.rpc).not.toHaveBeenCalled()
  })

  it('erro da RPC de registro sobe com o código', async () => {
    falso.reiniciar({
      rpc: { registrar_exigencia: { error: { code: '22023', message: 'prazo_divergente' } } },
    })
    await expect(registrarExigencia('c1', 'x1', DADOS, null, 'v1')).rejects.toMatchObject({
      message: 'prazo_divergente',
    })
  })

  it('edita, responde, anexa, prorroga, atribui, exclui e grava o processo', async () => {
    falso.reiniciar({
      rpc: {
        editar_exigencia: { data: 2 },
        responder_exigencia: { data: 3 },
        anexar_a_exigencia: { data: 'r2' },
        prorrogar_exigencia: { data: 4 },
        atribuir_exigencia: { data: 5 },
        excluir_exigencia: { data: null },
        definir_processo_da_licenca: { data: 8 },
      },
    })
    const e = { id: 'x1', rowVersion: 1 }
    expect(
      await editarExigencia(e, {
        assunto: 'Laudo',
        metaInterna: '2026-11-20',
        numeroOficio: '',
        orgao: 'IMA',
        numeroProcesso: '',
        notas: '',
      }),
    ).toBe(2)
    expect(argumentosDa('editar_exigencia')).toMatchObject({
      p_exigencia_id: 'x1',
      p_row_version: 1,
      p_meta_interna: '2026-11-20',
    })

    expect(
      await responderExigencia(
        'c1',
        'r1',
        'x1',
        {
          protocoladoEm: '2026-11-20',
          protocoladoEmTexto: '20/11/2026',
          protocoloNumero: 'P-1',
          descricao: '',
        },
        pdf(),
        'v2',
      ),
    ).toBe(3)
    expect(argumentosDa('responder_exigencia')).toMatchObject({
      p_resposta_id: 'r1',
      p_protocolo_numero: 'P-1',
      p_caminho: 'c1/exigencia_resposta/v2.pdf',
    })

    expect(await anexarAExigencia('c1', 'r2', 'x1', 'Laudo assinado', pdf(), 'v3')).toBe('r2')
    expect(argumentosDa('anexar_a_exigencia')).toMatchObject({
      p_descricao: 'Laudo assinado',
      p_caminho: 'c1/exigencia_resposta/v3.pdf',
    })

    expect(
      await prorrogarExigencia(
        'c1',
        'r3',
        e,
        {
          prazoNovo: '2026-12-10',
          prazoNovoTexto: '10/12/2026',
          metaInterna: '2026-12-09',
          motivo: 'Ofício de prorrogação',
        },
        null,
        'v4',
      ),
    ).toBe(4)
    expect(argumentosDa('prorrogar_exigencia')).toEqual({
      p_resposta_id: 'r3',
      p_exigencia_id: 'x1',
      p_row_version: 1,
      p_prazo_novo: '2026-12-10',
      p_meta_interna: '2026-12-09',
      p_motivo: 'Ofício de prorrogação',
      p_prazo_novo_texto: '10/12/2026',
    })

    await atribuirExigencia('x1', 'm2', 1)
    expect(argumentosDa('atribuir_exigencia')).toEqual({
      p_exigencia_id: 'x1',
      p_membro_id: 'm2',
      p_row_version: 1,
    })

    await excluirExigencia(e)
    expect(argumentosDa('excluir_exigencia')).toEqual({ p_exigencia_id: 'x1', p_row_version: 1 })

    expect(await definirProcessoDaLicenca('i1', 6, '2026/001')).toBe(8)
    expect(argumentosDa('definir_processo_da_licenca')).toEqual({
      p_instrumento_id: 'i1',
      p_row_version: 6,
      p_numero_processo: '2026/001',
    })
  })

  it('erro de escrita sobe (conflito de versão, sem permissão)', async () => {
    falso.reiniciar({
      rpc: {
        prorrogar_exigencia: { error: { code: 'P0001', message: 'conflito_de_versao' } },
        atribuir_exigencia: { error: { code: '42501', message: 'sem_permissao' } },
      },
    })
    await expect(
      prorrogarExigencia(
        'c1',
        'r1',
        { id: 'x1', rowVersion: 1 },
        { prazoNovo: '2026-12-10', prazoNovoTexto: '', metaInterna: '2026-12-09', motivo: 'm' },
        null,
        'v1',
      ),
    ).rejects.toMatchObject({ message: 'conflito_de_versao' })
    await expect(atribuirExigencia('x1', 'm2', 1)).rejects.toMatchObject({
      message: 'sem_permissao',
    })
  })

  it('histórico: tipos e documento', async () => {
    falso.reiniciar({
      rpc: {
        listar_respostas_da_exigencia: {
          data: [
            {
              id: 'r1',
              tipo: 'prorrogacao',
              protocolo_numero: null,
              protocolado_em: null,
              protocolado_em_texto: null,
              prazo_anterior: '2026-11-23',
              prazo_novo: '2026-12-10',
              prazo_novo_texto: null,
              meta_interna_anterior: '2026-11-23',
              meta_interna_nova: '2026-12-09',
              motivo: 'Pedido aceito',
              descricao: null,
              documento_caminho: 'c1/exigencia_resposta/v1.pdf',
              documento_nome: 'deferimento.pdf',
              registrado_por: 'm1',
              registrado_por_nome: 'Eduardo Karnopp',
              registrado_em: '2026-11-20T12:00:00Z',
            },
          ],
        },
      },
    })
    const [r] = await listarRespostasDaExigencia('x1')
    expect(r).toMatchObject({
      tipo: 'prorrogacao',
      prazoAnterior: '2026-11-23',
      prazoNovo: '2026-12-10',
      documento: { caminho: 'c1/exigencia_resposta/v1.pdf', nome: 'deferimento.pdf' },
    })
  })

  it('licenças do empreendimento com sigla e número', async () => {
    falso.reiniciar({
      tabelas: {
        instrumento: [
          {
            id: 'i1',
            unidade_id: 'u1',
            numero: '4821/2023',
            orgao: 'IMA',
            numero_processo: null,
            tipo: { sigla: 'LAO' },
          },
          {
            id: 'i2',
            unidade_id: 'u2',
            numero: null,
            orgao: null,
            numero_processo: 'P',
            tipo: null,
          },
        ],
      },
    })
    expect(await listarLicencasParaExigencia('e1')).toEqual([
      { id: 'i1', unidadeId: 'u1', rotulo: 'LAO 4821/2023', orgao: 'IMA', numeroProcesso: null },
      { id: 'i2', unidadeId: 'u2', rotulo: 'Licença sem número', orgao: null, numeroProcesso: 'P' },
    ])
  })
})
